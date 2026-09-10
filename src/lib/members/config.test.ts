import { expect, test } from "vitest";
import {
  ALUM_STATUS,
  DEFAULT_MEMBER_STATUS,
  alumOptionMissing,
  defaultStatus,
} from "./config";

/*
  the Status options are notion's, and the pickers read them live. This one
  value is the exception, because `standing.ts` excludes alumni from voting by
  comparing against it — a rename in notion would enfranchise every alum with
  nothing on screen to say so. So it is checked against the live options and
  the standing page and reconciler say it out loud.
*/

test("an unread schema is not a claim that the option is gone", () => {
  expect(alumOptionMissing([])).toBe(false);
});

test("options that still hold the alum value are fine", () => {
  expect(alumOptionMissing(["Undergrad", "Grad", ALUM_STATUS])).toBe(false);
});

test("a renamed alum option is reported rather than silently ignored", () => {
  expect(alumOptionMissing(["Undergrad", "Grad", "Alumnus"])).toBe(true);
});

/*
  a new member's status, which nobody at the kiosk is going to change. Notion
  returns its options alum-first, so the default is the one thing here that may
  not be read off the front of the list.
*/

test("a new member starts on Undergrad however notion orders its options", () => {
  expect(defaultStatus(["Alum", "Undergrad", "Grad"])).toBe(
    DEFAULT_MEMBER_STATUS,
  );
});

test("a renamed Undergrad falls back to an option that still votes", () => {
  expect(defaultStatus([ALUM_STATUS, "Undergraduate", "Grad"])).toBe(
    "Undergraduate",
  );
});

test("options holding nothing but alumni select nothing at all", () => {
  expect(defaultStatus([ALUM_STATUS])).toBeNull();
  expect(defaultStatus([])).toBeNull();
});
