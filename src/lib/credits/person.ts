/*
  Everyone the archive credits, one record each, built once per archive and
  read wherever a page asks when someone started, what they have done, or
  whether two credits are one person. Two credits are one person when they
  count as the same name, exactly: the Sheet says who a pen name is, and a
  misspelling is fixed in WordPress (ADR 0011), so nothing here guesses.
*/

import { bylineKey, type ArchiveArticle } from "./archive";
import type { Role } from "./labels";

/** one person in one role on one article */
export type Contribution = {
  article: ArchiveArticle;
  role: Role;
  person: string;
  /** the names as printed that the Sheet says are this person: a line can
      print two pen names for one */
  bylines: string[];
};

/** a byline printed for someone, and how many of their contributions it is on */
export type PenName = { byline: string; contributions: number };

export type Person = {
  name: string;
  /** every contribution of theirs, oldest first */
  contributions: Contribution[];
  /** in any role, whatever a page's filters: someone is new once, here */
  first: Contribution;
  latest: Contribution;
  roles: Record<Role, number>;
  /** contributions per section */
  sections: Record<string, number>;
  /** the bylines printed for them, most used first */
  penNames: PenName[];
};

/** an article's contributions: someone credited twice in one role made one */
export function contributionsOn(article: ArchiveArticle): Contribution[] {
  const out: Contribution[] = [];
  const at = new Map<string, Contribution>();
  for (const credit of article.credits)
    for (const { name, byline } of credit.contributors) {
      const key = `${credit.role}\u0000${name}`;
      let contribution = at.get(key);
      if (!contribution) {
        contribution = {
          article,
          role: credit.role,
          person: name,
          bylines: [],
        };
        at.set(key, contribution);
        out.push(contribution);
      }
      if (
        byline &&
        !contribution.bylines.some((b) => bylineKey(b) === bylineKey(byline))
      )
        contribution.bylines.push(byline);
    }
  return out;
}

const oldestFirst = (a: ArchiveArticle, b: ArchiveArticle) =>
  a.publishedAt.localeCompare(b.publishedAt) || a.id - b.id;

const built = new WeakMap<
  readonly ArchiveArticle[],
  ReadonlyMap<string, Person>
>();

/** everyone credited, by name, in the order they first contributed */
export function peopleOf(
  articles: readonly ArchiveArticle[],
): ReadonlyMap<string, Person> {
  const held = built.get(articles);
  if (held) return held;

  const people = new Map<string, Person>();
  /* by person, then by byline as the archive compares them */
  const penNames = new Map<string, Map<string, PenName>>();
  for (const article of [...articles].sort(oldestFirst))
    for (const contribution of contributionsOn(article)) {
      const { person: name, role, bylines } = contribution;
      let person = people.get(name);
      if (!person) {
        person = {
          name,
          contributions: [],
          first: contribution,
          latest: contribution,
          roles: { writer: 0, image: 0, other: 0 },
          sections: {},
          penNames: [],
        };
        people.set(name, person);
      }
      person.contributions.push(contribution);
      person.latest = contribution;
      person.roles[role]++;
      const { section } = article;
      person.sections[section] = (person.sections[section] ?? 0) + 1;
      for (const byline of bylines) {
        const theirs = penNames.get(name) ?? new Map<string, PenName>();
        penNames.set(name, theirs);
        const key = bylineKey(byline);
        const use = theirs.get(key) ?? { byline, contributions: 0 };
        use.contributions++;
        theirs.set(key, use);
      }
    }

  for (const [name, uses] of penNames)
    people.get(name)!.penNames = [...uses.values()].sort(
      (a, b) =>
        b.contributions - a.contributions || a.byline.localeCompare(b.byline),
    );

  built.set(articles, people);
  return people;
}
