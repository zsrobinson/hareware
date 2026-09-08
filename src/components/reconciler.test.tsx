// @vitest-environment jsdom

/*
  the Google Group comparison, which is the one part of this page that does its
  work in the browser rather than asking a route for the answer.

  worth a test for exactly that reason: nothing on the server sees the file, so
  nothing on the server can be wrong about it, and the only way to know the
  diff reaches the screen is to hand a page a file and read what it says.
*/

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Reconciler } from "./reconciler";
import type { ReconcilerData } from "~/lib/members/views";
import type { Person } from "~/lib/members/records";

vi.mock("~/lib/notify", () => ({
  notify: { ok: vi.fn(), failed: vi.fn() },
}));

const person = (fields: Partial<Person> & { pageId: string }): Person => ({
  name: "Somebody",
  discordId: null,
  email: null,
  status: "Undergrad",
  contributions: 0,
  ...fields,
});

const initial: ReconcilerData = {
  resolutions: [],
  duplicates: [],
  unknownStatus: [],
  statuses: ["Undergrad", "Grad", "Alum"],
  roster: [
    person({ pageId: "p1", name: "Ana Diaz", email: "ana@terpmail.umd.edu" }),
    person({ pageId: "p2", name: "Ben Okafor", email: "ben@umd.edu" }),
    person({ pageId: "p3", name: "Cass Lin", email: null }),
  ],
  discordSuggestions: [],
  liveStatuses: ["Undergrad", "Grad", "Alum"],
  alumMissing: false,
  discordProblem: null,
};

const EXPORT = `Email address,Nickname,Join date
ana@terpmail.umd.edu,Ana,2026-01-04
graduated@gmail.com,Old Friend,2024-09-01
`;

beforeEach(() => {
  /* the page is seeded by its props and only refetches after a write, so
     nothing here should reach the network. A stub that throws says so loudly */
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("the reconciler asked for something it was given");
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** hands the page an export, the way the file picker does */
async function upload(csv: string) {
  const input = screen.getByLabelText(/Export CSV/);
  const file = new File([csv], "members.csv", { type: "text/csv" });

  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => screen.getByText(/stayed in this browser/));
}

test("nothing is claimed about the group before a file is handed over", () => {
  render(<Reconciler initial={initial} />);

  expect(screen.getByText("Nothing to compare yet.")).toBeTruthy();
  expect(screen.queryByText(/already in the group/)).toBeNull();
});

test("somebody on the roster and not in the export is offered to paste", async () => {
  render(<Reconciler initial={initial} />);
  await upload(EXPORT);

  const blob = screen.getByLabelText(
    "Emails to paste into the group",
  ) as HTMLTextAreaElement;

  expect(blob.value).toBe("ben@umd.edu");
  expect(screen.getByText("Copy 1 addresses")).toBeTruthy();
});

/* the row nothing reaches. filtering these out before counting is the silent
   omission this page exists to end */
test("a row with no address is named rather than counted as present", async () => {
  render(<Reconciler initial={initial} />);
  await upload(EXPORT);

  expect(screen.getByText(/1 person with no email/)).toBeTruthy();
  expect(screen.getByText("Cass Lin")).toBeTruthy();
});

/* alumni, mostly — and typos, which look identical from here */
test("an address in the group that no row claims is reported", async () => {
  render(<Reconciler initial={initial} />);
  await upload(EXPORT);

  expect(screen.getByText(/1 address in the group match/)).toBeTruthy();
});

test("an export holding everybody says so instead of offering a paste", async () => {
  render(<Reconciler initial={initial} />);
  await upload("ana@terpmail.umd.edu, ben@umd.edu");

  expect(
    screen.getByText("Everybody with an address is already in the group."),
  ).toBeTruthy();
});

/* the file is every member's address, and it is read where it was chosen */
test("no request is made to compare a file", async () => {
  render(<Reconciler initial={initial} />);
  await upload(EXPORT);

  expect(fetch).not.toHaveBeenCalled();
});
