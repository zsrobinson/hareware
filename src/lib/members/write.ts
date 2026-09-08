/*
  the four writes this feature makes, and nothing else.

  every one of them is separated from the decision that led to it: `match.ts`
  works out what should happen and returns it, and these functions do it. That
  is what lets the hard part be tested without a network, and it is also why
  none of these check anything — by the time one is called, the checking is
  done.

  all four write Notion rather than D1. Attendance and identity are the records
  an election rests on, and ADR 0010 keeps them somewhere a club member can
  open and repair without this repository. Nothing here is mirrored anywhere.
*/

import { notion, plainText, relationIds } from "~/lib/services/notion/client";
import type { Application } from "~/lib/services/discord/join-requests";
import {
  MEETING_PROPERTIES,
  MEMBERS_DATA_SOURCE_ID,
  MEMBER_PROPERTIES,
} from "./config";
import { mergeAttendance } from "./attendance";
import type { Person } from "./records";

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
 * notion's write shape for each property, built only for the fields given.
 *
 * an absent key leaves the property alone; an explicit `null` email clears it.
 * the two are different operations and a patch that could not express both
 * would make "we do not know their email" and "they have no email" the same
 */
function properties(fields: MemberFields): Record<string, unknown> {
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

  return patch;
}

/** a new Members row */
export async function createMember(
  env: Env,
  fields: MemberFields & { name: string },
): Promise<string> {
  const page = (await notion(`pages`, env.NOTION_TOKEN!, {
    parent: { type: "data_source_id", data_source_id: MEMBERS_DATA_SOURCE_ID },
    properties: properties(fields),
  })) as { id: string };

  return page.id;
}

/** a new row for somebody the roster has never heard of, from their application */
export async function createFromApplication(
  env: Env,
  application: Application,
): Promise<string> {
  return createMember(env, {
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
  env: Env,
  pageId: string,
  fields: MemberFields,
): Promise<void> {
  await notion(
    `pages/${pageId}`,
    env.NOTION_TOKEN!,
    { properties: properties(fields) },
    "PATCH",
  );
}

/**
 * puts an application's identity onto an existing row.
 *
 * the email is written only when the row has none. someone who typed one
 * address at the kiosk and applied with another has two real addresses, and
 * the one already on the row is the one an editor put there
 */
export async function linkApplication(
  env: Env,
  person: Person,
  application: Application,
): Promise<void> {
  await updateMember(env, person.pageId, {
    discordId: application.discordId,
    ...(person.email ? {} : { email: application.email }),
  });
}

/**
 * who attended a meeting, written onto the meeting.
 *
 * the raw write, replacing the relation. Prefer `recordAttendance` below:
 * this one believes whatever it is handed, so a caller working from a stale
 * list deletes whatever it did not know about.
 *
 * `Attendees` is two-way, so notion mirrors this onto each member's
 * `Attendance` and neither side has to be written twice
 */
export async function setAttendees(
  env: Env,
  meetingPageId: string,
  memberPageIds: string[],
): Promise<void> {
  await notion(
    `pages/${meetingPageId}`,
    env.NOTION_TOKEN!,
    {
      properties: {
        [MEETING_PROPERTIES.attendees.name]: {
          /* deduplicated because notion accepts the same page twice and a
             double-tap on the kiosk is the likeliest way it happens */
          relation: [...new Set(memberPageIds)].map((id) => ({ id })),
        },
      },
    },
    "PATCH",
  );
}

/**
 * the attendees a meeting currently has, straight from notion.
 *
 * read immediately before a write rather than trusted from the page, because
 * the point of reading it is to see what another device did since the page
 * loaded
 */
export async function currentAttendees(
  env: Env,
  meetingPageId: string,
): Promise<string[]> {
  const page = (await notion(`pages/${meetingPageId}`, env.NOTION_TOKEN!)) as {
    properties?: Record<
      string,
      {
        relation?: { id: string }[] | null;
        id?: string;
        has_more?: boolean;
      }
    >;
  };

  const property = page.properties?.[MEETING_PROPERTIES.attendees.name];

  /*
    a relation the integration cannot reach is omitted from the schema and
    reads back as `[]`, which is indistinguishable from an empty meeting. That
    difference matters here: merging against a phantom empty list would delete
    everybody who was already signed in
  */
  if (!property) {
    throw new Error(
      "the meeting's Attendees relation is not readable, so who is already signed in cannot be preserved",
    );
  }

  /*
    notion answers a page with at most 25 entries of a relation and says so
    with `has_more`. Merging against a list cut short at 25 deletes everybody
    after the twenty-fifth, which for a thirty-person general body meeting is
    the whole back half of the room, silently
  */
  if (property.has_more && property.id) {
    return relationIds(meetingPageId, property.id, env.NOTION_TOKEN!);
  }

  return (property.relation ?? []).map((related) => related.id);
}

/**
 * signs people in and out without deleting what another device did.
 *
 * `known` is the list the device held when somebody tapped and `wanted` is
 * what it wants; the difference is the intent, and everything else in notion
 * is somebody else's work. See `~/lib/members/attendance` for why a plain
 * replacement loses attendance silently, and ADR 0010 for why one laptop is
 * still the plan even so.
 *
 * not a transaction. notion has none, so two devices writing inside the same
 * round trip can still interleave. This narrows the window from the length of
 * a meeting to the length of one request, which is the difference between a
 * loss that is likely and one that needs two people to tap in the same second
 */
export async function recordAttendance(
  env: Env,
  meetingPageId: string,
  known: string[],
  wanted: string[],
): Promise<string[]> {
  const merged = mergeAttendance(
    await currentAttendees(env, meetingPageId),
    known,
    wanted,
  );

  await setAttendees(env, meetingPageId, merged);
  return merged;
}

/** the relations a merge has to carry across */
const MERGED_RELATIONS = ["Articles", "Images", "Attendance"] as const;

type RelationProperty = { relation?: { id: string }[] | null };

/**
 * folds one duplicate row into another and archives the empty one.
 *
 * the riskiest write here, and the only destructive one, so it re-reads both
 * rows rather than trusting what a page rendered minutes ago: a merge computed
 * from a stale read would drop whatever was added in between, permanently and
 * silently.
 *
 * the surviving row keeps its own name and status. It gains the other's
 * relations, and its discord id and email only where it had none — a merge
 * should never overwrite something an editor typed.
 *
 * order matters. The union is written to the survivor first and the duplicate
 * archived second, so a failure between the two leaves a row that is merged
 * but not yet tidied, rather than one whose history has been deleted.
 */
export async function mergeMembers(
  env: Env,
  keepId: string,
  dropId: string,
): Promise<void> {
  if (keepId === dropId) return;

  const token = env.NOTION_TOKEN!;
  const [keep, drop] = (await Promise.all([
    notion(`pages/${keepId}`, token),
    notion(`pages/${dropId}`, token),
  ])) as {
    properties: Record<
      string,
      RelationProperty & {
        email?: string | null;
        rich_text?: { plain_text: string }[] | null;
      }
    >;
  }[];

  const union: Record<string, unknown> = {};
  for (const name of MERGED_RELATIONS) {
    const ids = new Set([
      ...(keep!.properties?.[name]?.relation ?? []).map((r) => r.id),
      ...(drop!.properties?.[name]?.relation ?? []).map((r) => r.id),
    ]);

    /*
      a relation the integration cannot reach is omitted from the schema
      entirely and reads back as `[]` — indistinguishable from empty unless
      you check for the property itself. writing the union anyway would
      silently delete every credit on the survivor
    */
    if (!keep!.properties?.[name] || !drop!.properties?.[name]) {
      throw new Error(
        `cannot merge: ${name} is not readable, so its contents cannot be preserved`,
      );
    }

    union[name] = { relation: [...ids].map((id) => ({ id })) };
  }

  const keptId = text(keep!.properties?.[MEMBER_PROPERTIES.discordId.name]);
  const droppedId = text(drop!.properties?.[MEMBER_PROPERTIES.discordId.name]);
  const keptEmail = keep!.properties?.[MEMBER_PROPERTIES.email.name]?.email;
  const droppedEmail = drop!.properties?.[MEMBER_PROPERTIES.email.name]?.email;

  await notion(
    `pages/${keepId}`,
    token,
    {
      properties: {
        ...union,
        ...properties({
          ...(keptId ? {} : droppedId ? { discordId: droppedId } : {}),
          ...(keptEmail ? {} : droppedEmail ? { email: droppedEmail } : {}),
        }),
      },
    },
    "PATCH",
  );

  await notion(`pages/${dropId}`, token, { in_trash: true }, "PATCH");
}

/* `plainText` is the notion client's, and its docstring records that it was
   consolidated out of four files under `articles/` — a fifth copy here would
   have re-opened exactly the problem that consolidation closed */
function text(
  property: { rich_text?: { plain_text: string }[] | null } | undefined,
): string {
  return plainText(property?.rich_text).trim();
}
