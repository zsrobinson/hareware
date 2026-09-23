// @vitest-environment jsdom

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

/* imported per test: the query client is module scope, so a shared module
   would render the previous test's roster */
let Reconciler: typeof import("./reconciler").Reconciler;
let toast: typeof import("sonner").toast;

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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
  ({ toast } = await import("sonner"));

  /* only a write reaches the network */
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

/* a row can appear in several sections, so queries name the section */
function section(title: string) {
  return heading(title).closest("section")!;
}

/** a section's heading, whose name also carries its count */
function heading(title: string) {
  return screen.getByRole("heading", {
    name: (name) => name.replace(/\s*\d+$/, "") === title,
  });
}

async function upload(csv: string) {
  const input = screen.getByLabelText(/Export CSV/);
  const file = new File([csv], "members.csv", { type: "text/csv" });

  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => screen.getByText(/stayed in this browser/));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** a re-read answers `read()` and a write `write(path)`; returns the writes */
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
  expect(
    within(section("Missing from Google Group")).getByText("Ben Okafor"),
  ).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});

test("a row with no address is counted against the group, not listed twice", async () => {
  render(<Reconciler initial={initial} faces={{}} />);
  await upload(EXPORT);

  expect(screen.getByText(/1 member has no address at all/)).toBeTruthy();
  expect(
    screen.getByText(/They are listed under Missing email field\./),
  ).toBeTruthy();
  expect(
    within(section("Missing from Google Group")).queryByText("Cass Lin"),
  ).toBeNull();
  expect(
    within(section("Missing email field")).getByText("Cass Lin"),
  ).toBeTruthy();
});

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

  const wrong = within(section("Incorrect email domain"));

  expect(wrong.getByText("Typo Person")).toBeTruthy();
  expect(wrong.getByText("Dud Row")).toBeTruthy();
  expect(wrong.getByText("not an address at all")).toBeTruthy();
});

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

test("a file the browser cannot read says so", async () => {
  render(<Reconciler initial={initial} faces={{}} />);

  const file = new File([""], "broken.csv", { type: "text/csv" });
  file.text = () => Promise.reject(new Error("the disk said no"));
  fireEvent.change(screen.getByLabelText(/Export CSV/), {
    target: { files: [file] },
  });

  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
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
  expect(toast.success).toHaveBeenCalledWith("Linked Ada Vance");
});

/* the status section is computed by the server, so a patch alone leaves it stale */
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

test("what the re-read could not reach is said, not what first paint could not", async () => {
  const data = { ...initial, roster: [unsorted], unknownStatus: [unsorted] };
  serve(
    () => ({ ...data, unknownStatus: [], discordProblem: "rate limited" }),
    () => json({ summary: "status set" }),
  );

  render(<Reconciler initial={data} faces={{}} />);
  expect(screen.queryByRole("alert")).toBeNull();

  fireEvent.click(
    within(section("Missing status field")).getByRole("button", {
      name: "Grad",
    }),
  );

  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("rate limited"),
  );
});

test("an application nobody could decide says why", () => {
  const one = person({ pageId: "p1", name: "Ana Diaz" });
  const two = person({ pageId: "p2", name: "Ana Dias" });
  render(
    <Reconciler
      initial={{
        ...initial,
        roster: [one, two],
        resolutions: [
          {
            status: "similar",
            people: [one, two],
            application: {
              id: "a3",
              discordId: "d3",
              username: "ana",
              name: "Ana Diaz",
              email: null,
              gradYear: null,
              applied: null,
            },
          },
        ],
      }}
      faces={{}}
    />,
  );

  expect(screen.getByText("too close to call")).toBeTruthy();
});
