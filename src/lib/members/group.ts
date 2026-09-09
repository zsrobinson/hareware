/*
  the Google Group, which HareWare cannot touch and therefore does not sync.

  the group is where announcements actually reach people, because most students
  have their discord notifications off. it is also unwritable: the Admin SDK
  Directory API wants Workspace administrator credentials on the domain that
  owns the group, the club's group is owned by a consumer gmail account with no
  domain and no admin console, and a Q2 2026 change to how google classifies
  external members narrowed non-admin additions further. There is no supported
  path, so ADR 0010 does not pretend there is one.

  what is left is a comparison. An editor exports the group's members — the
  page has an Export CSV button — hands the file to this page, and it says who
  on the roster is not in it. The file never leaves the browser: the diff is
  two sets of strings, and there is nothing a server would add.

  this replaced a watermark: a day in D1 recording when somebody last pasted
  addresses in, and a list of everyone approved since. Two things were wrong
  with it. It answered "who arrived since we last remembered" rather than "who
  is missing", so anything that fell through — a paste half done, a watermark
  written for a list nobody actually pasted — was invisible and permanent. And
  it was fed by discord applications, so somebody who joined by walking into a
  meeting and signing the kiosk was never in it at all. That is the flow the
  kiosk exists for, and those people simply never got the announcements.

  the export answers the real question every time and remembers nothing.
*/

import type { Person } from "./records";

/** the domains that auto-add, spelled as the university spells them */
const UNIVERSITY_DOMAINS = ["terpmail.umd.edu", "umd.edu"];

/** where the export comes from. `/u/2/` is one admin's account, so it is left off */
export const GROUP_MEMBERS_URL =
  "https://groups.google.com/g/theumdhare/members";

/**
 * every address in a google groups member export.
 *
 * matched out of the whole file rather than read from a named column. The
 * export's columns have changed before and are not ours to depend on, and an
 * importer that quietly finds no column reads as "everybody is already a
 * member" — which is the shape of failure this page exists to end. Anything
 * that looks like an address is one; anything else in the file is ignored.
 *
 * lowercased, because google is case-insensitive about the local part in
 * practice and a roster row typed with a capital would otherwise look missing
 */
export function emailsInExport(csv: string): Set<string> {
  const found = csv.match(/[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/g) ?? [];

  return new Set(found.map((email) => email.trim().toLowerCase()));
}

/** what the comparison found */
export type GroupDiff = {
  /** on the roster, with an address, and not in the group */
  missing: Person[];
  /** on the roster with no address at all, so nothing reaches them */
  unreachable: Person[];
  /** in the group and on nobody's row: alumni, officers' second accounts, typos */
  strangers: string[];
  /**
   * asked not to be added, and not in the group.
   *
   * counted rather than silently skipped. Somebody who left the group on
   * purpose is indistinguishable from somebody never added — that is exactly
   * why the checkbox exists — so a comparison that just dropped them would
   * leave nothing on screen to explain why the numbers do not add up
   */
  optedOut: Person[];
};

/**
 * the roster against the group.
 *
 * four answers rather than one, because each needs something different done
 * about it and a single "missing" list hides the other three. `strangers` is
 * the one that looks like noise and is not: an address in the group matching
 * no row is how a typo in Notion shows up, and it is also the club's alumni,
 * which is why it is listed rather than acted on.
 *
 * pure, and takes the parsed export rather than the file, so the rule is
 * testable without a fixture the size of a member list
 */
export function compareToGroup(
  roster: Person[],
  inGroup: Set<string>,
): GroupDiff {
  const missing: Person[] = [];
  const unreachable: Person[] = [];
  const optedOut: Person[] = [];
  const claimed = new Set<string>();

  for (const person of roster) {
    const email = person.email?.trim().toLowerCase();

    if (!email) {
      /* a row with no address is unreachable whatever it says about
         announcements, and asking somebody for an address is the only thing
         that can be done about it */
      unreachable.push(person);
      continue;
    }

    /* their address still belongs to them, so it is not a stranger's */
    claimed.add(email);
    if (inGroup.has(email)) continue;

    /*
      the checkbox is checked here rather than by filtering the roster before
      it arrives, because the answer differs by which list they land in: an
      opt-out who *is* in the group is neither missing nor a stranger and
      needs no mention, and one who is not is the row this whole flag exists
      to stop being offered
    */
    (person.noAnnouncements ? optedOut : missing).push(person);
  }

  return {
    missing,
    unreachable,
    optedOut,
    strangers: [...inGroup].filter((email) => !claimed.has(email)).sort(),
  };
}

/**
 * whether an address needs an invitation rather than a bulk add.
 *
 * seven of the fifty-one applications measured for ADR 0010 were outside the
 * university's two domains, and google does not auto-add those — they have to
 * be invited and accept. The list flags them rather than dropping them, because
 * an address nobody can add is still an address somebody has to deal with.
 *
 * an address we do not have counts as external. it is not a member of the
 * university's domains on any reading, and a missing email flagged for a human
 * is better than a missing email silently passed over
 */
export function isExternalAddress(email: string | null): boolean {
  const domain = (email ?? "").trim().toLowerCase().split("@")[1] ?? "";

  return !UNIVERSITY_DOMAINS.includes(domain);
}

/**
 * what is wrong with the address on a row, if anything.
 *
 * one function rather than four checks scattered over a page, because the
 * answers are mutually exclusive and an editor reads them as one question:
 * can we reach this person, and is the address the one we expect?
 *
 * - `missing` — nothing to reach them at. Not an error today: most of the
 *   roster predates the kiosk, and those rows carry a byline and nothing else.
 * - `malformed` — text that cannot be an address. Worse than missing, because
 *   the row looks filled in and nothing else on the page questions it.
 * - `outside` — a real address at neither university domain. Google will not
 *   auto-add it to the announcements group, and it is also what a mistyped
 *   `terpmail` looks like: `terpmial.umd.edu` is somebody's real answer on a
 *   real application.
 */
export type EmailProblem = "missing" | "malformed" | "outside";

/*
  deliberately loose. this is not here to decide whether mail would be
  delivered — nothing but sending it can answer that — it is here to catch the
  answers that cannot possibly be addresses, so the rest of the page can trust
  what it is comparing. Anything with one @, something either side, and a dot
  in the domain passes
*/
const SHAPED_LIKE_AN_ADDRESS = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function emailProblem(email: string | null): EmailProblem | null {
  const address = (email ?? "").trim();
  if (!address) return "missing";
  if (!SHAPED_LIKE_AN_ADDRESS.test(address)) return "malformed";
  if (isExternalAddress(address)) return "outside";

  return null;
}

/**
 * a row carrying nothing that could ever identify anybody.
 *
 * no address, no discord account, nothing written, no status. These are import
 * residue: they cannot be matched to an application, cannot be reached, and
 * count toward nothing. Named on the page beside their address problem rather
 * than in a section of their own — the row is already there, and what is
 * unusual about it is one more thing to say about it
 */
export function identifiesNobody(person: Person): boolean {
  return (
    !person.email?.trim() &&
    !person.discordId &&
    person.contributions === 0 &&
    !person.status
  );
}
