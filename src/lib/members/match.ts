/*
  which Members row an application belongs to, and which rows are one person
  twice. Never guesses: every uncertain outcome goes to a person on the
  reconciler, and the cron acts only on `new`. ADR 0009 and ADR 0010.
*/

import type { Application } from "./applications";
import type { Person } from "./records";

/**
 * case, accents, punctuation and spacing folded, and nothing more: "Matthew"
 * and "Mathew" stay two people, because a looser match joins real members
 */
export function normaliseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** an email reduced to what two spellings of one address share */
export function normaliseEmail(email: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

/** what an application resolves to. Each outcome sends a person somewhere different */
export type Resolution =
  /** a row already carries this snowflake; there is nothing to do */
  | { status: "linked"; application: Application; person: Person }
  /** one id-less row is confidently the same human — the reconciler links it */
  | {
      status: "linkable";
      application: Application;
      person: Person;
      /** why we think so, in the words the reconciler prints */
      on: "email and name" | "email" | "name";
    }
  /** several id-less rows could be — a person picks */
  | { status: "ambiguous"; application: Application; people: Person[] }
  /**
   * nothing matches, but an id-less row is one edit away. Too loose to link and
   * unsafe to create over: a duplicate splits somebody's attendance
   */
  | { status: "similar"; application: Application; people: Person[] }
  /**
   * the form gave no name or no email. A reworded or deleted question does this
   * to every application at once, and creating from them would make a row per
   * applicant that nothing can match
   */
  | { status: "incomplete"; application: Application; missing: string[] }
  /** nothing matches at all, so a new row is safe */
  | { status: "new"; application: Application }
  /** more than one row carries this snowflake, which is never safe to act on */
  | { status: "conflicted"; application: Application; people: Person[] };

/** decided over the whole roster: only that can tell one row carrying an id from two */
export function resolveApplication(
  people: Person[],
  application: Application,
): Resolution {
  const byId = people.filter(
    (person) => person.discordId === application.discordId,
  );

  if (byId.length > 1)
    return { status: "conflicted", application, people: byId };
  if (byId.length === 1)
    return { status: "linked", application, person: byId[0]! };

  /* a row carrying somebody else's id is never a candidate: linking over it
     moves their history onto this applicant */
  const free = people.filter((person) => person.discordId === null);

  const email = normaliseEmail(application.email);
  const name = normaliseName(application.name ?? "");

  const missing = [!name && "name", !email && "email"].filter(
    (one): one is string => Boolean(one),
  );
  if (missing.length > 0) return { status: "incomplete", application, missing };

  const emailMatches = free.filter(
    (person) => normaliseEmail(person.email) === email,
  );
  const nameMatches = free.filter(
    (person) => normaliseName(person.name) === name,
  );

  const both = emailMatches.filter((person) => nameMatches.includes(person));
  if (both.length === 1)
    return {
      status: "linkable",
      application,
      person: both[0]!,
      on: "email and name",
    };

  const candidates = unique([...emailMatches, ...nameMatches]);

  if (candidates.length > 1)
    return { status: "ambiguous", application, people: candidates };

  if (candidates.length === 1) {
    const person = candidates[0]!;
    return {
      status: "linkable",
      application,
      person,
      on: emailMatches.includes(person) ? "email" : "name",
    };
  }

  const similar = free.filter((person) =>
    nearName(normaliseName(person.name), name),
  );

  if (similar.length > 0)
    return { status: "similar", application, people: similar };

  return { status: "new", application };
}

/**
 * two normalised names at most one edit apart. Used only to withhold a create
 * or propose a merge, never to link; two edits joins unrelated short names
 */
function nearName(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;

  return editDistanceWithin(a, b, 1);
}

function editDistanceWithin(a: string, b: string, max: number): boolean {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;

  if (i === a.length && i === b.length) return true;
  if (max === 0) return false;

  /* a substitution, a deletion from `a`, a deletion from `b` */
  return (
    editDistanceWithin(a.slice(i + 1), b.slice(i + 1), max - 1) ||
    editDistanceWithin(a.slice(i + 1), b.slice(i), max - 1) ||
    editDistanceWithin(a.slice(i), b.slice(i + 1), max - 1)
  );
}

export function resolveApplications(
  people: Person[],
  applications: Application[],
): Resolution[] {
  return applications.map((application) =>
    resolveApplication(people, application),
  );
}

/** the applications the unattended cron may create rows for: only `new` */
export function safeToCreate(resolutions: Resolution[]): Application[] {
  return resolutions
    .filter(creatable)
    .map((resolution) => resolution.application);
}

/* exhaustive rather than `status === "new"`, so a new arm on `Resolution` is a
   compile error here instead of a create */
function creatable(resolution: Resolution): boolean {
  switch (resolution.status) {
    case "new":
      return true;
    case "linked":
    case "linkable":
    case "similar":
    case "ambiguous":
    case "conflicted":
      return false;
    case "incomplete":
      return false;
  }
}

/**
 * rows that look like one person twice. A duplicate splits somebody's
 * attendance and can cost them a vote, so the standing page will not look
 * final while any are outstanding
 */
export type Duplicate = {
  /** `name` and `email` are exact; `near-name` and `same-ends` are guesses */
  on: "name" | "email" | "near-name" | "same-ends";
  value: string;
  people: Person[];
};

/** first and last of three or more names, so "Mary Kate Ellis" meets "Mary Ellis" */
function firstAndLast(name: string): string {
  const parts = normaliseName(name).split(" ").filter(Boolean);
  if (parts.length < 3) return "";

  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** pairs that are probably one person, offered to a human; some will be wrong */
function nearDuplicates(people: Person[]): Duplicate[] {
  const found: Duplicate[] = [];

  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i]!;
      const b = people[j]!;
      const one = normaliseName(a.name);
      const two = normaliseName(b.name);

      /* an exact match is already a finding, and a louder one */
      if (!one || !two || one === two) continue;

      if (nearName(one, two)) {
        found.push({
          on: "near-name",
          value: `${a.name} · ${b.name}`,
          people: [a, b],
        });
        continue;
      }

      const ends = firstAndLast(a.name) || firstAndLast(b.name);
      const sameEnds =
        firstAndLast(a.name) === ends && firstAndLast(b.name) === ends;
      /* or one carries a middle name and the other does not */
      const oneMiddle = one === ends || two === ends;

      if (ends && (sameEnds || oneMiddle)) {
        found.push({
          on: "same-ends",
          value: `${a.name} · ${b.name}`,
          people: [a, b],
        });
      }
    }
  }

  return found;
}

export function duplicates(people: Person[]): Duplicate[] {
  const found = [
    ...group(people, "name", (person) => normaliseName(person.name)),
    ...group(people, "email", (person) => normaliseEmail(person.email)),
    /* guesses last */
    ...nearDuplicates(people),
  ];

  /* a pair found twice is one finding; the first listed survives */
  const seen = new Set<string>();
  return found.filter((duplicate) => {
    const key = duplicate.people
      .map((person) => person.pageId)
      .sort()
      .join(" ");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function group(
  people: Person[],
  on: Duplicate["on"],
  key: (person: Person) => string,
): Duplicate[] {
  const buckets = new Map<string, Person[]>();

  for (const person of people) {
    const value = key(person);
    if (!value) continue;
    buckets.set(value, [...(buckets.get(value) ?? []), person]);
  }

  return [...buckets]
    .filter(([, members]) => members.length > 1)
    .map(([value, members]) => ({ on, value, people: members }));
}

function unique(people: Person[]): Person[] {
  return [...new Map(people.map((person) => [person.pageId, person])).values()];
}

/** one discord account in the server, as a suggestion needs to see it */
export type GuildAccount = {
  id: string;
  username: string;
  displayName: string;
};

/** a row and the account it looks like, for a human to confirm */
export type DiscordSuggestion = {
  person: Person;
  account: GuildAccount;
};

/**
 * id-less rows whose name exactly matches one account already in the server,
 * for people who never went through the join form. Exact, never fuzzy: a
 * clicked-through suggestion is no safer than an automatic link. Offered only
 * where the match is one to one in both directions
 */
export function suggestDiscordLinks(
  roster: Person[],
  guild: GuildAccount[],
): DiscordSuggestion[] {
  const taken = new Set(
    roster.map((person) => person.discordId).filter(Boolean),
  );
  const free = guild.filter((account) => !taken.has(account.id));

  const named = free.map((account) => ({
    account,
    names: new Set(
      [account.displayName, account.username]
        .map((name) => normaliseName(name))
        .filter(Boolean),
    ),
  }));

  const suggestions: DiscordSuggestion[] = [];
  const proposed = new Map<string, number>();

  for (const person of roster) {
    if (person.discordId) continue;

    const name = normaliseName(person.name);
    if (!name) continue;

    const matches = named.filter((one) => one.names.has(name));
    if (matches.length !== 1) continue;

    const { account } = matches[0]!;
    proposed.set(account.id, (proposed.get(account.id) ?? 0) + 1);
    suggestions.push({ person, account });
  }

  /* and one to one from the account's side */
  return suggestions.filter(
    (suggestion) => proposed.get(suggestion.account.id) === 1,
  );
}

/** how two rows came to be listed together, in the words the pages use */
export const WHY_ALIKE: Record<Duplicate["on"], string> = {
  name: "the same name",
  email: "the same email",
  "near-name": "one letter apart",
  "same-ends": "a middle name on one and not the other",
};

/** whether the pages present a finding as certain */
export const SURE: Record<Duplicate["on"], boolean> = {
  name: true,
  email: true,
  "near-name": false,
  "same-ends": false,
};

/** why an application needs a person to pick its row, in the words the pages use */
export const WHY_UNDECIDED: Record<
  Extract<Resolution, { people: Person[] }>["status"],
  string
> = {
  similar: "too close to call",
  conflicted: "two rows disagree",
  ambiguous: "could be either",
};
