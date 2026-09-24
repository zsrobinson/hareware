/*
  the roster compared against the announcements Google Group. The group cannot
  be written or read by software (ADR 0010), so an editor exports its members
  and the comparison runs in the browser.
*/

import { normaliseEmail } from "./match";
import type { Person } from "./records";

/** the domains that auto-add, spelled as the university spells them */
const UNIVERSITY_DOMAINS = ["terpmail.umd.edu", "umd.edu"];

/** where the export comes from; `/u/2/` is one admin's account, so it is left off */
export const GROUP_MEMBERS_URL =
  "https://groups.google.com/g/theumdhare/members";

/**
 * every address in a member export, matched out of the whole file rather than
 * a named column: the columns have changed before, and finding none would read
 * as "everybody is already a member"
 */
export function emailsInExport(csv: string): Set<string> {
  const found = csv.match(/[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/g) ?? [];

  return new Set(found.map(normaliseEmail));
}

/** what the comparison found */
export type GroupDiff = {
  /** on the roster, with an address, and not in the group */
  missing: Person[];
  /** on the roster with no address at all, so nothing reaches them */
  unreachable: Person[];
  /** in the group and on nobody's row: alumni, officers' second accounts, typos */
  strangers: string[];
};

export function compareToGroup(
  roster: Person[],
  inGroup: Set<string>,
): GroupDiff {
  const missing: Person[] = [];
  const unreachable: Person[] = [];
  const claimed = new Set<string>();

  for (const person of roster) {
    const email = normaliseEmail(person.email);

    if (!email) {
      unreachable.push(person);
      continue;
    }

    claimed.add(email);
    if (!inGroup.has(email)) missing.push(person);
  }

  return {
    missing,
    unreachable,
    strangers: [...inGroup].filter((email) => !claimed.has(email)).sort(),
  };
}

/**
 * whether an address needs an invitation rather than a bulk add: google only
 * auto-adds the university's domains. A missing address counts as external
 */
export function isExternalAddress(email: string | null): boolean {
  const domain = normaliseEmail(email).split("@")[1] ?? "";

  return !UNIVERSITY_DOMAINS.includes(domain);
}

/**
 * what is wrong with the address on a row. `outside` is also what a mistyped
 * domain looks like: `terpmial.umd.edu` is a real answer on a real application
 */
export type EmailProblem = "missing" | "malformed" | "outside";

/* deliberately loose: it catches text that cannot be an address, not mail
   that would bounce */
const SHAPED_LIKE_AN_ADDRESS = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function emailProblem(email: string | null): EmailProblem | null {
  if (!email) return "missing";
  if (!SHAPED_LIKE_AN_ADDRESS.test(email)) return "malformed";
  if (isExternalAddress(email)) return "outside";

  return null;
}

/** a row with no address, account, contribution or status: import residue */
export function identifiesNobody(person: Person): boolean {
  return (
    !person.email &&
    !person.discordId &&
    person.contributions === 0 &&
    !person.status
  );
}

/** the roster's unusable addresses, sorted by name; malformed and outside are one list */
export function emailProblems(roster: Person[]): {
  missing: Person[];
  wrongDomain: Person[];
} {
  const sorted = [...roster].sort((a, b) => a.name.localeCompare(b.name));

  return {
    missing: sorted.filter(
      (person) => emailProblem(person.email) === "missing",
    ),
    wrongDomain: sorted.filter((person) => {
      const problem = emailProblem(person.email);
      return problem === "malformed" || problem === "outside";
    }),
  };
}
