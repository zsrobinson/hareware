/*
  the roster's writes, all to Notion (ADR 0010). The decisions are made
  elsewhere; these check only what their own fresh read can show.
*/

import { notion, relationIds } from "~/lib/services/notion/client";
import type { Application } from "./applications";
import {
  MEETING_PROPERTIES,
  MEMBERS_DATA_SOURCE_ID,
  MEMBER_PROPERTIES,
} from "./config";
import { mergeAttendance } from "./attendance";
import type { Person } from "./records";
import { BadRequest } from "./refusal";
import { toPerson, type Page } from "./roster";

type MemberFields = {
  name?: string;
  discordId?: string;
  email?: string | null;
  /** must already be one of notion's options; see `requireStatus` */
  status?: string;
};

/** a page update for the fields given: an absent key is left alone, a `null` email cleared */
export function memberPatch(fields: MemberFields): {
  properties: Record<string, unknown>;
} {
  const patch: Record<string, unknown> = {};

  if (fields.name !== undefined)
    patch[MEMBER_PROPERTIES.name.name] = {
      title: [{ text: { content: fields.name } }],
    };

  if (fields.discordId !== undefined)
    patch[MEMBER_PROPERTIES.discordId.name] = {
      rich_text: [{ text: { content: fields.discordId } }],
    };

  if (fields.email !== undefined)
    patch[MEMBER_PROPERTIES.email.name] = { email: fields.email || null };

  if (fields.status !== undefined)
    patch[MEMBER_PROPERTIES.status.name] = { select: { name: fields.status } };

  return { properties: patch };
}

export async function createMember(
  token: string,
  fields: MemberFields & { name: string },
): Promise<string> {
  const page = (await notion(`pages`, token, {
    parent: { type: "data_source_id", data_source_id: MEMBERS_DATA_SOURCE_ID },
    ...memberPatch(fields),
  })) as { id: string };

  return page.id;
}

/** a row from an application, named by their handle only if they gave no name */
export async function createFromApplication(
  token: string,
  application: Application,
): Promise<string> {
  return createMember(token, {
    name: application.name || application.username,
    discordId: application.discordId,
    email: application.email,
  });
}

export async function updateMember(
  token: string,
  pageId: string,
  fields: MemberFields,
): Promise<void> {
  await notion(`pages/${pageId}`, token, memberPatch(fields), "PATCH");
}

/** an application's discord id onto a row, and its email only if the row has none */
export async function linkApplication(
  token: string,
  person: Person,
  application: Application,
): Promise<void> {
  await updateMember(token, person.pageId, {
    discordId: application.discordId,
    ...(person.email ? {} : { email: application.email }),
  });
}

/**
 * signs people in and out, merged against the meeting's attendees as notion
 * holds them now so another device's taps survive (see `mergeAttendance`).
 * Not a transaction: two writes in the same round trip can still interleave
 */
export async function recordAttendance(
  token: string,
  meetingPageId: string,
  known: string[],
  wanted: string[],
): Promise<string[]> {
  const page = (await notion(`pages/${meetingPageId}`, token)) as Page;
  const property = page.properties?.[MEETING_PROPERTIES.attendees.name];

  if (!property) {
    throw new Error(
      "the meeting's Attendees relation is not readable, so who is already signed in cannot be preserved",
    );
  }

  const merged = mergeAttendance(
    await relationIds(meetingPageId, property, token),
    known,
    wanted,
  );

  await notion(
    `pages/${meetingPageId}`,
    token,
    {
      properties: {
        [MEETING_PROPERTIES.attendees.name]: {
          /* notion accepts the same page twice */
          relation: [...new Set(merged)].map((id) => ({ id })),
        },
      },
    },
    "PATCH",
  );

  return merged;
}

const MERGED_RELATIONS = [
  MEMBER_PROPERTIES.articles.name,
  MEMBER_PROPERTIES.images.name,
  MEMBER_PROPERTIES.attendance.name,
];

/**
 * folds one row into another and trashes it, re-reading both first. The
 * survivor keeps its name and gains the other's relations, and its discord
 * id, email and status only where it had none; two different discord ids are
 * refused. The union is written before the trash, so a failure between them
 * loses nothing
 */
export async function mergeMembers(
  token: string,
  keepId: string,
  dropId: string,
): Promise<void> {
  if (keepId === dropId) return;

  const [keep, drop] = (await Promise.all([
    notion(`pages/${keepId}`, token),
    notion(`pages/${dropId}`, token),
  ])) as [Page, Page];
  const kept = toPerson(keep);
  const dropped = toPerson(drop);

  if (
    kept.discordId &&
    dropped.discordId &&
    kept.discordId !== dropped.discordId
  ) {
    throw new BadRequest(
      "those rows carry different Discord accounts, so they are two people",
    );
  }

  const union: Record<string, unknown> = {};
  for (const name of MERGED_RELATIONS) {
    const keptRelation = keep.properties?.[name];
    const droppedRelation = drop.properties?.[name];
    if (!keptRelation || !droppedRelation) {
      throw new Error(
        `cannot merge: ${name} is not readable, so its contents cannot be preserved`,
      );
    }

    const ids = new Set([
      ...(await relationIds(keepId, keptRelation, token)),
      ...(await relationIds(dropId, droppedRelation, token)),
    ]);

    union[name] = { relation: [...ids].map((id) => ({ id })) };
  }

  const gained = memberPatch({
    ...(kept.discordId || !dropped.discordId
      ? {}
      : { discordId: dropped.discordId }),
    ...(kept.email || !dropped.email ? {} : { email: dropped.email }),
    ...(kept.status || !dropped.status ? {} : { status: dropped.status }),
  });

  await notion(
    `pages/${keepId}`,
    token,
    { properties: { ...union, ...gained.properties } },
    "PATCH",
  );

  await notion(`pages/${dropId}`, token, { in_trash: true }, "PATCH");
}
