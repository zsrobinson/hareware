// @vitest-environment jsdom

/*
  the test that should have existed before any of the fixes above it.

  the room's whole interaction with this page is a queue of people tapping in
  quick succession, and every failure reported against it — people missing,
  rows reordering, a removal that did not take — has been in the space between
  one tap and the next. That space cannot be reasoned about from the pure
  functions alone: it is React Query's queue, the cache, and the component's
  own state, together.

  so this drives the real component against a fake notion that behaves like the
  real one in the two ways that hurt: it takes time to answer, and it answers
  with the relation in whatever order it likes.
*/

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

/*
  imported per test, not once.

  the query client is module scope in the app — it has to outlive the island,
  which `<ClientRouter />` remounts on every navigation — so two tests sharing
  this module would share the cache, and the second would open with the first
  test's room already signed in
*/
let AttendanceKiosk: typeof import("./attendance-kiosk").AttendanceKiosk;
let notify: typeof import("~/lib/notify").notify;

vi.mock("~/lib/notify", () => ({
  notify: { ok: vi.fn(), failed: vi.fn() },
}));

/*
  generous, because every wait here is for a condition rather than for a
  duration: the writes are gated by the test, not by a clock. A default second
  is enough on an idle machine and not on one running the rest of this suite in
  parallel, and a test that fails only when the laptop is busy teaches nobody
  anything
*/
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

/** notion, as far as the page can tell: slow, and indifferent to order */
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
};

let fake: Fake;

beforeEach(async () => {
  vi.resetModules();
  ({ AttendanceKiosk } = await import("./attendance-kiosk"));
  ({ notify } = await import("~/lib/notify"));

  fake = {
    attendees: [],
    writes: [],
    gate: Promise.resolve(),
    refuse: false,
    kiosk: null,
  };
  /*
    the stub closes over *this* test's fake, not the variable.

    a test that ends with writes still queued leaves them running, and they
    answer into whatever the stub reaches. Reading the outer binding meant the
    next test opened with the last one's writes landing in its notion
  */
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

        /* the round trip, so a second tap really does land mid-write */
        await notion.gate;
        /* enough for the next tap to land while this one is in flight, which
           is the whole situation under test */
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
            /* reversed on purpose. notion gives a relation no ordering
               guarantee, and a screen that takes its order from the answer
               reshuffles itself under whoever is still queueing */
            memberIds: [...notion.attendees].reverse(),
          }),
          { headers: { "content-type": "application/json" } },
        );
      }

      if (url.startsWith("/api/members/kiosk") && notion.kiosk) {
        await notion.gate;
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

/** the signed-in column, by the name its list carries */
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

/** types a name and presses enter, the way somebody at the laptop does */
function signIn(name: string) {
  const search = screen.getByLabelText("Type your name");

  fireEvent.change(search, { target: { value: name } });
  fireEvent.keyDown(search, { key: "Enter" });
}

test("five people signing in one after another all land, in order", async () => {
  /* nothing answers until this is released, so "before any write landed" is a
     fact rather than a race the test usually wins */
  let release = () => {};
  fake.gate = new Promise<void>((done) => (release = done));

  draw();

  /* no awaiting between them: this is the queue at the front of the room,
     five people deep, and every earlier version of this page lost somebody */
  act(() => {
    for (const name of NAMES) signIn(name);
  });

  /* all five are on screen while notion still has none of them: the queue is
     drawn, not waited for */
  await act(async () => {});
  expect(signedIn()).toHaveLength(5);
  expect(fake.attendees).toEqual([]);

  release();

  await waitFor(() => expect(fake.writes).toHaveLength(5));
  await waitFor(() => expect(fake.attendees).toHaveLength(5));

  expect(fake.attendees).toEqual(["p1", "p2", "p3", "p4", "p5"]);

  /* newest first, and never reordered by an answer that came back shuffled */
  expect(order()).toEqual([...NAMES].reverse());
});

/*
  the serialisation, stated as what the server was told rather than as timing.

  each write has to be computed from the answer the last one got back. Two
  writes derived from the same list is exactly how a tap disappears: both send
  a whole list, and the second one does not know about the first
*/
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

  act(() => {
    for (const name of NAMES) {
      fireEvent.click(screen.getByRole("button", { name: `Remove ${name}` }));
    }
  });

  await waitFor(() => expect(fake.writes).toHaveLength(10));
  await waitFor(() => expect(fake.attendees).toEqual([]));

  expect(signedIn()).toHaveLength(0);
});

test("signing somebody in and out again leaves them out", async () => {
  draw();

  act(() => signIn(NAMES[0]!));
  await waitFor(() => expect(fake.attendees).toEqual(["p1"]));

  act(() => {
    fireEvent.click(screen.getByRole("button", { name: `Remove ${NAMES[0]}` }));
  });
  await waitFor(() => expect(fake.attendees).toEqual([]));

  expect(signedIn()).toHaveLength(0);
});

/* a second device signed somebody in while this one was open. the answer
   carries them back, and they must not be thrown away by the next write */
test("somebody another device signed in survives this device's writes", async () => {
  draw();

  act(() => signIn(NAMES[0]!));
  await waitFor(() => expect(fake.attendees).toEqual(["p1"]));

  fake.attendees = [...fake.attendees, "p9"];

  act(() => signIn(NAMES[1]!));
  await waitFor(() => expect(fake.writes).toHaveLength(2));
  await waitFor(() => expect(fake.attendees).toContain("p9"));

  expect(fake.attendees).toEqual(["p1", "p9", "p2"]);
});

/* the promise the kiosk makes: nobody is shown as present whom notion refused */
test("a write that failed takes the tap back off the screen", async () => {
  fake.refuse = true;
  draw();

  act(() => signIn(NAMES[0]!));
  expect(order()).toEqual([NAMES[0]]);

  await waitFor(() => expect(signedIn()).toHaveLength(0));
  expect(notify.failed).toHaveBeenCalledWith(
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

/* a row somebody else's device signed in, which this roster does not hold */
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

/* the page's snapshot is minutes old by the time a meeting is switched to,
   and another laptop may have signed people into it since */
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
  /* base-ui's select picks on the pointer sequence, which a bare click is not */
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Meeting"));
  await user.click(
    await screen.findByRole("option", { name: /Writers' Room/ }),
  );

  /* not "nobody": nothing has been read about this meeting yet */
  expect(screen.getByText("Reading who is signed in…")).toBeTruthy();

  release();

  await waitFor(() => expect(order()).toEqual(["Cass Lin"]));
});

test("a part of notion the kiosk could not read is said on screen", () => {
  draw({ ...initial, notionProblem: "Members has no readable Status select" });

  expect(screen.getByRole("alert").textContent).toBe(
    "Members has no readable Status select",
  );
});
