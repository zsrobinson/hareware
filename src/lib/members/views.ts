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
import { approvedApplications } from "~/lib/services/discord/join-requests";
import type { Application } from "~/lib/services/discord/join-requests";

import { defaultMeeting, offerableMeetings } from "./kiosk";
import {
  duplicates,
  mismatchedDiscordNames,
  resolveApplications,
  suggestDiscordLinks,
} from "./match";
import type {
  DiscordNameMismatch,
  Duplicate,
  DiscordSuggestion,
  Resolution,
} from "./match";
import { guildMembers } from "~/lib/member";
import type { MeetingRecord, Person } from "./records";
import { meetings, people, statusOptions } from "./roster";
import { alumOptionMissing, FALLBACK_MEMBER_STATUSES } from "./config";

/** the bindings these reads need, so nothing here reaches for a global */
export type ViewEnv = {
  NOTION_TOKEN?: string;
  DISCORD_BOT_TOKEN?: string;
  DB?: D1Database;
};

/**
 * notion's Status options, falling back rather than offering nobody a status.
 *
 * an empty answer means the schema could not be read, which is not the same as
 * notion having no options — `alumMissing` beside it is the loud version of
 * that distinction, and it is computed from the live list, never the fallback
 */
async function statuses(token: string | undefined) {
  const live = token
    ? await statusOptions(token).catch(() => [] as string[])
    : [];

  return {
    live,
    offered: live.length ? live : FALLBACK_MEMBER_STATUSES,
    alumMissing: alumOptionMissing(live),
  };
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
    return { meetings: [], candidates: [], openingId: null, statuses: [] };
  }

  const [roster, calendar, options] = await together([
    () => people(token),
    () => meetings(token),
    () => statuses(token),
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
  /** linked rows whose Notion and current Discord display names differ */
  discordNameMismatches: DiscordNameMismatch[];
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

  let discordProblem: string | null = bot
    ? null
    : "DISCORD_BOT_TOKEN is not set.";

  const [roster, applications, guild, options] = await Promise.all([
    token ? people(token) : Promise.resolve([] as Person[]),
    bot
      ? approvedApplications(bot).catch((thrown: unknown) => {
          discordProblem =
            thrown instanceof Error ? thrown.message : String(thrown);
          return [] as Application[];
        })
      : Promise.resolve([] as Application[]),
    /* one request for the whole server. it needs the Server Members intent and
       answers an empty map without it, which reads here as no suggestions
       rather than as an error: the rest of the page does not depend on it */
    guildMembers(),
    statuses(token),
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
    discordNameMismatches: mismatchedDiscordNames(roster, accounts),
    liveStatuses: options.live,
    alumMissing: options.alumMissing,
    discordProblem,
  };
}
