import { expect, test } from "vitest";
import {
  ALUM_STATUS,
  DEFAULT_MEMBER_STATUS,
  alumOptionMissing,
  defaultStatus,
} from "./config";

/* standing excludes alumni by this one value, so a rename in notion is flagged */

test("an unread schema is not a claim that the option is gone", () => {
  expect(alumOptionMissing([])).toBe(false);
});

test("options that still hold the alum value are fine", () => {
  expect(alumOptionMissing(["Undergrad", "Grad", ALUM_STATUS])).toBe(false);
});

test("a renamed alum option is reported rather than silently ignored", () => {
  expect(alumOptionMissing(["Undergrad", "Grad", "Alumnus"])).toBe(true);
});

/* notion lists its options alum-first */

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
