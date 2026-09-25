// @vitest-environment jsdom

/* the real kiosk against a fake notion that is slow and answers the relation
   in any order, since the failures live between one tap and the next */

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { configure, fireEvent } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mergeAttendance } from "~/lib/members/attendance";
import type { KioskData } from "~/lib/members/views";

/* imported per test: the query client is module scope, so a shared module
   would share one test's cache with the next */
let AttendanceKiosk: typeof import("./attendance-kiosk").AttendanceKiosk;
let toast: typeof import("sonner").toast;

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/* every wait is for a condition, so a generous timeout only helps a busy machine */
configure({ asyncUtilTimeout: 10_000 });

const NAMES = ["Ana Diaz", "Ben Okafor", "Cass Lin", "Dev Patel", "Elle Moore"];

const initial: KioskData = {
  meetings: [
    {
      pageId: "m1",
      name: "General Body Meeting 2026-09-08",
      date: "2026-09-08",
      type: "General Body",
      attendeeIds: [],
    },
  ],
  candidates: NAMES.map((name, index) => ({
    pageId: `p${index + 1}`,
    name,
    discordId: null,
    email: `${name.split(" ")[0]!.toLowerCase()}@terpmail.umd.edu`,
    status: "Undergrad",
    contributions: 0,
  })),
  openingId: "m1",
  statuses: ["Undergrad", "Grad", "Alum"],
  notionProblem: null,
};

type Fake = {
  attendees: string[];
  writes: { known: string[]; memberIds: string[] }[];
  /* held open by a test that looks at the screen before notion answers.
     Resolved by default, so the rest run at full speed */
  gate: Promise<void>;
  /** whether a write is refused rather than recorded */
  refuse: boolean;
  /** what a re-read of the roster answers, for the tests that switch meeting */
  kiosk: KioskData | null;
  /** how many re-reads of the roster fail before one answers */
  kioskFailures: number;
};

let fake: Fake;

beforeEach(async () => {
  vi.resetModules();
  ({ AttendanceKiosk } = await import("./attendance-kiosk"));
  ({ toast } = await import("sonner"));

  fake = {
    attendees: [],
    writes: [],
    gate: Promise.resolve(),
    refuse: false,
    kiosk: null,
    kioskFailures: 0,
  };
  /* this test's fake, not the variable: writes left running must not land
     in the next test's notion */
  const notion = fake;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/members/attendance")) {
        const body = JSON.parse(init!.body as string) as {
          known: string[];
          memberIds: string[];
        };
        notion.writes.push(body);

        await notion.gate;
        /* long enough for the next tap to land mid-write */
        await new Promise((done) => setTimeout(done, 10));

        if (notion.refuse) {
          return new Response(JSON.stringify({ error: "notion refused" }), {
            status: 502,
            headers: { "content-type": "application/json" },
          });
        }

        notion.attendees = mergeAttendance(
          notion.attendees,
          body.known,
          body.memberIds,
        );

        return new Response(
          JSON.stringify({
            summary: "recorded",
            /* reversed: notion guarantees no order */
            memberIds: [...notion.attendees].reverse(),
          }),
          { headers: { "content-type": "application/json" } },
        );
      }

      if (url.startsWith("/api/members/kiosk") && notion.kiosk) {
        await notion.gate;
        if (notion.kioskFailures > 0) {
          notion.kioskFailures -= 1;
          return new Response(JSON.stringify({ error: "rate limited" }), {
            status: 429,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify(notion.kiosk), {
          headers: { "content-type": "application/json" },
        });
      }

      throw new Error(`unexpected request to ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function draw(data = initial) {
  return render(
    <AttendanceKiosk initial={data} today="2026-09-08" faces={{}} guild={[]} />,
  );
}

function signedIn(): string[] {
  const list = screen.queryByRole("list", { name: "Signed in" });
  if (!list) return [];

  return within(list)
    .getAllByRole("listitem")
    .map((row) => row.textContent ?? "");
}

/** the names on the signed-in rows, top to bottom */
function order(): string[] {
  return signedIn().map(
    (row) => NAMES.find((name) => row.includes(name)) ?? row,
  );
}

function signIn(name: string) {
  const search = screen.getByLabelText("Type your name");

  fireEvent.change(search, { target: { value: name } });
  fireEvent.keyDown(search, { key: "Enter" });
}

test("five people signing in one after another all land, in order", async () => {
  /* nothing answers until released */
  let release = () => {};
  fake.gate = new Promise<void>((done) => (release = done));

  draw();

  act(() => {
    for (const name of NAMES) signIn(name);
  });

  /* drawn before notion has any of them */
  await act(async () => {});
  expect(signedIn()).toHaveLength(5);
  expect(fake.attendees).toEqual([]);

  release();

  await waitFor(() => expect(fake.writes).toHaveLength(5));
  await waitFor(() => expect(fake.attendees).toHaveLength(5));

  expect(fake.attendees).toEqual(["p1", "p2", "p3", "p4", "p5"]);

  /* newest first, whatever order the answers came in */
  expect(order()).toEqual([...NAMES].reverse());
});

test("each write is computed from what the last one answered", async () => {
  draw();

  act(() => {
    for (const name of NAMES) signIn(name);
  });

  await waitFor(() => expect(fake.writes).toHaveLength(5));

  expect(fake.writes.map((write) => write.memberIds)).toEqual([
    ["p1"],
    ["p1", "p2"],
    ["p1", "p2", "p3"],
    ["p1", "p2", "p3", "p4"],
    ["p1", "p2", "p3", "p4", "p5"],
  ]);
});

test("five removals one after another all take", async () => {
  draw();

  act(() => {
    for (const name of NAMES) signIn(name);
  });
  await waitFor(() => expect(fake.attendees).toHaveLength(5));

  for (const name of NAMES) {
    fireEvent.click(screen.getByRole("button", { name: `Remove ${name}` }));
    fireEvent.click(screen.getByRole("button", { name: "Remove attendance" }));
  }

  await waitFor(() => expect(fake.writes).toHaveLength(10));
  await waitFor(() => expect(fake.attendees).toEqual([]));

  expect(signedIn()).toHaveLength(0);
});

test("signing somebody in and out again leaves them out", async () => {
  draw();

  act(() => signIn(NAMES[0]!));
  await waitFor(() => expect(fake.attendees).toEqual(["p1"]));

  fireEvent.click(screen.getByRole("button", { name: `Remove ${NAMES[0]}` }));
  fireEvent.click(screen.getByRole("button", { name: "Remove attendance" }));
  await waitFor(() => expect(fake.attendees).toEqual([]));

  expect(signedIn()).toHaveLength(0);
});

test("somebody another device signed in survives this device's writes", async () => {
  draw();

  act(() => signIn(NAMES[0]!));
  await waitFor(() => expect(fake.attendees).toEqual(["p1"]));

  fake.attendees = [...fake.attendees, "p3"];

  act(() => signIn(NAMES[1]!));
  await waitFor(() => expect(signedIn()).toHaveLength(3));

  act(() => signIn(NAMES[3]!));
  await waitFor(() => expect(fake.writes).toHaveLength(3));
  await waitFor(() => expect(screen.queryByText("saving…")).toBeNull());

  expect(order().sort()).toEqual(
    ["Ana Diaz", "Ben Okafor", "Cass Lin", "Dev Patel"].sort(),
  );
});

test("a write that failed takes the tap back off the screen", async () => {
  fake.refuse = true;
  draw();

  act(() => signIn(NAMES[0]!));
  expect(order()).toEqual([NAMES[0]]);

  await waitFor(() => expect(signedIn()).toHaveLength(0));
  expect(toast.error).toHaveBeenCalledWith(
    expect.stringContaining("notion refused"),
  );
});

test("the offers are the listbox's options, with nothing between them", () => {
  draw();

  fireEvent.change(screen.getByLabelText("Type your name"), {
    target: { value: "Ana" },
  });
  const offers = screen.getByRole("listbox");

  expect(within(offers).getAllByRole("option")).toHaveLength(1);
  expect(within(offers).queryAllByRole("listitem")).toHaveLength(0);
});

test("a signed-in row this roster does not know has nothing to edit", () => {
  draw({
    ...initial,
    meetings: [{ ...initial.meetings[0]!, attendeeIds: ["p9"] }],
  });

  const row = within(screen.getByRole("list", { name: "Signed in" })).getByRole(
    "listitem",
  );

  expect(row.textContent).toContain("Someone not on this list");
  expect(within(row).getAllByRole("button")).toEqual([
    within(row).getByRole("button", { name: /^Remove/ }),
  ]);
});

test("switching meeting shows who that meeting's read says is in", async () => {
  const later = {
    pageId: "m2",
    name: "Writers' Room 2026-09-10",
    date: "2026-09-10",
    type: "General Body",
    attendeeIds: [],
  };
  const data = { ...initial, meetings: [later, ...initial.meetings] };
  fake.kiosk = {
    ...data,
    meetings: [{ ...later, attendeeIds: ["p3"] }, ...initial.meetings],
    openingId: "m2",
  };

  let release = () => {};
  fake.gate = new Promise<void>((done) => (release = done));

  draw(data);
  /* base-ui's select needs the full pointer sequence */
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Meeting"));
  await user.click(
    await screen.findByRole("option", { name: /Writers' Room/ }),
  );

  expect(screen.getByText("Reading who is signed in…")).toBeTruthy();

  release();

  await waitFor(() => expect(order()).toEqual(["Cass Lin"]));
});

test("a meeting whose read failed says so, and can be read again", async () => {
  const later = {
    pageId: "m2",
    name: "Writers' Room 2026-09-10",
    date: "2026-09-10",
    type: "General Body",
    attendeeIds: [],
  };
  const data = { ...initial, meetings: [later, ...initial.meetings] };
  fake.kiosk = {
    ...data,
    meetings: [{ ...later, attendeeIds: ["p3"] }, ...initial.meetings],
    openingId: "m2",
  };
  fake.kioskFailures = 1;

  draw(data);
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Meeting"));
  await user.click(
    await screen.findByRole("option", { name: /Writers' Room/ }),
  );

  await user.click(await screen.findByRole("button", { name: "Try again" }));

  await waitFor(() => expect(order()).toEqual(["Cass Lin"]));
});

test("a meeting the read no longer finds is not left reading", async () => {
  const later = {
    pageId: "m2",
    name: "Writers' Room 2026-09-10",
    date: "2026-09-10",
    type: "General Body",
    attendeeIds: [],
  };
  const data = { ...initial, meetings: [later, ...initial.meetings] };
  /* trashed since the page loaded: the route falls back to today's meeting */
  fake.kiosk = { ...initial };

  draw(data);
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Meeting"));
  await user.click(
    await screen.findByRole("option", { name: /Writers' Room/ }),
  );

  expect(await screen.findByText("Nobody yet.")).toBeTruthy();
  expect(screen.getByLabelText("Meeting").textContent).toContain(
    "General Body Meeting",
  );
});

test("a part of notion the kiosk could not read is said on screen", () => {
  draw({ ...initial, notionProblem: "Members has no readable Status select" });

  expect(screen.getByRole("alert").textContent).toBe(
    "Members has no readable Status select",
  );
});

test("a new member's status choices are one labelled group", () => {
  draw();

  fireEvent.change(screen.getByLabelText("Type your name"), {
    target: { value: "Fern Ortiz" },
  });

  const status = screen.getByRole("group", { name: "Status" });
  expect(within(status).getAllByRole("button")).toHaveLength(3);
});

test("opening and cancelling removal leaves attendance unchanged", async () => {
  draw();
  act(() => signIn(NAMES[0]!));
  await waitFor(() => expect(fake.attendees).toEqual(["p1"]));

  fireEvent.click(screen.getByRole("button", { name: `Remove ${NAMES[0]}` }));
  const dialog = screen.getByRole("dialog", { name: `Remove ${NAMES[0]}?` });
  expect(dialog.textContent).toContain("2026-09-08");
  expect(fake.writes).toHaveLength(1);
  expect(fake.attendees).toEqual(["p1"]);
  await waitFor(() =>
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Keep signed in" }),
    ),
  );

  fireEvent.click(
    within(dialog).getByRole("button", { name: "Keep signed in" }),
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByLabelText("Type your name"),
    ),
  );
  expect(fake.writes).toHaveLength(1);
  expect(order()).toEqual([NAMES[0]]);
});
