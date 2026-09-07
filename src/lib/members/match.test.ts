import { expect, test } from "vitest";
import type { Application } from "~/lib/services/discord/join-requests";
import {
  duplicates,
  nearName,
  resolveApplication,
  safeToCreate,
} from "./match";
import type { Person } from "./standing";

function person(over: Partial<Person> = {}): Person {
  return {
    pageId: "p1",
    name: "Bay Hoffman",
    discordId: null,
    email: null,
    status: null,
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

test("an application with no answers matches nobody rather than everybody", () => {
  const resolution = resolveApplication(
    [person({ name: "", email: null })],
    application({ name: null, email: null }),
  );

  expect(resolution.status).toBe("new");
});

test("two rows normalising to one name are a duplicate", () => {
  const found = duplicates([
    person({ pageId: "p1", name: "Zoë O'Brien" }),
    person({ pageId: "p2", name: "zoe obrien" }),
  ]);

  expect(found).toHaveLength(1);
  expect(found[0]!.on).toBe("name");
});

test("near spellings are deliberately not grouped", () => {
  expect(
    duplicates([
      person({ pageId: "p1", name: "Matthew Reyes" }),
      person({ pageId: "p2", name: "Mathew Reyes" }),
    ]),
  ).toEqual([]);
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
    application({ email: null }),
  );

  expect(resolution.status).toBe("linkable");
  if (resolution.status === "linkable")
    expect(resolution.person.pageId).toBe("p1");
});

test("names further apart than one edit are still new", () => {
  const resolution = resolveApplication(
    [person({ name: "Ada Vance", email: null })],
    application({ name: "Bay Hoffman", email: null }),
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
