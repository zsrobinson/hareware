import { afterEach, expect, test, vi } from "vitest";

/*
  every route under this folder answers with the roster or writes to it, so
  each one found here must refuse a request with no session before it reads
  anything. A new route that forgets the gate goes red here without anybody
  having to remember to write its test
*/

vi.mock("cloudflare:workers", () => ({
  env: { SESSION_SECRET: "s".repeat(32), NOTION_TOKEN: "secret" },
}));

const routes = import.meta.glob<Record<string, unknown>>([
  "./*.ts",
  "!./*.test.ts",
]);

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "ALL"] as const;

afterEach(() => vi.unstubAllGlobals());

test("finds the routes it is guarding", () => {
  expect(Object.keys(routes).length).toBeGreaterThan(5);
});

test.each(Object.keys(routes))(
  "%s refuses an anonymous request before reading anything",
  async (path) => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);

    const route = await routes[path]!();
    const handlers = METHODS.filter(
      (method) => typeof route[method] === "function",
    );
    expect(handlers.length).toBeGreaterThan(0);

    for (const method of handlers) {
      const response = await (
        route[method] as (context: unknown) => Promise<Response>
      )({
        request: new Request(`https://hareware.test/api/members/${path}`, {
          method: method === "ALL" ? "POST" : method,
          body: method === "GET" ? undefined : "{}",
        }),
      });

      expect(response.status, method).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }

    expect(fetched).not.toHaveBeenCalled();
  },
);
