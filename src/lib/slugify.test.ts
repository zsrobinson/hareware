import { expect, test } from "vitest";
import { slugify } from "./utils";

test("a title becomes a file name a browser will keep", () => {
  expect(slugify("Maryland football auctions off players’ luxury cars")).toBe(
    "maryland-football-auctions-off-players-luxury-cars",
  );
  expect(slugify("Café <em>Testudo</em> &amp; friends!")).toBe(
    "cafe-testudo-friends",
  );
});

test("a title with nothing usable still names the file", () => {
  expect(slugify("’’ —")).toBe("article");
});
