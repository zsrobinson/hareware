import { expect, test, vi } from "vitest";
import { assertAnonymous, personal, shared } from "./anonymous";

const check = (
  cacheControl: string | null,
  viewer: Parameters<typeof assertAnonymous>[0]["viewer"],
  dev = true,
) => {
  const headers = new Headers(
    cacheControl ? { "cache-control": cacheControl } : {},
  );
  assertAnonymous({ pathname: "/x", headers, viewer, dev });
  return headers.get("cache-control");
};

test("a private response may render whoever is looking", () => {
  expect(() =>
    check("private, no-store", { session: { id: "1" } }),
  ).not.toThrow();
});

test("a shared cache may not hold a session", () => {
  expect(() =>
    check("public, s-maxage=60", { session: { id: "1" } }),
  ).toThrow();
});

test("a shared cache may not hold a profile either", () => {
  expect(() =>
    check("s-maxage=60", { profile: { displayName: "Z" } }),
  ).toThrow();
});

test("a shared cache may not hold a viewer field this file has never heard of", () => {
  /* `admin` here is a stand-in for whatever a page passes next — the guard
     used to check `session` alone, and missed the role flag beside it that
     drew the editorial nav */
  expect(() => check("public, s-maxage=600", { admin: true })).toThrow();
  expect(() => check("public, s-maxage=600", { somethingNew: "x" })).toThrow();
});

test("an anonymous response may be cached", () => {
  expect(() => check("public, s-maxage=60", null)).not.toThrow();
  expect(() =>
    check("public, s-maxage=60", {
      session: null,
      profile: null,
      admin: false,
    }),
  ).not.toThrow();
});

test("in production it refuses to cache rather than 500ing", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});

  // a page that would leak is downgraded; a 500 for everyone is worse
  expect(check("public, s-maxage=60", { session: { id: "1" } }, false)).toBe(
    "private, no-store",
  );
  vi.restoreAllMocks();
});

test("knows which cache-control values a shared cache acts on", () => {
  expect(shared("public, s-maxage=60")).toBe(true);
  expect(shared("private, no-store")).toBe(false);
  expect(shared(null)).toBe(false);
});

test("counts any viewer detail as personal", () => {
  expect(personal(null)).toBe(false);
  expect(personal({ session: null, profile: null })).toBe(false);
  expect(personal({ session: { discordUserId: "1" } })).toBe(true);
  /* a field nothing here knows about still counts */
  expect(personal({ admin: true })).toBe(true);
});
