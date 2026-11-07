import { expect, test } from "vitest";
import { newestTag } from "./build-version.mjs";

test("picks the highest version tag, comparing numbers rather than text", () => {
  const listing = [
    "aaa\trefs/tags/v1.2.0",
    "bbb\trefs/tags/v2.10.0",
    "ccc\trefs/tags/v2.9.3",
    "ddd\trefs/tags/not-a-version",
  ].join("\n");
  expect(newestTag(listing)).toBe("v2.10.0");
});

test("has nothing to say about a remote with no version tags", () => {
  expect(newestTag("")).toBeUndefined();
  expect(newestTag("aaa\trefs/tags/release")).toBeUndefined();
});
