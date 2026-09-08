import { expect, test } from "vitest";
import {
  parseProfileLocation,
  profilePagePath,
  profilePath,
  profilePresets,
  selectedProfileRange,
} from "./profile-query-keys";

test("a profile location parses valid member and inclusive dates", () => {
  expect(
    parseProfileLocation(
      new URLSearchParams("member=p2&from=2026-01-01&to=2026-01-31"),
    ),
  ).toEqual({
    valid: true,
    location: { member: "p2", from: "2026-01-01", to: "2026-01-31" },
  });
});

test("an invalid range retains the member while visibly falling back to all time", () => {
  expect(
    parseProfileLocation(
      new URLSearchParams("member=p2&from=2026-02-01&to=2026-01-01"),
    ),
  ).toEqual({ valid: false, location: { member: "p2" } });
});

test("profile locations have canonical page and data paths", () => {
  const location = { member: "p 2", from: "2026-01-01", to: "2026-01-31" };
  expect(profilePagePath(location)).toBe(
    "/profile?member=p+2&from=2026-01-01&to=2026-01-31",
  );
  expect(profilePath(location)).toBe(
    "/api/profile?member=p+2&from=2026-01-01&to=2026-01-31",
  );
});

test("the agreed ranges are concrete and recognizable", () => {
  const presets = profilePresets("2026-09-08");
  expect(presets).toEqual({
    semester: { from: "2026-07-01", to: "2026-12-31" },
    academic: { from: "2026-07-01", to: "2027-06-30" },
    year: { from: "2025-09-09", to: "2026-09-08" },
  });
  expect(selectedProfileRange(presets.semester, presets)).toBe("semester");
  expect(selectedProfileRange({}, presets)).toBe("all");
  expect(
    selectedProfileRange({ from: "2026-08-01", to: "2026-08-31" }, presets),
  ).toBe("custom");
});
