import { expect, test } from "vitest";
import type { Corpus } from "./roster";
import { readProfile, readProfilePayload } from "./profile";

const person = (pageId: string, discordId: string | null, name = pageId) => ({
  pageId,
  discordId,
  name,
  email: `${pageId}@example.com`,
  status: "Undergrad",
  contributions: 0,
  noAnnouncements: false,
});

function corpus(over: Partial<Corpus> = {}): Corpus {
  return { people: [], meetings: [], contributions: [], ...over };
}

test("a member sees published contributions and every meeting type in an inclusive range", async () => {
  const bay = person("bay", "42", "Bay Hoffman");
  const result = await readProfile(
    {
      corpus: async () =>
        corpus({
          people: [bay],
          meetings: [
            {
              pageId: "m1",
              name: "GBM",
              date: "2026-01-01",
              type: "General Body",
              attendeeIds: ["bay"],
            },
            {
              pageId: "m2",
              name: "Board",
              date: "2026-01-31",
              type: "Editorial Board",
              attendeeIds: ["bay"],
            },
            {
              pageId: "m3",
              name: "Later",
              date: "2026-02-01",
              type: "Volunteer Event",
              attendeeIds: ["bay"],
            },
          ],
          contributions: [
            {
              pageId: "a1",
              headline: "Both",
              date: "2026-01-15",
              authorIds: ["bay"],
              imageCrewIds: ["bay"],
            },
            {
              pageId: "a2",
              headline: "Outside",
              date: "2025-12-31",
              authorIds: ["bay"],
              imageCrewIds: [],
            },
          ],
        }),
    },
    {
      actorDiscordId: "42",
      editor: false,
      from: "2026-01-01",
      to: "2026-01-31",
    },
  );

  expect(result).toMatchObject({
    status: "ready",
    person: bay,
    possibleDuplicate: false,
  });
  if (result.status !== "ready") throw new Error("expected ready");
  expect(result.attendance.map((entry) => entry.type)).toEqual([
    "General Body",
    "Editorial Board",
  ]);
  expect(result.contributions).toEqual([
    {
      pageId: "a1",
      headline: "Both",
      date: "2026-01-15",
      roles: ["writer", "image"],
    },
  ]);
});

test("identity resolution distinguishes unlinked and ambiguous accounts", async () => {
  const unlinked = await readProfile(
    { corpus: async () => corpus({ people: [person("other", null)] }) },
    { actorDiscordId: "42", editor: false },
  );
  expect(unlinked).toEqual({ status: "unlinked", possibleDuplicate: false });

  const ambiguous = await readProfile(
    {
      corpus: async () =>
        corpus({ people: [person("one", "42"), person("two", "42")] }),
    },
    { actorDiscordId: "42", editor: false },
  );
  expect(ambiguous).toEqual({ status: "ambiguous" });
});

test("only an editor may select another Member and duplicate warnings reuse the roster rule", async () => {
  const people = [
    person("one", "42", "Bay Hoffman"),
    person("two", "84", "bay hoffman"),
  ];
  const deps = { corpus: async () => corpus({ people }) };

  await expect(
    readProfile(deps, {
      actorDiscordId: "42",
      editor: false,
      selectedPageId: "two",
    }),
  ).rejects.toThrow("may not inspect");
  const result = await readProfile(deps, {
    actorDiscordId: "42",
    editor: true,
    selectedPageId: "two",
  });
  expect(result).toMatchObject({
    status: "ready",
    person: people[1],
    possibleDuplicate: true,
  });
});

test("the outward read distinguishes unavailable data from an empty profile", async () => {
  const result = await readProfilePayload(
    {
      corpus: async () => {
        throw new Error("Notion unavailable");
      },
    },
    { actorDiscordId: "42", editor: false },
  );

  expect(result).toEqual({
    status: "unavailable",
    problem: "Notion unavailable",
    statuses: [],
    selectable: [],
  });
});
