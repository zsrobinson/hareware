// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { StandingTable } from "~/components/standing-table";
import type { Person } from "~/lib/members/records";

afterEach(cleanup);

const person = (pageId: string, name: string): Person => ({
  pageId,
  name,
  discordId: null,
  email: null,
  status: "Undergrad",
  contributions: 0,
});

test("a near-match is explained in words, not by its internal tag", () => {
  render(
    <StandingTable
      corpus={{
        people: [person("p1", "Timur Malamud"), person("p2", "Timur Malcmud")],
        meetings: [],
        contributions: [],
      }}
      today="2026-09-08"
      faces={{}}
    />,
  );

  expect(screen.getByRole("alert").textContent).toContain("(one letter apart)");
});
