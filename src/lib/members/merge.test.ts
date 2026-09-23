import { afterEach, expect, test, vi } from "vitest";
import { mergeMembers } from "./write";

afterEach(() => vi.unstubAllGlobals());

const TOKEN = "secret";

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

/* a relation cut short at 25 must be read in full before the union is written */
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

  await mergeMembers(TOKEN, "keep", "drop");

  const kept = written!.Attendance.relation.map((one) => one.id);

  expect(kept).toContain("a2");
  expect(kept).toContain("a3");
  expect(kept.sort()).toEqual(["a1", "a2", "a3", "b1"]);
  expect(asked.some((url) => url.includes("/pages/keep/properties/"))).toBe(
    true,
  );
});

test("a relation notion answered in full costs no second read", async () => {
  const fetched = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return new Response("{}");
    return new Response(JSON.stringify(page({ Articles: relation(["a1"]) })));
  });
  vi.stubGlobal("fetch", fetched);

  await mergeMembers(TOKEN, "keep", "drop");

  expect(
    fetched.mock.calls.filter(([url]) => String(url).includes("/properties/")),
  ).toEqual([]);
});

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

  await expect(mergeMembers(TOKEN, "keep", "drop")).rejects.toThrow(
    /not readable/,
  );
});

/** a merge's reads answered with these two pages; returns the survivor's patch */
function merging(keep: object, drop: object) {
  const patched = vi.fn();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patched(String(url), JSON.parse(init.body as string));
        return new Response("{}");
      }
      return new Response(
        JSON.stringify(String(url).includes("keep") ? keep : drop),
      );
    }),
  );

  return patched;
}

const discord = (id: string) => ({
  "Discord ID": { rich_text: [{ plain_text: id }] },
});

/* two accounts are two people who share a name */
test("refuses two rows linked to different Discord accounts", async () => {
  const patched = merging(
    page(discord("574376763006648349")),
    page(discord("342850506328117249")),
  );

  await expect(mergeMembers(TOKEN, "keep", "drop")).rejects.toThrow(
    /two people/,
  );
  expect(patched).not.toHaveBeenCalled();
});

test("the survivor gains a status only where it had none", async () => {
  const status = (name: string | null) => ({
    Status: { select: name ? { name } : null },
  });

  const gains = merging(page(status(null)), page(status("Grad")));
  await mergeMembers(TOKEN, "keep", "drop");
  expect(gains.mock.calls[0]![1].properties.Status).toEqual({
    select: { name: "Grad" },
  });

  const keeps = merging(page(status("Undergrad")), page(status("Grad")));
  await mergeMembers(TOKEN, "keep", "drop");
  expect(keeps.mock.calls[0]![1].properties.Status).toBeUndefined();
});
