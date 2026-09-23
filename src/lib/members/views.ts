/*
  what each of ADR 0010's pages reads, in one place.

  the pages are server-rendered and their islands re-ask the same question
  after a mutation, so every one of these shapes is written twice: once by the
  `.astro` page that hands it down as `initialData`, and once by the GET route
  under `~/pages/api/members` that answers the refetch. Two copies of "what the
  reconciler shows" would drift, and the way they would drift is the shape this
  repo keeps meeting — a page and its refresh disagreeing about who is on the
  roster, with nothing announcing it.

  so the page and the route both call one function here, and neither knows how
  the answer is assembled. Nothing in this module decides anything: it reads,
  and hands the reads to the pure functions in `kiosk.ts`, `match.ts` and
  `group.ts` that already know what they mean.
*/

import { together } from "~/lib/services/notion/client";
import { approvedApplications, type Application } from "./applications";

import { defaultMeeting, offerableMeetings } from "./kiosk";
import { duplicates, resolveApplications, suggestDiscordLinks } from "./match";
import type {
  Duplicate,
  DiscordSuggestion,
  GuildAccount,
  Resolution,
} from "./match";
import { readGuildMembers } from "~/lib/member";
import type { Profile } from "~/lib/member";
import type { MeetingRecord, Person } from "./records";
import { meetings, people, statusOptions } from "./roster";
import { alumOptionMissing, FALLBACK_MEMBER_STATUSES } from "./config";

/** the bindings these reads need, so nothing here reaches for a global */
type ViewEnv = {
  NOTION_TOKEN?: string;
  DISCORD_BOT_TOKEN?: string;
};

const NO_NOTION = "NOTION_TOKEN is not set, so the roster cannot be read.";

const reason = (thrown: unknown) =>
  thrown instanceof Error ? thrown.message : String(thrown);

/**
 * notion's Status options, falling back rather than offering nobody a status.
 *
 * an unread schema carries its `problem`, so the fallback never passes for
 * notion's answer and `alumMissing` is only computed from a list notion gave
 */
export async function readStatuses(token: string | undefined) {
  const unread = (problem: string) => ({
    live: [] as string[],
    offered: FALLBACK_MEMBER_STATUSES,
    alumMissing: false,
    problem,
  });

  if (!token) return unread(NO_NOTION);

  try {
    const live = await statusOptions(token);
    return {
      live,
      offered: live,
      alumMissing: alumOptionMissing(live),
      problem: null,
    };
  } catch (thrown) {
    return unread(
      `Notion's Status options could not be read, so the ones offered are a fallback: ${reason(thrown)}`,
    );
  }
}

/** everything the kiosk draws, minus the discord pictures the page adds */
export type KioskData = {
  /** already narrowed to the window, newest first */
  meetings: MeetingRecord[];
  /* the roster itself: a Person carries the all-time contribution count the
     picker disambiguates with, read from notion's `Contributions` formula
     rather than from the article corpus */
  candidates: Person[];
  /** the meeting to open on: `asked` where it exists, else today's */
  openingId: string | null;
  statuses: string[];
  /** why part of this could not be read from notion, or null when all of it was */
  notionProblem: string | null;
};

/**
 * the roster and the calendar as the kiosk needs them.
 *
 * `asked` is the `meeting` search param and wins over today's, so a refetch
 * mid-meeting comes back to the one the room is signing into rather than
 * rolling forward onto a meeting nobody is at
 */
export async function kioskData(
  env: ViewEnv,
  today: string,
  asked: string | null,
): Promise<KioskData> {
  const token = env.NOTION_TOKEN;
  if (!token) {
    return {
      meetings: [],
      candidates: [],
      openingId: null,
      statuses: [],
      notionProblem: NO_NOTION,
    };
  }

  const [roster, calendar, options] = await together([
    () => people(token),
    () => meetings(token),
    () => readStatuses(token),
  ]);

  const chosen = calendar.find((meeting) => meeting.pageId === asked);
  const opening = chosen ?? defaultMeeting(calendar, today);

  return {
    /* the past month and everything ahead, plus whatever `?meeting=` named: a
       semester of history in one select is where a mis-tap files tonight's
       room against a meeting last spring */
    meetings: offerableMeetings(calendar, today, opening?.pageId ?? null),
    candidates: roster,
    openingId: opening?.pageId ?? null,
    statuses: options.offered,
    notionProblem: options.problem,
  };
}

export type ReconcilerData = {
  resolutions: Resolution[];
  duplicates: Duplicate[];
  /** rows whose `Status` select is empty, the one field a person maintains */
  unknownStatus: Person[];
  statuses: string[];
  /**
   * the whole roster, for the comparison the browser does itself.
   *
   * the google group cannot be read by software, so an editor exports its
   * members and the page diffs the file against this. Sending the roster and
   * keeping the file in the browser means the export never touches a server
   */
  roster: Person[];
  /** rows that could be linked to an account already in the server */
  discordSuggestions: DiscordSuggestion[];
  /**
   * the whole guild, for the edit dialog's Discord autocomplete.
   *
   * the same read the suggestions come from, so it costs nothing extra: an
   * editor fixing an address on this page can fix a missing account beside it
   */
  guild: GuildAccount[];
  /** notion's live options, named in the banner when the alum one is gone */
  liveStatuses: string[];
  alumMissing: boolean;
  /**
   * why applications could not be read, or null when they could.
   *
   * a state rather than an empty list: "discord said nobody has applied" and
   * "we could not ask discord" are the same empty array, and the reconciler is
   * the page somebody opens the morning of an election
   */
  discordProblem: string | null;
  /** the same, for notion: no token, or a Status schema that could not be read */
  notionProblem: string | null;
};

/**
 * everything waiting for a human, read together.
 *
 * the discord failure is caught on its own read rather than thrown: most of
 * this page does not need discord, and a page that 500s because a bot token
 * expired would take the merge tool down with it
 */
export async function reconcilerData(env: ViewEnv): Promise<ReconcilerData> {
  const token = env.NOTION_TOKEN;
  const bot = env.DISCORD_BOT_TOKEN;

  let applicationProblem: string | null = bot
    ? null
    : "DISCORD_BOT_TOKEN is not set.";
  let guildProblem: string | null = null;

  const [roster, applications, guild, options] = await Promise.all([
    token ? people(token) : Promise.resolve([] as Person[]),
    bot
      ? approvedApplications(bot).catch((thrown: unknown) => {
          applicationProblem = reason(thrown);
          return [] as Application[];
        })
      : Promise.resolve([] as Application[]),
    /* the whole server. suggestions depend on this list, so a
       failed read is preserved as a visible problem rather than interpreted as
       a real empty guild */
    readGuildMembers(bot).catch((thrown: unknown) => {
      guildProblem = reason(thrown);
      return new Map<string, Profile>();
    }),
    readStatuses(token),
  ]);

  const accounts = [...guild].map(([id, profile]) => ({
    id,
    username: profile.username,
    displayName: profile.displayName,
  }));

  return {
    resolutions: resolveApplications(roster, applications),
    duplicates: duplicates(roster),
    unknownStatus: roster.filter((person) => person.status === null),
    statuses: options.offered,
    roster,
    discordSuggestions: suggestDiscordLinks(roster, accounts),
    guild: accounts,
    liveStatuses: options.live,
    alumMissing: options.alumMissing,
    discordProblem:
      [applicationProblem, guildProblem].filter(Boolean).join(" ") || null,
    notionProblem: options.problem,
  };
}
