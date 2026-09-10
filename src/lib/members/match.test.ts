import { expect, test } from "vitest";
import type { Application } from "~/lib/services/discord/join-requests";
import {
  duplicates,
  nearName,
  resolveApplication,
  safeToCreate,
  suggestDiscordLinks,
} from "./match";
import type { Person } from "./records";

function person(over: Partial<Person> = {}): Person {
  return {
    pageId: "p1",
    name: "Bay Hoffman",
    discordId: null,
    email: null,
    status: null,
    contributions: 0,
    ...over,
  };
}

function application(over: Partial<Application> = {}): Application {
  return {
    id: "1545474779111497810",
    discordId: "574376763006648349",
    username: "bayh",
    name: "Bay Hoffman",
    email: "bay@terpmail.umd.edu",
    gradYear: "2028",
    applied: "2026-09-04",
    ...over,
  };
}

test("a row already carrying the snowflake is linked, and nothing is proposed", () => {
  const mine = person({ discordId: "574376763006648349" });
  const resolution = resolveApplication([mine], application());

  expect(resolution.status).toBe("linked");
});

test("two rows carrying one snowflake is conflicted, never picked between", () => {
  const resolution = resolveApplication(
    [
      person({ pageId: "p1", discordId: "574376763006648349" }),
      person({ pageId: "p2", discordId: "574376763006648349" }),
    ],
    application(),
  );

  expect(resolution.status).toBe("conflicted");
  if (resolution.status === "conflicted")
    expect(resolution.people).toHaveLength(2);
});

test("nobody matching is new, and the cron may create it", () => {
  const resolution = resolveApplication(
    [person({ name: "Ada Vance", email: "ada@terpmail.umd.edu" })],
    application(),
  );

  expect(resolution.status).toBe("new");
  expect(safeToCreate([resolution])).toHaveLength(1);
});

/* the kiosk's whole purpose: somebody typed their name and email at a meeting,
   then applied on discord a week later */
test("an id-less row agreeing on both email and name is confidently linkable", () => {
  const kiosk = person({ name: "bay hoffman", email: "Bay@Terpmail.UMD.edu" });
  const resolution = resolveApplication([kiosk], application());

  expect(resolution.status).toBe("linkable");
  if (resolution.status === "linkable")
    expect(resolution.on).toBe("email and name");
});

test("a name match alone is linkable, and says so", () => {
  const resolution = resolveApplication(
    [person({ email: null })],
    application(),
  );

  expect(resolution.status).toBe("linkable");
  if (resolution.status === "linkable") expect(resolution.on).toBe("name");
});

test("an email match alone is linkable, and says so", () => {
  const resolution = resolveApplication(
    [person({ name: "B. Hoffman", email: "bay@terpmail.umd.edu" })],
    application(),
  );

  expect(resolution.status).toBe("linkable");
  if (resolution.status === "linkable") expect(resolution.on).toBe("email");
});

test("two id-less rows answering to one name is ambiguous", () => {
  const resolution = resolveApplication(
    [person({ pageId: "p1" }), person({ pageId: "p2" })],
    application(),
  );

  expect(resolution.status).toBe("ambiguous");
});

test("a name match and a different email match together are ambiguous", () => {
  const resolution = resolveApplication(
    [
      person({ pageId: "p1", name: "Bay Hoffman", email: null }),
      person({
        pageId: "p2",
        name: "Someone Else",
        email: "bay@terpmail.umd.edu",
      }),
    ],
    application(),
  );

  expect(resolution.status).toBe("ambiguous");
  if (resolution.status === "ambiguous")
    expect(resolution.people).toHaveLength(2);
});

/* overwriting it would move that person's whole history onto the applicant */
test("a row carrying somebody else's id is never a candidate", () => {
  const resolution = resolveApplication(
    [person({ discordId: "999999999999999999" })],
    application(),
  );

  expect(resolution.status).toBe("new");
});

test("nothing but `new` is ever safe for the cron to create", () => {
  const resolutions = [
    resolveApplication([person()], application()),
    resolveApplication(
      [person({ discordId: "574376763006648349" })],
      application(),
    ),
    resolveApplication([], application()),
  ];

  expect(resolutions.map((r) => r.status)).toEqual([
    "linkable",
    "linked",
    "new",
  ]);
  expect(safeToCreate(resolutions)).toHaveLength(1);
});

/*
  the form questions are found by looking for "name" and "email" anywhere in
  the label, which survives a rewording but not a deletion. When one goes, every
  application answers null at once — and a row per applicant, named by their
  Discord handle with no address on it, would be made silently at the top of
  the hour. So it stops and says which answer it wanted
*/
test("an application with no name and no email stops rather than creating a row", () => {
  const resolution = resolveApplication(
    [person({ name: "", email: null })],
    application({ name: null, email: null }),
  );

  expect(resolution.status).toBe("incomplete");
  if (resolution.status === "incomplete")
    expect(resolution.missing).toEqual(["name", "email"]);
});

test("either one missing is enough to stop", () => {
  const noEmail = resolveApplication([], application({ email: null }));
  const noName = resolveApplication([], application({ name: null }));

  expect(noEmail.status).toBe("incomplete");
  if (noEmail.status === "incomplete")
    expect(noEmail.missing).toEqual(["email"]);
  expect(noName.status).toBe("incomplete");
  if (noName.status === "incomplete") expect(noName.missing).toEqual(["name"]);
});

/* a row already carrying the snowflake is a complete answer whatever the form
   said, so the check for missing answers comes after the id */
test("an incomplete application whose account is already on a row reads as linked", () => {
  const resolution = resolveApplication(
    [person({ pageId: "p1", discordId: "574376763006648349" })],
    application({ name: null, email: null }),
  );

  expect(resolution.status).toBe("linked");
});

test("nothing incomplete is ever created automatically", () => {
  expect(
    safeToCreate([resolveApplication([], application({ email: null }))]),
  ).toEqual([]);
});

test("two rows normalising to one name are a duplicate", () => {
  const found = duplicates([
    person({ pageId: "p1", name: "Zoë O'Brien" }),
    person({ pageId: "p2", name: "zoe obrien" }),
  ]);

  expect(found).toHaveLength(1);
  expect(found[0]!.on).toBe("name");
});

/*
  near spellings used to be deliberately left out of this, on the grounds that
  a matcher loose enough to join "Matthew" and "Mathew" joins real members too.
  That reasoning still holds for *linking*, which is why `resolveApplication`
  still refuses them — but it was the wrong call for a page whose entire job is
  to put a question in front of a person.

  `Timur Malamud` and `Timur Malcmud` are two rows on the real roster, one
  letter apart, and nothing here had ever compared them. Their attendance is
  split across both, which is exactly the vote this page exists to protect
*/
test("two rows a letter apart are offered as a possible duplicate", () => {
  const found = duplicates([
    person({ pageId: "p1", name: "Timur Malamud" }),
    person({ pageId: "p2", name: "Timur Malcmud" }),
  ]);

  expect(found).toHaveLength(1);
  expect(found[0]!.on).toBe("near-name");
});

/* the exact finding is the confident one and stays first, so an editor works
   through the certainties before the guesses */
test("an exact match outranks a near one", () => {
  const found = duplicates([
    person({ pageId: "p1", name: "Bay Hoffman" }),
    person({ pageId: "p2", name: "bay hoffman" }),
    person({ pageId: "p3", name: "Bay Hoffmann" }),
  ]);

  expect(found[0]!.on).toBe("name");
  expect(found.some((one) => one.on === "near-name")).toBe(true);
});

/*
  the other way one person becomes two rows: a middle name typed once and not
  the next time. An edit distance will never join these — "andy andromeda vu"
  and "andy vu" are eight edits apart — and this roster collects both spellings
  because one comes from an application and the other from a kiosk
*/
test("a name with a middle part is offered against one without", () => {
  const found = duplicates([
    person({ pageId: "p1", name: "Andy (Andromeda) Vu" }),
    person({ pageId: "p2", name: "Andy Vu" }),
  ]);

  expect(found).toHaveLength(1);
  expect(found[0]!.on).toBe("same-ends");
});

test("two people who merely share a first name are left alone", () => {
  expect(
    duplicates([
      person({ pageId: "p1", name: "Bay Hoffman" }),
      person({ pageId: "p2", name: "Bay Okafor" }),
    ]),
  ).toEqual([]);
});

/* a guess is still never a link. `resolveApplication` keeps refusing these,
   because that one writes without asking anybody */
test("a near name still never resolves an application to a row", () => {
  const resolution = resolveApplication(
    [person({ pageId: "p1", name: "Matthew Reyes" })],
    application({ name: "Mathew Reyes", email: "mathew@terpmail.umd.edu" }),
  );

  expect(resolution.status).toBe("similar");
});

test("two rows sharing an email are a duplicate even under different names", () => {
  const found = duplicates([
    person({
      pageId: "p1",
      name: "Bay Hoffman",
      email: "bay@terpmail.umd.edu",
    }),
    person({ pageId: "p2", name: "Bay H", email: "Bay@terpmail.umd.edu" }),
  ]);

  expect(found).toHaveLength(1);
  expect(found[0]!.on).toBe("email");
});

test("rows sharing both a name and an email are one finding, not two", () => {
  const found = duplicates([
    person({
      pageId: "p1",
      name: "Bay Hoffman",
      email: "bay@terpmail.umd.edu",
    }),
    person({
      pageId: "p2",
      name: "Bay Hoffman",
      email: "bay@terpmail.umd.edu",
    }),
  ]);

  expect(found).toHaveLength(1);
  expect(found[0]!.on).toBe("name");
});

test("empty names and empty emails do not group everybody together", () => {
  expect(
    duplicates([
      person({ pageId: "p1", name: "", email: null }),
      person({ pageId: "p2", name: "", email: null }),
    ]),
  ).toEqual([]);
});

test("a roster with nothing repeated has no duplicates", () => {
  expect(
    duplicates([
      person({
        pageId: "p1",
        name: "Ada Vance",
        email: "ada@terpmail.umd.edu",
      }),
      person({
        pageId: "p2",
        name: "Bay Hoffman",
        email: "bay@terpmail.umd.edu",
      }),
    ]),
  ).toEqual([]);
});

/* the cron would otherwise create the duplicate the reconciler exists to
   prevent, and a duplicate splits attendance and can cost somebody a vote */
test("a name one keystroke away is withheld from the cron rather than created", () => {
  const resolution = resolveApplication(
    [person({ name: "Mathew Reyes", email: null })],
    application({ name: "Matthew Reyes", email: "matt@terpmail.umd.edu" }),
  );

  expect(resolution.status).toBe("similar");
  expect(safeToCreate([resolution])).toEqual([]);
});

test("a near name is not linkable, because one edit is not certainty", () => {
  const resolution = resolveApplication(
    [person({ name: "Mathew Reyes", email: null })],
    application({ name: "Matthew Reyes", email: null }),
  );

  expect(resolution.status).not.toBe("linkable");
});

test("an exact match still wins over a near one", () => {
  const resolution = resolveApplication(
    [
      person({ pageId: "p1", name: "Bay Hoffman", email: null }),
      person({ pageId: "p2", name: "Bay Hofman", email: null }),
    ],
    application({ email: "nobody@terpmail.umd.edu" }),
  );

  expect(resolution.status).toBe("linkable");
  if (resolution.status === "linkable")
    expect(resolution.person.pageId).toBe("p1");
});

test("names further apart than one edit are still new", () => {
  const resolution = resolveApplication(
    [person({ name: "Ada Vance", email: null })],
    application({ name: "Bay Hoffman", email: "bay@terpmail.umd.edu" }),
  );

  expect(resolution.status).toBe("new");
});

test("one edit is one edit, whether inserted, deleted or substituted", () => {
  expect(nearName("matthew", "mathew")).toBe(true);
  expect(nearName("mathew", "matthew")).toBe(true);
  expect(nearName("reyes", "reyez")).toBe(true);
  expect(nearName("bay hoffman", "bay hoffmann")).toBe(true);
});

test("two edits are too many, and an identical name is not 'near'", () => {
  expect(nearName("matthew", "mathews")).toBe(false);
  expect(nearName("bay", "bay")).toBe(false);
  expect(nearName("", "bay")).toBe(false);
  expect(nearName("ada vance", "bay hoffman")).toBe(false);
});

/*
  the third way somebody arrives: already in the server, with a row that has
  never been linked to it. Nothing else on the reconciler reaches these people,
  because applications only carry those who went through the join form
*/
const account = (
  over: Partial<{ id: string; username: string; displayName: string }> = {},
) => ({
  id: "574376763006648349",
  username: "bayh",
  displayName: "Bay",
  ...over,
});

test("a row and an account sharing a name are offered to each other", () => {
  const [suggestion] = suggestDiscordLinks(
    [person({ name: "Bay Hoffman" })],
    [account({ displayName: "Bay Hoffman" })],
  );

  expect(suggestion?.person.name).toBe("Bay Hoffman");
  expect(suggestion?.account.username).toBe("bayh");
});

/* the handle is the name they cannot change, so it is matched too */
test("the discord handle counts as a name as well as the nickname", () => {
  const suggestions = suggestDiscordLinks(
    [person({ name: "bayh" })],
    [account({ displayName: "something else" })],
  );

  expect(suggestions).toHaveLength(1);
});

test("a row that already has an id is not offered another", () => {
  const suggestions = suggestDiscordLinks(
    [person({ name: "Bay Hoffman", discordId: "1" })],
    [account({ displayName: "Bay Hoffman" })],
  );

  expect(suggestions).toEqual([]);
});

/* the account is already somebody's, and offering it again would be offering
   to move that person's contribution history onto this row */
test("an account another row already claims is not offered", () => {
  const suggestions = suggestDiscordLinks(
    [
      person({
        pageId: "p1",
        name: "Ada Vance",
        discordId: "574376763006648349",
      }),
      person({ pageId: "p2", name: "Bay Hoffman" }),
    ],
    [account({ displayName: "Bay Hoffman" })],
  );

  expect(suggestions).toEqual([]);
});

/* the ambiguity ADR 0009 refuses to guess at, from both directions */
test("two accounts that could be one row are not guessed between", () => {
  const suggestions = suggestDiscordLinks(
    [person({ name: "Bay Hoffman" })],
    [
      account({ id: "1", displayName: "Bay Hoffman" }),
      account({ id: "2", username: "bay hoffman", displayName: "Hoff" }),
    ],
  );

  expect(suggestions).toEqual([]);
});

test("two rows that could be one account are not guessed between", () => {
  const suggestions = suggestDiscordLinks(
    [
      person({ pageId: "p1", name: "Bay Hoffman" }),
      person({ pageId: "p2", name: "bay hoffman" }),
    ],
    [account({ displayName: "Bay Hoffman" })],
  );

  expect(suggestions).toEqual([]);
});

/*
  `nearName` withholds a create; it never proposes a link. A suggestion a tired
  officer clicks through is not meaningfully safer than an automatic link, and
  this is the write that moves somebody's whole history
*/
test("a name one edit away is not offered at all", () => {
  const suggestions = suggestDiscordLinks(
    [person({ name: "Matthew Reyes" })],
    [account({ displayName: "Mathew Reyes" })],
  );

  expect(suggestions).toEqual([]);
});

test("a row with no name matches nothing", () => {
  const suggestions = suggestDiscordLinks(
    [person({ name: "   " })],
    [account({ displayName: "   " })],
  );

  expect(suggestions).toEqual([]);
});
