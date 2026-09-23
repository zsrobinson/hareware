/*
  what each ADR 0010 page shows. The page renders it and its GET route answers
  the island's refetch from the same function, so the two cannot disagree.
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

type ViewEnv = {
  NOTION_TOKEN?: string;
  DISCORD_BOT_TOKEN?: string;
};

const NO_NOTION = "NOTION_TOKEN is not set, so the roster cannot be read.";

const reason = (thrown: unknown) =>
  thrown instanceof Error ? thrown.message : String(thrown);

/**
 * notion's Status options, or the fallback with a `problem` saying so;
 * `alumMissing` only from a list notion gave
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

/** everything the kiosk draws except the discord pictures */
export type KioskData = {
  meetings: MeetingRecord[];
  candidates: Person[];
  /** the meeting to open on: `asked` where it exists, else today's */
  openingId: string | null;
  statuses: string[];
  /** why part of this could not be read from notion */
  notionProblem: string | null;
};

/** `asked` (the `?meeting=` param) wins over today's meeting */
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
  /** rows with no Status */
  unknownStatus: Person[];
  statuses: string[];
  /** the whole roster, for the Google Group comparison the browser runs */
  roster: Person[];
  discordSuggestions: DiscordSuggestion[];
  /** the whole guild, for the edit dialog's Discord autocomplete */
  guild: GuildAccount[];
  /** notion's live options, for the banner when the alum one is gone */
  liveStatuses: string[];
  alumMissing: boolean;
  /** why discord could not be read, so a failure is not an empty list */
  discordProblem: string | null;
  /** the same, for notion */
  notionProblem: string | null;
};

/** discord failures are reported rather than thrown: most of the page does not need it */
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
