import { expect, test } from "vitest";
import { withParam } from "./search-params";

const PAGE = "https://hareware.test/attendance";

test("a chosen value survives a reload of the url it wrote", () => {
  const next = withParam(PAGE, "meeting", "abc-123");

  expect(next).toBe("/attendance?meeting=abc-123");
  expect(new URL(next, PAGE).searchParams.get("meeting")).toBe("abc-123");
});

test("choosing again replaces rather than appends", () => {
  const once = withParam(PAGE, "meeting", "one");
  const twice = withParam(new URL(once, PAGE).href, "meeting", "two");

  expect(twice).toBe("/attendance?meeting=two");
});

test("an empty value drops the param and leaves the others alone", () => {
  const url = `${PAGE}?meeting=one&other=keep`;

  expect(withParam(url, "meeting", "")).toBe("/attendance?other=keep");
});
