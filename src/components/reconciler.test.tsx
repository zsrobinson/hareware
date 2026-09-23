// @vitest-environment jsdom

/*
  the Google Group comparison, which is the one part of this page that does its
  work in the browser rather than asking a route for the answer.

  worth a test for exactly that reason: nothing on the server sees the file, so
  nothing on the server can be wrong about it, and the only way to know the
  diff reaches the screen is to hand a page a file and read what it says.
*/

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
let notify: typeof import("~/lib/notify").notify;

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
  guild: [],
  liveStatuses: ["Undergrad", "Grad", "Alum"],
  alumMissing: false,
  discordProblem: null,
  notionProblem: null,
};

const EXPORT = `Email address,Nickname,Join date
ana@terpmail.umd.edu,Ana,2026-01-04
graduated@gmail.com,Old Friend,2024-09-01
`;

beforeEach(async () => {
  vi.resetModules();
  ({ Reconciler } = await import("./reconciler"));
  ({ notify } = await import("~/lib/notify"));

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

/*
  a row can be in more than one section at once, and usually is: somebody with
  no Discord account and a gmail address is work in two places. So every query
  about a list says which section it means
*/
function section(title: string) {
  return heading(title).closest("section")!;
}

/** a section's heading, whose name also carries its count */
function heading(title: string) {
  return screen.getByRole("heading", {
    name: (name) => name.replace(/\s*\d+$/, "") === title,
  });
}

/** hands the page an export, the way the file picker does */
async function upload(csv: string, name = "members.csv") {
  const input = screen.getByLabelText(/Export CSV/);
  const file = new File([csv], name, { type: "text/csv" });

  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() =>
    screen.getByText(new RegExp(`${name}, which stayed in this browser`)),
  );
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * the routes, as far as the page can tell: a re-read answers `read()`, and a
 * write answers `write(path)`. Returns what was written, in order
 */
function serve(read: () => ReconcilerData, write: (path: string) => Response) {
  const posted: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method !== "POST") return json(read());
      posted.push({
        path: String(input),
        body: JSON.parse(init.body as string) as unknown,
      });
      return write(String(input));
    }),
  );
  return posted;
}

test("nothing is claimed about the group before a file is handed over", () => {
  render(<Reconciler initial={initial} faces={{}} />);

  /* the picker is still there, which is the point: a section that hid itself
     when it had nothing to report would hide the only control that produces a
     report */
  expect(screen.getByLabelText(/Export CSV/)).toBeTruthy();
  expect(screen.queryByText(/in the group/)).toBeNull();
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
  expect(
    within(section("Missing from Google Group")).getByText("Ben Okafor"),
  ).toBeTruthy();
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
  /* and points at a section that exists */
  expect(
    screen.getByText(/They are listed under Missing email field\./),
  ).toBeTruthy();
  /* counted beside the group, and named once under Missing email field */
  expect(
    within(section("Missing from Google Group")).queryByText("Cass Lin"),
  ).toBeNull();
  expect(
    within(section("Missing email field")).getByText("Cass Lin"),
  ).toBeTruthy();
});

/* text that is not an address and an address at the wrong domain */
test("an unusable address and an outside one share a section", () => {
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

  /* one section for both, because the fix and the question are the same */
  const wrong = within(section("Incorrect email domain"));

  expect(wrong.getByText("Typo Person")).toBeTruthy();
  expect(wrong.getByText("Dud Row")).toBeTruthy();
  /* and the one that is not an address at all says so, since "gmail" and
     "not an address" are the same section but not the same problem */
  expect(wrong.getByText("not an address at all")).toBeTruthy();
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
    screen.getByText("Everybody with an address is in the group"),
  ).toBeTruthy();
});

/* the file is every member's address, and it is read where it was chosen */
test("no request is made to compare a file", async () => {
  render(<Reconciler initial={initial} faces={{}} />);
  await upload(EXPORT);

  expect(fetch).not.toHaveBeenCalled();
});

/*
  the questions are found by looking for "name" and "email" anywhere in the
  label. Rewording one survives that; deleting one does not, and then every
  application answers null at once. The cron refuses to create rows from those,
  so the page has to be able to.
*/
test("an application the form gave nothing for is added by hand", async () => {
  const posted: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      posted.push({
        path: String(path),
        body: JSON.parse(
          typeof init?.body === "string" ? init.body : "{}",
        ) as Record<string, unknown>,
      });
      if (init?.method !== "POST") {
        return new Response(JSON.stringify(initial), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ summary: "created a row" }), {
        headers: { "content-type": "application/json" },
      });
    }),
  );

  render(
    <Reconciler
      initial={{
        ...initial,
        resolutions: [
          {
            status: "incomplete",
            missing: ["name", "email"],
            application: {
              id: "a1",
              discordId: "d1",
              username: "someone",
              name: null,
              email: null,
              gradYear: null,
              applied: "2026-09-08",
            },
          },
        ],
      }}
      faces={{}}
    />,
  );

  expect(screen.getByText("the form gave no name or email")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Ada Vance" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "ada@terpmail.umd.edu" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add member" }));

  await waitFor(() => expect(posted).not.toHaveLength(0));

  /* the snowflake goes with it, so the row is linked by the same write that
     creates it and no second pass has to match them up */
  expect(posted[0]!.path).toBe("/api/members/create");
  expect(posted[0]!.body).toMatchObject({
    name: "Ada Vance",
    email: "ada@terpmail.umd.edu",
    discordId: "d1",
  });
});

test("a section's heading holds its toggle rather than sitting inside it", () => {
  render(<Reconciler initial={initial} faces={{}} />);

  const title = heading("Missing email field");

  expect(title.closest("button")).toBeNull();
  expect(within(title).getByRole("button")).toBeTruthy();
});

test("the group's section has no count until a file is handed over", async () => {
  render(<Reconciler initial={initial} faces={{}} />);

  const count = () =>
    within(heading("Missing from Google Group")).queryByText(/^\d+$/);

  expect(count()).toBeNull();

  await upload(EXPORT);

  expect(count()?.textContent).toBe("1");
});

test("a different export is not called copied", async () => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  });
  render(<Reconciler initial={initial} faces={{}} />);
  await upload(EXPORT);

  fireEvent.click(screen.getByRole("button", { name: "Copy 1 address" }));
  await waitFor(() => screen.getByRole("button", { name: "Copied" }));

  await upload("graduated@gmail.com", "later.csv");

  expect(screen.getByRole("button", { name: "Copy 2 addresses" })).toBeTruthy();
});

test("a file the browser cannot read says so", async () => {
  render(<Reconciler initial={initial} faces={{}} />);

  const file = new File([""], "broken.csv", { type: "text/csv" });
  file.text = () => Promise.reject(new Error("the disk said no"));
  fireEvent.change(screen.getByLabelText(/Export CSV/), {
    target: { files: [file] },
  });

  await waitFor(() =>
    expect(notify.failed).toHaveBeenCalledWith(
      expect.stringContaining("the disk said no"),
    ),
  );
});

const unsorted = person({ pageId: "p7", name: "Nell Price", status: null });

test("a write that failed can be tried again", async () => {
  const data = { ...initial, roster: [unsorted], unknownStatus: [unsorted] };
  let refuse = true;
  const posted = serve(
    () => data,
    () =>
      refuse
        ? json({ error: "notion refused" }, 502)
        : json({ summary: "status set" }),
  );

  render(<Reconciler initial={data} faces={{}} />);
  const statuses = within(section("Missing status field"));

  fireEvent.click(statuses.getByRole("button", { name: "Grad" }));
  await waitFor(() => statuses.getByText("notion refused"));

  refuse = false;
  fireEvent.click(statuses.getByRole("button", { name: "Grad" }));

  await waitFor(() => expect(posted).toHaveLength(2));
  /* the route reads the name from notion, not from what the page believed */
  expect(posted[1]).toEqual({
    path: "/api/members/status",
    body: { pageId: "p7", status: "Grad" },
  });
});

test("a link is confirmed even though the re-read takes its row away", async () => {
  const row = person({
    pageId: "p8",
    name: "Ada Vance",
    email: "ada@terpmail.umd.edu",
  });
  const data: ReconcilerData = {
    ...initial,
    roster: [row],
    resolutions: [
      {
        status: "linkable",
        on: "email",
        person: row,
        application: {
          id: "a1",
          discordId: "d1",
          username: "ada",
          name: "Ada Vance",
          email: "ada@terpmail.umd.edu",
          gradYear: null,
          applied: "2026-09-08",
        },
      },
    ],
  };
  serve(
    () => ({ ...data, resolutions: [] }),
    () => json({ summary: "Linked Ada Vance" }),
  );

  render(<Reconciler initial={data} faces={{}} />);
  fireEvent.click(screen.getByRole("button", { name: "This is them" }));

  await waitFor(() => screen.getByText("No applicants waiting"));
  expect(notify.ok).toHaveBeenCalledWith("Linked Ada Vance");
});

/* the list of rows with no status is worked out by the server, so patching
   the roster alone left the row sitting in it */
test("a status set from a chip takes the row out of the status section", async () => {
  const data = { ...initial, roster: [unsorted], unknownStatus: [unsorted] };
  const sorted = { ...unsorted, status: "Grad" };
  const posted = serve(
    () => ({ ...data, roster: [sorted], unknownStatus: [] }),
    () => json({ summary: "status set" }),
  );

  render(<Reconciler initial={data} faces={{}} />);
  fireEvent.click(
    within(section("Missing Discord ID")).getByRole("button", {
      name: "Set status",
    }),
  );
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Grad" }),
  );

  await waitFor(() =>
    within(section("Missing status field")).getByText(
      "Every member has a status",
    ),
  );
  expect(posted).toEqual([
    { path: "/api/members/status", body: { pageId: "p7", status: "Grad" } },
  ]);
});

/* discord does not always say when somebody applied */
test("an application with no date says nothing about one", () => {
  render(
    <Reconciler
      initial={{
        ...initial,
        resolutions: [
          {
            status: "incomplete",
            missing: ["name"],
            application: {
              id: "a2",
              discordId: "d2",
              username: "undated",
              name: null,
              email: "u@terpmail.umd.edu",
              gradYear: null,
              applied: null,
            },
          },
        ],
      }}
      faces={{}}
    />,
  );

  expect(screen.getByText("the form gave no name")).toBeTruthy();
  expect(screen.queryByText(/^applied/)).toBeNull();
});
