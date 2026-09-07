import { expect, test } from "vitest";
import { ALUM_STATUS, alumOptionMissing } from "./config";

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
