import { expect, test } from "vitest";
import { sortSections } from "./sections";

test("sections follow the paper's order, with anything else after it alphabetically", () => {
  expect(
    sortSections([
      "Uncategorized",
      "Sports",
      "Rabbithole",
      "Archive",
      "News",
      "Entertainment",
      "Features",
    ]),
  ).toEqual([
    "News",
    "Features",
    "Entertainment",
    "Sports",
    "Rabbithole",
    "Archive",
    "Uncategorized",
  ]);
});
