/* the Notion rows this domain reads, reduced to the fields it uses. */

export type Person = {
  pageId: string;
  name: string;
  discordId: string | null;
  email: string | null;
  /** as notion spells it: the options are notion's to rename. See `ALUM_STATUS` */
  status: string | null;
  /** articles plus image credits, all time, from notion's formula; 0 when unreadable */
  contributions: number;
};

export type MeetingRecord = {
  pageId: string;
  name: string;
  /** the Eastern `YYYY-MM-DD`, or `""` */
  date: string;
  /** null when unset; such a meeting counts toward nothing */
  type: string | null;
  attendeeIds: string[];
};

export type ContributionRecord = {
  pageId: string;
  headline: string;
  /** the Publication Date's Eastern day */
  date: string;
  authorIds: string[];
  imageCrewIds: string[];
};
