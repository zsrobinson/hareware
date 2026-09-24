import { afterEach, expect, test, vi } from "vitest";
import { approvedJoinRequests } from "./join-requests";

afterEach(() => vi.unstubAllGlobals());

/* shapes discord actually answered with; the form's meaning is tested in `~/lib/members/applications.test.ts` */

const answer = (body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body))),
  );

/* measured: without the permission this endpoint answers 200 with `{}`, not a 403 */
test("an answer with neither a list nor a count is refused, not read as none", async () => {
  answer({});

  await expect(approvedJoinRequests("token")).rejects.toThrow(
    /neither a list nor a count/,
  );
});

/* the message names the fix */
test("the refusal names the permission that fixes it", async () => {
  answer({});

  await expect(approvedJoinRequests("token")).rejects.toThrow(/Kick Members/);
});

test("a count of zero is a real answer and means nobody", async () => {
  answer({ total: 0 });

  await expect(approvedJoinRequests("token")).resolves.toEqual([]);
});

/* a count with nothing to count is applications we were not given */
test("a count above zero with no list is refused, not read as none", async () => {
  answer({ total: 5 });

  await expect(approvedJoinRequests("token")).rejects.toThrow(
    /counted 5 join requests/,
  );
});

test("an explicit empty list is a real answer too", async () => {
  answer({ guild_join_requests: [] });

  await expect(approvedJoinRequests("token")).resolves.toEqual([]);
});

test("a refusal names the status and keeps the token out of the message", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("missing access", { status: 403 })),
  );

  await expect(approvedJoinRequests("secret-token")).rejects.toThrow(
    /403.*missing access/s,
  );
  await expect(approvedJoinRequests("secret-token")).rejects.not.toThrow(
    /secret-token/,
  );
});

/* from the smallest id on a page, compared as a number: an 18-digit id sorts
   after every 19-digit one as text */
test("paging follows the smallest snowflake, compared as a number", async () => {
  const asked: string[] = [];
  const one = (id: string) => ({ id, user_id: `u${id}` });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(String(url));

      if (asked.length === 1) {
        return new Response(
          JSON.stringify({
            guild_join_requests: [
              /* the 19-digit id is the larger number and the smaller string */
              one("1545474779111497810"),
              one("954474779111497810"),
              ...Array.from({ length: 98 }, (_, at) =>
                one(`16000000000000000${String(at).padStart(2, "0")}`),
              ),
            ],
          }),
        );
      }

      return new Response(JSON.stringify({ guild_join_requests: [] }));
    }),
  );

  await approvedJoinRequests("token");

  expect(asked[1]).toContain("before=954474779111497810");
});

test("a page shorter than the limit is the last one", async () => {
  const fetched = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          guild_join_requests: [{ id: "1", user_id: "u1" }],
        }),
      ),
  );
  vi.stubGlobal("fetch", fetched);

  const requests = await approvedJoinRequests("token");

  expect(requests).toHaveLength(1);
  expect(fetched).toHaveBeenCalledTimes(1);
});
