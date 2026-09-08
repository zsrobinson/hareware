import { normaliseName } from "~/lib/articles/member";
import { duplicates, nearName } from "./match";
import type { Profile } from "~/lib/member";
import type { ContributionRecord, MeetingRecord, Person } from "./records";
import { corpus, type Corpus } from "./roster";

export type ProfileRange = { from?: string; to?: string };
export type ProfileRequest = ProfileRange & {
  actorDiscordId: string;
  actorDisplayName?: string;
  actorNickname?: string | null;
  editor: boolean;
  selectedPageId?: string;
};

export type ProfileView =
  | { status: "unlinked"; possibleDuplicate: boolean }
  | { status: "ambiguous" }
  | {
      status: "ready";
      person: Person;
      possibleDuplicate: boolean;
      discordNickname: string | null;
      attendance: MeetingRecord[];
      contributions: Array<
        Pick<ContributionRecord, "pageId" | "headline" | "date"> & {
          roles: ("writer" | "image")[];
        }
      >;
    };

export type ProfileReadDependencies = {
  corpus: () => Promise<Corpus>;
  statuses?: () => Promise<string[]>;
  guildProfiles?: () => Promise<Map<string, Profile>>;
};

export type ProfilePayload = ProfileView & {
  statuses: string[];
  selectable: { pageId: string; name: string }[];
};

const inRange = (date: string, range: ProfileRange) =>
  Boolean(date) &&
  (!range.from || date.slice(0, 10) >= range.from) &&
  (!range.to || date.slice(0, 10) <= range.to);

export async function readProfile(
  deps: ProfileReadDependencies,
  request: ProfileRequest,
): Promise<ProfileView> {
  const records = await deps.corpus();
  const linked = records.people.filter(
    (person) => person.discordId === request.actorDiscordId,
  );
  if (!request.selectedPageId && linked.length > 1)
    return { status: "ambiguous" };

  let person: Person | undefined;
  if (request.selectedPageId) {
    if (!request.editor)
      throw new Error("a member may not inspect another Member");
    person = records.people.find(
      (candidate) => candidate.pageId === request.selectedPageId,
    );
    if (!person) throw new Error("Member not found");
  } else {
    person = linked[0];
  }
  if (!person) {
    const proposed = normaliseName(request.actorDisplayName ?? "");
    const possibleDuplicate =
      Boolean(proposed) &&
      records.people.some((candidate) => {
        const existing = normaliseName(candidate.name);
        return existing === proposed || nearName(existing, proposed);
      });
    return { status: "unlinked", possibleDuplicate };
  }

  const attendance = records.meetings.filter(
    (meeting) =>
      meeting.attendeeIds.includes(person.pageId) &&
      inRange(meeting.date, request),
  );
  const contributions = records.contributions.flatMap((article) => {
    if (!inRange(article.date, request)) return [];
    const roles: ("writer" | "image")[] = [];
    if (article.authorIds.includes(person.pageId)) roles.push("writer");
    if (article.imageCrewIds.includes(person.pageId)) roles.push("image");
    return roles.length
      ? [
          {
            pageId: article.pageId,
            headline: article.headline,
            date: article.date,
            roles,
          },
        ]
      : [];
  });
  const possibleDuplicate = duplicates(records.people).some((group) =>
    group.people.some((candidate) => candidate.pageId === person.pageId),
  );
  const discordNickname = request.selectedPageId
    ? person.discordId
      ? ((await deps.guildProfiles?.())?.get(person.discordId)
          ?.discordNickname ?? null)
      : null
    : (request.actorNickname ?? null);
  return {
    status: "ready",
    person,
    possibleDuplicate,
    discordNickname,
    attendance,
    contributions,
  };
}

export async function readProfilePayload(
  deps: ProfileReadDependencies,
  request: ProfileRequest,
): Promise<ProfilePayload> {
  const [records, statuses] = await Promise.all([
    deps.corpus(),
    deps.statuses?.() ?? Promise.resolve([]),
  ]);
  const view = await readProfile(
    { ...deps, corpus: () => Promise.resolve(records) },
    request,
  );
  return {
    ...view,
    statuses,
    selectable: request.editor
      ? records.people.map(({ pageId, name }) => ({ pageId, name }))
      : [],
  };
}

export const loadProfile = (token: string, request: ProfileRequest) =>
  readProfile({ corpus: () => corpus(token) }, request);
