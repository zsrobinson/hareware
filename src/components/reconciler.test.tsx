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
import type { ReconcilerData } from "~/lib/members/views";
import type { Person } from "~/lib/members/records";

/*
  imported per test, not once.

  the query client is module scope in the app, because it has to outlive an
  island that `<ClientRouter />` remounts on every navigation. Two tests
  sharing this module share that cache, and `initialData` is only installed
  under a key with no entry — so the second test would silently render the
  first one's roster
*/
let Reconciler: typeof import("./reconciler").Reconciler;

vi.mock("~/lib/notify", () => ({
  notify: { ok: vi.fn(), failed: vi.fn() },
}));

const person = (fields: Partial<Person> & { pageId: string }): Person => ({
  name: "Somebody",
  discordId: null,
  email: null,
  status: "Undergrad",
  contributions: 0,
  noAnnouncements: false,
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
  guild: [],
  liveStatuses: ["Undergrad", "Grad", "Alum"],
  alumMissing: false,
  discordProblem: null,
};

const EXPORT = `Email address,Nickname,Join date
ana@terpmail.umd.edu,Ana,2026-01-04
graduated@gmail.com,Old Friend,2024-09-01
`;

beforeEach(async () => {
  vi.resetModules();
  ({ Reconciler } = await import("./reconciler"));

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
  render(<Reconciler initial={initial} faces={{}} />);

  expect(
    screen.getByText("Choose an export to compare the roster against."),
  ).toBeTruthy();
  expect(screen.queryByText(/already in the group/)).toBeNull();
});

test("somebody on the roster and not in the export is offered to paste", async () => {
  render(<Reconciler initial={initial} faces={{}} />);
  await upload(EXPORT);

  const blob = screen.getByLabelText(
    "Emails to paste into the group",
  ) as HTMLTextAreaElement;

  expect(blob.value).toBe("ben@umd.edu");
  expect(screen.getByText("Copy 1 address")).toBeTruthy();
  /* the person, not only the address: an editor who recognises somebody who
     left the group on purpose can only act on it if the name is on screen */
  expect(screen.getByText("Ben Okafor")).toBeTruthy();
});

/*
  the whole reason the roster carries a flag about this.

  somebody who leaves the group on purpose looks exactly like somebody never
  added, so without this the next comparison offers them again and one paste
  undoes their decision
*/
test("somebody who opted out is left out of the paste, and said to be", async () => {
  render(
    <Reconciler
      initial={{
        ...initial,
        roster: [
          person({
            pageId: "p1",
            name: "Ana Diaz",
            email: "ana@terpmail.umd.edu",
          }),
          person({
            pageId: "p2",
            name: "Ben Okafor",
            email: "ben@umd.edu",
            noAnnouncements: true,
          }),
        ],
      }}
      faces={{}}
    />,
  );
  await upload(EXPORT);

  expect(screen.queryByLabelText("Emails to paste into the group")).toBeNull();
  expect(screen.getByText(/1 member asked not to be added/)).toBeTruthy();
});

/*
  the row nothing reaches. filtering these out before counting is the silent
  omission this page exists to end — but it is counted here and listed once, in
  the email section, rather than named twice on one page
*/
test("a row with no address is counted against the group, not listed twice", async () => {
  render(<Reconciler initial={initial} faces={{}} />);
  await upload(EXPORT);

  expect(screen.getByText(/1 member has no address at all/)).toBeTruthy();
  expect(screen.getAllByText("Cass Lin")).toHaveLength(1);
});

/* the three ways an address can be unusable, in one section: the two that are
   wrong counted in the heading, and the merely empty ones below them */
test("addresses that cannot be right are separated from the ones merely missing", () => {
  render(
    <Reconciler
      initial={{
        ...initial,
        roster: [
          ...initial.roster,
          person({ pageId: "p4", name: "Dud Row", email: "not an address" }),
          person({
            pageId: "p5",
            name: "Typo Person",
            email: "someone@terpmial.umd.edu",
          }),
        ],
      }}
      faces={{}}
    />,
  );

  expect(screen.getByText(/1 address that cannot be delivered/)).toBeTruthy();
  expect(
    screen.getByText(/1 address outside terpmail.umd.edu and umd.edu/),
  ).toBeTruthy();
  expect(screen.getByText(/1 member with no address at all/)).toBeTruthy();
});

/* a row carrying nothing at all is import residue, and saying so beside the
   address beats a section of its own for ten rows */
test("a row with nothing else on it says so", () => {
  render(
    <Reconciler
      initial={{
        ...initial,
        roster: [person({ pageId: "p9", name: "Ghost Row", status: null })],
      }}
      faces={{}}
    />,
  );

  expect(screen.getByText(/nothing else on this row either/)).toBeTruthy();
});

/* a row with a byline and no address is not residue: somebody wrote under it */
test("a row with writing on it is not called empty", () => {
  render(
    <Reconciler
      initial={{
        ...initial,
        roster: [
          person({
            pageId: "p9",
            name: "Wrote Something",
            status: null,
            contributions: 2,
          }),
        ],
      }}
      faces={{}}
    />,
  );

  expect(screen.queryByText(/nothing else on this row either/)).toBeNull();
});

/* alumni, mostly — and typos, which look identical from here */
test("an address in the group that no row claims is reported", async () => {
  render(<Reconciler initial={initial} faces={{}} />);
  await upload(EXPORT);

  expect(screen.getByText(/1 address in the group/)).toBeTruthy();
});

test("an export holding everybody says so instead of offering a paste", async () => {
  render(<Reconciler initial={initial} faces={{}} />);
  await upload("ana@terpmail.umd.edu, ben@umd.edu");

  expect(
    screen.getByText("Everybody with an address is already in the group."),
  ).toBeTruthy();
});

/* the file is every member's address, and it is read where it was chosen */
test("no request is made to compare a file", async () => {
  render(<Reconciler initial={initial} faces={{}} />);
  await upload(EXPORT);

  expect(fetch).not.toHaveBeenCalled();
});
