/*
  deciding which Members row an application belongs to, and which rows are two
  copies of one person.

  ADR 0010 puts a kiosk in the room at general body meetings, and the kiosk
  creates people: somebody attends their first meeting before they ever apply
  on discord, so rows are now born with a name and no snowflake. That is the
  whole reason this file exists — until it, a Members row either carried an id
  or was matched by name at the moment an editor credited it.

  the rule throughout is the one `~/lib/articles/member` already follows: never
  guess. every uncertain outcome is returned for a person to decide on the
  reconciler, and the unattended cron acts on exactly one of them.
*/

import { normaliseName } from "~/lib/articles/member";
import type { Application } from "~/lib/services/discord/join-requests";
import type { Person } from "./standing";

/** an email reduced to what two spellings of one address share */
export function normaliseEmail(email: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * what an application resolves to.
 *
 * six outcomes rather than a match-or-not, because they send a person in
 * different directions and flattening any two of them is how a roster acquires
 * a second copy of somebody
 */
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
  /** nothing matches at all, so a new row is safe */
  | { status: "new"; application: Application }
  /** more than one row carries this snowflake, which is never safe to act on */
  | { status: "conflicted"; application: Application; people: Person[] };

/**
 * which Members row an application belongs to, decided over the whole roster.
 *
 * the whole roster rather than a filtered query, for the reason
 * `matchMembers` gives: the conflicted case only exists if you can see every
 * row, and a query returning the first match cannot tell one row carrying an
 * id from two.
 */
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

  /*
    a row already carrying somebody else's id is not a candidate however well
    its name or email reads. overwriting it would move that person's whole
    contribution history onto this applicant
  */
  const free = people.filter((person) => person.discordId === null);

  const email = normaliseEmail(application.email);
  const name = normaliseName(application.name ?? "");

  const emailMatches = email
    ? free.filter((person) => normaliseEmail(person.email) === email)
    : [];
  const nameMatches = name
    ? free.filter((person) => normaliseName(person.name) === name)
    : [];

  /*
    the confident case, and the one the kiosk is designed to produce: the
    person typed their email at a meeting, applied on discord later with the
    same address, and both spellings of their name agree. nothing weaker than
    this is treated as certain
  */
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

  return { status: "new", application };
}

export function resolveApplications(
  people: Person[],
  applications: Application[],
): Resolution[] {
  return applications.map((application) =>
    resolveApplication(people, application),
  );
}

/**
 * the applications the unattended cron may act on.
 *
 * only `new`, and deliberately only `new`. Everything else — an id that
 * already matches, an email or a name that lands on an id-less row — is a
 * collision, and a collision is exactly where a wrong guess makes two people
 * out of one. The cron has nobody to ask, so it defers rather than deciding.
 *
 * this is also what keeps the kiosk from duplicating anybody: a person who
 * signed in at a meeting and applied afterwards matches on something, so the
 * cron leaves them alone and the reconciler links them.
 */
export function safeToCreate(resolutions: Resolution[]): Application[] {
  return resolutions
    .filter((resolution) => resolution.status === "new")
    .map((resolution) => resolution.application);
}

/**
 * rows that look like the same person twice.
 *
 * a duplicate is not cosmetic here. somebody who attended three general body
 * meetings, typo'd once, holds two attendances on one row and one on another
 * and fails a threshold they met — the error runs toward disenfranchisement,
 * during an election. So the reconciler surfaces these and the standing page
 * refuses to look final while any are outstanding.
 *
 * grouped on signals that are certain rather than on edit distance: an
 * identical normalised name, or an identical email. `normaliseName` already
 * folds case, accents and punctuation, so "Zoë O'Brien" and "zoe obrien" group
 * — and "Matthew" and "Mathew" deliberately do not, because a matcher loose
 * enough to join those is loose enough to join two real members.
 */
export type Duplicate = {
  /** what they share, for a page that has to explain the grouping */
  on: "name" | "email";
  value: string;
  people: Person[];
};

export function duplicates(people: Person[]): Duplicate[] {
  const found = [
    ...group(people, "name", (person) => normaliseName(person.name)),
    ...group(people, "email", (person) => normaliseEmail(person.email)),
  ];

  /*
    two rows sharing both a name and an email are one finding, not two. the
    name grouping is listed first, so it is the one that survives
  */
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
