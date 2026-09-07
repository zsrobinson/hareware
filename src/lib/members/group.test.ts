import { expect, test } from "vitest";
import type { Application } from "~/lib/services/discord/join-requests";
import { isExternalAddress, pendingForGroup } from "./group";

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

test("a null watermark makes everybody pending", () => {
  const pending = pendingForGroup(
    [application({ applied: "2025-12-04" }), application()],
    null,
  );

  expect(pending).toHaveLength(2);
});

test("an application from before the watermark was already pasted in", () => {
  const pending = pendingForGroup(
    [application({ applied: "2026-08-01" })],
    "2026-09-01",
  );

  expect(pending).toEqual([]);
});

/* an `applied` date has no time on it, so somebody who applies in the evening
   of a day already pasted at noon cannot be told from somebody who was in that
   paste. re-offering the boundary day costs a duplicate google ignores;
   excluding it would lose that person for good */
test("the watermark's own day is offered again rather than risked", () => {
  const pending = pendingForGroup(
    [application({ applied: "2026-09-01" })],
    "2026-09-01",
  );

  expect(pending).toHaveLength(1);
});

test("everyone approved since the watermark is pending, oldest first", () => {
  const pending = pendingForGroup(
    [
      application({ id: "c", applied: "2026-09-06" }),
      application({ id: "a", applied: "2026-09-02" }),
      application({ id: "b", applied: "2026-09-04" }),
      application({ id: "old", applied: "2026-08-30" }),
    ],
    "2026-09-01",
  );

  expect(pending.map((one) => one.id)).toEqual(["a", "b", "c"]);
});

test("pendingForGroup does not reorder the list it was given", () => {
  const applications = [
    application({ id: "b", applied: "2026-09-04" }),
    application({ id: "a", applied: "2026-09-02" }),
  ];

  pendingForGroup(applications, null);

  expect(applications.map((one) => one.id)).toEqual(["b", "a"]);
});

test("a terpmail address auto-adds and is not flagged", () => {
  expect(isExternalAddress("bay@terpmail.umd.edu")).toBe(false);
});

test("a umd.edu address auto-adds and is not flagged", () => {
  expect(isExternalAddress("bay@umd.edu")).toBe(false);
});

test("a gmail address is flagged, because google will not auto-add it", () => {
  expect(isExternalAddress("bay@gmail.com")).toBe(true);
});

test("a domain is matched whole, so a lookalike is still external", () => {
  expect(isExternalAddress("bay@notumd.edu")).toBe(true);
  expect(isExternalAddress("bay@umd.edu.example.com")).toBe(true);
});

test("case and stray whitespace do not make an address external", () => {
  expect(isExternalAddress("  Bay@TerpMail.UMD.edu ")).toBe(false);
});

test("an application with no email at all is flagged for a human", () => {
  expect(isExternalAddress(null)).toBe(true);
});
