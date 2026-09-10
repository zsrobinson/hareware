import { afterEach, expect, test, vi } from "vitest";
import { mergeMembers } from "./write";

afterEach(() => vi.unstubAllGlobals());

const env = { NOTION_TOKEN: "secret" } as unknown as Env;

/** a relation as notion puts it inside a page object, cut short or not */
const relation = (ids: string[], hasMore = false) => ({
  type: "relation",
  id: "c%3CLo",
  relation: ids.map((id) => ({ id })),
  ...(hasMore ? { has_more: true } : {}),
});

const page = (over: Record<string, unknown> = {}) => ({
  properties: {
    Articles: relation([]),
    Images: relation([]),
    Attendance: relation([]),
    ...over,
  },
});

/*
  the merge is this page's one irreversible action, run before an election, on
  the records the election is counted from. Notion carries at most 25 entries
  of a relation inside a page object and says so with `has_more` alone — and an
  officer at the weekly editorial board passes 25 attendances inside a year.
  Taking the page's copy writes a truncated union onto the survivor and then
  archives the original, so the twenty-sixth onward are gone with nothing said
*/
test("a truncated relation is read in full before the union is written", async () => {
  const asked: string[] = [];
  let written: Record<string, { relation: { id: string }[] }> | undefined;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      asked.push(String(url));
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null;

      if (init?.method === "PATCH" && body && "properties" in body) {
        written = (body as { properties: typeof written }).properties;
        return new Response("{}");
      }
      if (init?.method === "PATCH") return new Response("{}");

      /* the property item endpoint, which is where the rest of the list is */
      if (String(url).includes("/properties/")) {
        return new Response(
          JSON.stringify({
            /* the whole list, which is what this endpoint answers with: the
               page object's twenty-five were a prefix of it */
            results: [
              { relation: { id: "a1" } },
              { relation: { id: "a2" } },
              { relation: { id: "a3" } },
            ],
            has_more: false,
          }),
        );
      }

      return new Response(
        JSON.stringify(
          String(url).includes("keep")
            ? page({ Attendance: relation(["a1"], true) })
            : page({ Attendance: relation(["b1"]) }),
        ),
      );
    }),
  );

  await mergeMembers(env, "keep", "drop");

  const kept = written!.Attendance.relation.map((one) => one.id);

  expect(kept).toContain("a2");
  expect(kept).toContain("a3");
  expect(kept.sort()).toEqual(["a1", "a2", "a3", "b1"]);
  expect(asked.some((url) => url.includes("/pages/keep/properties/"))).toBe(
    true,
  );
});

/* the extra read is a round trip per relation, so it happens only for the ones
   notion actually cut short */
test("a relation notion answered in full costs no second read", async () => {
  const fetched = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return new Response("{}");
    return new Response(JSON.stringify(page({ Articles: relation(["a1"]) })));
  });
  vi.stubGlobal("fetch", fetched);

  await mergeMembers(env, "keep", "drop");

  expect(
    fetched.mock.calls.filter(([url]) => String(url).includes("/properties/")),
  ).toEqual([]);
});

/* a relation the integration cannot reach is omitted from the payload, which
   is indistinguishable from empty unless the property itself is checked */
test("an unreadable relation refuses the merge rather than emptying it", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return new Response("{}");
      return new Response(
        JSON.stringify({ properties: { Articles: relation([]) } }),
      );
    }),
  );

  await expect(mergeMembers(env, "keep", "drop")).rejects.toThrow(
    /not readable/,
  );
});
