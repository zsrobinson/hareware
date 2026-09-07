/*
  the three row shapes this domain reads, and nothing that acts on them.

  they lived in `standing.ts` first, which read as though standing were the
  domain. It is not — ADR 0010 is explicit that standing is a *query* and
  `Members` is the person model — and seven modules were importing the domain's
  types from the one module that merely computes over them.

  each is a Notion row reduced to the fields something here actually uses.
  Reduced rather than mirrored: the point of a projection is that adding a
  property in Notion cannot change what this code means.
*/

import type { MemberStatus } from "./config";

/** a Members row, reduced to what the roster needs */
export type Person = {
  pageId: string;
  name: string;
  discordId: string | null;
  email: string | null;
  /** null when the select is empty, or holds a value notion has but we do not */
  status: MemberStatus | null;
};

/** a Meetings row, reduced likewise */
export type MeetingRecord = {
  pageId: string;
  name: string;
  /** `YYYY-MM-DD`; a row with no date cannot fall in a window and is dropped */
  date: string;
  /** null when the select is empty — such a row counts toward nothing */
  type: string | null;
  /** page ids of the Members related through `Attendees` */
  attendeeIds: string[];
};

/** an Article, reduced to the two credits that count */
export type ContributionRecord = {
  pageId: string;
  headline: string;
  /** the Publication Date. an unpublished article has none and is dropped */
  date: string;
  authorIds: string[];
  imageCrewIds: string[];
};
