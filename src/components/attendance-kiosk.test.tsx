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
import { fireEvent } from "@testing-library/dom";
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

vi.mock("~/lib/notify", () => ({
  notify: { ok: vi.fn(), failed: vi.fn() },
}));

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
};

/** notion, as far as the page can tell: slow, and indifferent to order */
type Fake = {
  attendees: string[];
  writes: { known: string[]; memberIds: string[] }[];
};

let fake: Fake;

beforeEach(async () => {
  vi.resetModules();
  ({ AttendanceKiosk } = await import("./attendance-kiosk"));

  fake = { attendees: [], writes: [] };
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
        await new Promise((done) => setTimeout(done, 30));

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

      throw new Error(`unexpected request to ${url}`);
    }),
  );
});

afterEach(async () => {
  cleanup();
  /* a test that ends mid-queue leaves writes running, and an unmounted island
     still finishes them. Letting them land here keeps them out of the next
     test's notion */
  await new Promise((done) => setTimeout(done, 120));
  vi.unstubAllGlobals();
});

function draw() {
  return render(
    <AttendanceKiosk
      initial={initial}
      today="2026-09-08"
      faces={{}}
      guild={[]}
    />,
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
