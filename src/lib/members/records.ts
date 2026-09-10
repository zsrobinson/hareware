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

/** a Members row, reduced to what the roster needs */
export type Person = {
  pageId: string;
  name: string;
  discordId: string | null;
  email: string | null;
  /*
    whatever Notion's Status select says, or null when it is empty.

    kept as Notion spells it rather than narrowed to a union: the options are
    Notion's to rename, and coercing an unrecognised one to null would move
    everybody into "we do not know" the day somebody edited a label. The one
    value any rule depends on is `ALUM_STATUS`
  */
  status: string | null;
  /*
    articles plus image credits, all time, as notion's `Contributions` formula
    computes it. Zero where the property is missing or not a number, because a
    roster row that cannot be counted is a row with nothing to show, not a NaN
    on the kiosk.

    all time is the only thing it can be. `standing.ts` counts contributions
    inside a window and has to keep reading articles for it
  */
  contributions: number;
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
