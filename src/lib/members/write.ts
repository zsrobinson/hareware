/*
  the four writes this feature makes, and nothing else.

  every one of them is separated from the decision that led to it: `match.ts`
  works out what should happen and returns it, and these functions do it. That
  is what lets the hard part be tested without a network. What these check is
  only what the fresh read they make before writing can show.

  all four write Notion rather than D1. Attendance and identity are the records
  an election rests on, and ADR 0010 keeps them somewhere a club member can
  open and repair without this repository. Nothing here is mirrored anywhere.
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

/** what a Members row is made of, in notion's write shapes */
type MemberFields = {
  name?: string;
  discordId?: string;
  email?: string | null;
  /* one of notion's own select options, checked against the live schema by the
     route rather than against a list in here */
  status?: string;
};

/**
 * notion's write shape for each property, built only for the fields given, as
 * the body of a page update.
 *
 * an absent key leaves the property alone; an explicit `null` email clears it.
 * the two are different operations and a patch that could not express both
 * would make "we do not know their email" and "they have no email" the same
 */
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

  /* notion's native email property, which takes a bare string rather than a
     rich-text array — the one property here that does */
  if (fields.email !== undefined)
    patch[MEMBER_PROPERTIES.email.name] = { email: fields.email || null };

  if (fields.status !== undefined)
    patch[MEMBER_PROPERTIES.status.name] = { select: { name: fields.status } };

  return { properties: patch };
}

/** a new Members row */
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

/** a new row for somebody the roster has never heard of, from their application */
export async function createFromApplication(
  token: string,
  application: Application,
): Promise<string> {
  return createMember(token, {
    /* their discord handle only if they left the name blank — which none of
       the fifty-one applications measured for ADR 0010 did, but a row named
       after a username is repairable and a row named `""` is invisible */
    name: application.name || application.username,
    discordId: application.discordId,
    email: application.email,
  });
}

/** changes to an existing row */
export async function updateMember(
  token: string,
  pageId: string,
  fields: MemberFields,
): Promise<void> {
  await notion(`pages/${pageId}`, token, memberPatch(fields), "PATCH");
}

/**
 * puts an application's identity onto an existing row.
 *
 * the email is written only when the row has none. someone who typed one
 * address at the kiosk and applied with another has two real addresses, and
 * the one already on the row is the one an editor put there
 */
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
 * signs people in and out without deleting what another device did.
 *
 * `known` is the list the device held when somebody tapped and `wanted` is
 * what it wants; the difference is the intent, and everything else in notion
 * is somebody else's work. The meeting's attendees are read immediately
 * before the write for that reason. See `~/lib/members/attendance` for why a
 * plain replacement loses attendance silently, and ADR 0010 for why one laptop
 * is still the plan even so.
 *
 * not a transaction. notion has none, so two devices writing inside the same
 * round trip can still interleave. This narrows the window from the length of
 * a meeting to the length of one request, which is the difference between a
 * loss that is likely and one that needs two people to tap in the same second.
 *
 * `Attendees` is two-way, so notion mirrors this onto each member's
 * `Attendance` and neither side has to be written twice
 */
export async function recordAttendance(
  token: string,
  meetingPageId: string,
  known: string[],
  wanted: string[],
): Promise<string[]> {
  const page = (await notion(`pages/${meetingPageId}`, token)) as Page;
  const property = page.properties?.[MEETING_PROPERTIES.attendees.name];

  /*
    a relation the integration cannot reach is omitted from the schema and
    reads back as `[]`, which is indistinguishable from an empty meeting.
    Merging against that phantom empty list would delete everybody who was
    already signed in
  */
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
          /* deduplicated because notion accepts the same page twice and a
             double-tap on the kiosk is the likeliest way it happens */
          relation: [...new Set(merged)].map((id) => ({ id })),
        },
      },
    },
    "PATCH",
  );

  return merged;
}

/** the relations a merge has to carry across */
const MERGED_RELATIONS = [
  MEMBER_PROPERTIES.articles.name,
  MEMBER_PROPERTIES.images.name,
  MEMBER_PROPERTIES.attendance.name,
];

/**
 * folds one duplicate row into another and archives the empty one.
 *
 * the riskiest write here, and the only destructive one, so it re-reads both
 * rows rather than trusting what a page rendered minutes ago: a merge computed
 * from a stale read would drop whatever was added in between, permanently and
 * silently.
 *
 * the surviving row keeps its own name. It gains the other's relations, and
 * its discord id, email and status only where it had none — a merge should
 * never overwrite something an editor typed. Two different discord ids are
 * two people, and are refused.
 *
 * order matters. The union is written to the survivor first and the duplicate
 * archived second, so a failure between the two leaves a row that is merged
 * but not yet tidied, rather than one whose history has been deleted.
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
    /*
      a relation the integration cannot reach is omitted from the schema
      entirely and reads back as `[]` — indistinguishable from empty unless
      you check for the property itself. writing the union anyway would
      silently delete every credit on the survivor
    */
    const keptRelation = keep.properties?.[name];
    const droppedRelation = drop.properties?.[name];
    if (!keptRelation || !droppedRelation) {
      throw new Error(
        `cannot merge: ${name} is not readable, so its contents cannot be preserved`,
      );
    }

    /*
      and a relation notion cut short at 25 is the same deletion wearing a
      different hat: an officer at the weekly editorial board passes 25
      attendances inside a year. A truncated union written onto the survivor
      before the original is archived is this page's one irreversible action,
      performed on the records an election is counted from
    */
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
