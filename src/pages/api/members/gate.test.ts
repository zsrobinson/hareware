import { afterEach, expect, test, vi } from "vitest";

/* every route found here must refuse an anonymous request before reading
   anything, so a new route that skips the gate goes red without a test of its own */

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
