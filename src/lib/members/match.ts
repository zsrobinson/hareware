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
import type { Person } from "./records";

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
  /**
   * nothing matches, but an id-less row is one keystroke away from matching.
   *
   * not linkable — `normaliseName` deliberately keeps "Matthew" and "Mathew"
   * apart, because a matcher loose enough to join them joins real members too.
   * But it is not safe to *create* over either: doing so makes exactly the
   * duplicate the reconciler exists to catch, and a duplicate splits somebody's
   * attendance and can cost them a vote. So the cron stops and a person decides
   */
  | { status: "similar"; application: Application; people: Person[] }
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

  const similar = name
    ? free.filter((person) => nearName(normaliseName(person.name), name))
    : [];

  if (similar.length > 0)
    return { status: "similar", application, people: similar };

  return { status: "new", application };
}

/**
 * whether two normalised names differ by at most one keystroke.
 *
 * used only to *withhold* a create, never to link: a false positive costs
 * somebody one click on the reconciler, where a false negative costs a member
 * their vote. That asymmetry is why the threshold is loose here and strict in
 * `resolveApplication`'s equality check above.
 *
 * one edit, not two. "Matthew"/"Mathew" and "Reyes"/"Reyez" are the misspellings
 * that actually happen when somebody types their own name at a kiosk; two edits
 * starts joining unrelated short names
 */
export function nearName(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;

  return editDistanceWithin(a, b, 1);
}

/**
 * whether `a` and `b` are within `max` edits, without computing the full
 * distance — the matrix is wasted work when the answer is a yes/no at one.
 *
 * walks both strings together and, at the first difference, tries the three
 * edits that could repair it. `max` is a parameter only so the recursion can
 * spend one and recurse; callers pass 1
 */
function editDistanceWithin(a: string, b: string, max: number): boolean {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;

  if (i === a.length && i === b.length) return true;
  if (max === 0) return false;

  /* a substitution, a deletion from `a`, and a deletion from `b` — the three
     single edits that can reconcile a first difference */
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
    .filter(creatable)
    .map((resolution) => resolution.application);
}

/**
 * whether the cron may act on one resolution, decided by an exhaustive switch.
 *
 * a switch rather than `status === "new"` so that **adding an arm to
 * `Resolution` is a compile error here**. `similar` was added late, precisely
 * because the cron was creating duplicates it should have deferred, and an
 * equality test would have let the next arm through in silence. The safe
 * default has to be enforced by the type checker, not remembered
 */
function creatable(resolution: Resolution): boolean {
  switch (resolution.status) {
    case "new":
      return true;
    /* every collision. named individually rather than caught by a default, so
       the compiler asks about the next one */
    case "linked":
    case "linkable":
    case "similar":
    case "ambiguous":
    case "conflicted":
      return false;
  }
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

/** whether the Reconciler's existing duplicate rule includes this Member */
export function appearsInDuplicates(
  person: Person,
  findings: Duplicate[],
): boolean {
  return findings.some((finding) =>
    finding.people.some((candidate) => candidate.pageId === person.pageId),
  );
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

/** a linked Member whose database and current server names do not agree */
export type DiscordNameMismatch = {
  person: Person;
  account: GuildAccount;
};

/**
 * Linked Members whose current Discord display names differ from Notion.
 *
 * Deliberately exact after the shared normalization: decoration such as a fun
 * nickname remains visible for an editor to notice, but this finding never
 * decides or changes anything.
 */
export function mismatchedDiscordNames(
  roster: Person[],
  guild: GuildAccount[],
): DiscordNameMismatch[] {
  const accounts = new Map(guild.map((account) => [account.id, account]));

  return roster.flatMap((person) => {
    if (!person.discordId) return [];
    const account = accounts.get(person.discordId);
    if (
      !account ||
      normaliseName(person.name) === normaliseName(account.displayName)
    )
      return [];

    return [{ person, account }];
  });
}

/**
 * roster rows that could be linked to somebody already in the server.
 *
 * the third way people arrive, and the one nothing else covers. Applications
 * only carry people who went through the join form, so anybody who joined
 * before member verification, or was invited straight in, has a discord
 * account and a Members row that have never met. Until they are linked, their
 * face does not appear beside their name and a second row for them looks like
 * a stranger rather than a duplicate.
 *
 * exact on the normalised name, and never fuzzy. `nearName` exists to withhold
 * a create, not to propose a link: writing a snowflake onto the wrong row
 * moves that person's whole contribution history onto somebody else, and a
 * suggestion a tired officer clicks through is not meaningfully safer than an
 * automatic link.
 *
 * a suggestion is offered only where the match is one to one in both
 * directions. Two accounts that could be one row, or two rows that could be
 * one account, are exactly the ambiguity ADR 0009 refuses to guess at, and
 * they are left for the duplicates section and a human
 */
export function suggestDiscordLinks(
  roster: Person[],
  guild: GuildAccount[],
): DiscordSuggestion[] {
  const taken = new Set(
    roster.map((person) => person.discordId).filter(Boolean),
  );
  const free = guild.filter((account) => !taken.has(account.id));

  /* every spelling an account answers to: the server nickname somebody set,
     and the handle they cannot change */
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
    /* one row, one account, or nobody decides anything */
    if (matches.length !== 1) continue;

    const { account } = matches[0]!;
    proposed.set(account.id, (proposed.get(account.id) ?? 0) + 1);
    suggestions.push({ person, account });
  }

  /* and the same test from the account's side: two rows named alike would
     otherwise both offer to take the one account */
  return suggestions.filter(
    (suggestion) => proposed.get(suggestion.account.id) === 1,
  );
}
