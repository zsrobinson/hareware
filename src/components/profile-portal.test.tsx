// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ProfilePayload } from "~/lib/members/profile";

vi.mock("~/lib/notify", () => ({
  notify: { ok: vi.fn(), failed: vi.fn() },
}));

let ProfilePortal: typeof import("./profile-portal").ProfilePortal;

const ready: ProfilePayload = {
  status: "ready",
  person: {
    pageId: "person-1",
    name: "Robin Hare",
    discordId: "discord-1",
    email: "robin@terpmail.umd.edu",
    status: "Undergrad",
    contributions: 3,
    noAnnouncements: false,
  },
  discordNickname: "Robin Hare",
  possibleDuplicate: false,
  statuses: ["Undergrad", "Grad", "Alum"],
  selectable: [
    { pageId: "person-1", name: "Robin Hare" },
    { pageId: "person-2", name: "Mina Finch" },
  ],
  contributions: [
    {
      pageId: "article-1",
      headline: "The campus at dusk",
      date: "2026-08-28",
      roles: ["writer", "image"],
    },
  ],
  attendance: [
    {
      pageId: "meeting-1",
      name: "September GBM",
      date: "2026-09-02",
      type: "General Body",
      attendeeIds: ["person-1"],
    },
  ],
};

beforeEach(async () => {
  vi.resetModules();
  ({ ProfilePortal } = await import("./profile-portal"));
  history.replaceState({}, "", "/profile");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("shows one identity and two activity cards for all time", () => {
  render(
    <ProfilePortal
      initial={ready}
      displayName="Robin Hare"
      today="2026-09-08"
    />,
  );

  expect(screen.getByRole("heading", { name: "Robin Hare" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Contributions" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Attendance" })).toBeTruthy();
  expect(screen.getByText("The campus at dusk")).toBeTruthy();
  expect(screen.getByText("September GBM")).toBeTruthy();
  expect(screen.getByText("Writer + image")).toBeTruthy();
  expect(
    (screen.getByLabelText("Activity range") as unknown as { value: string })
      .value,
  ).toBe("all");
  expect(
    screen.getByRole("heading", { name: "Contributions" }).textContent,
  ).toContain("2");
});

test("a preset writes concrete dates and refetches both cards", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      expect(String(input)).toContain("from=2026-07-01");
      expect(String(input)).toContain("to=2026-12-31");
      return new Response(
        JSON.stringify({ ...ready, contributions: [], attendance: [] }),
        {
          headers: { "content-type": "application/json" },
        },
      );
    }),
  );

  render(
    <ProfilePortal
      initial={ready}
      displayName="Robin Hare"
      today="2026-09-08"
    />,
  );
  fireEvent.change(screen.getByLabelText("Activity range"), {
    target: { value: "semester" },
  });

  await waitFor(() =>
    expect(location.search).toBe("?from=2026-07-01&to=2026-12-31"),
  );
  await waitFor(() =>
    expect(screen.queryByText("The campus at dusk")).toBeNull(),
  );
  expect(screen.getAllByRole("link", { name: "Show all time" })).toHaveLength(
    2,
  );
});

test("edits one identity fact at a time and keeps the saved answer visible", async () => {
  let releaseRead = () => {};
  const oldRead = new Promise<Response>((resolve) => {
    releaseRead = () =>
      resolve(
        new Response(JSON.stringify(ready), {
          headers: { "content-type": "application/json" },
        }),
      );
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: string, init?: RequestInit) => {
      if (!init?.method) return oldRead;
      expect(JSON.parse(init.body as string)).toEqual({
        action: "email",
        value: "new@umd.edu",
      });
      return new Response(
        JSON.stringify({ ok: true, pageId: "person-1", email: "new@umd.edu" }),
        {
          headers: { "content-type": "application/json" },
        },
      );
    }),
  );

  render(
    <ProfilePortal
      initial={ready}
      displayName="Robin Hare"
      today="2026-09-08"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit email" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Email"), {
    target: { value: "new@umd.edu" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(screen.getByText("new@umd.edu")).toBeTruthy());
  releaseRead();
  await new Promise((done) => setTimeout(done, 0));
  expect(screen.getByText("new@umd.edu")).toBeTruthy();
});

test("an unlinked member confirms a complete profile despite a possible duplicate", async () => {
  const unlinked: ProfilePayload = {
    status: "unlinked",
    possibleDuplicate: true,
    statuses: ["Undergrad", "Grad", "Alum"],
    selectable: [],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: string, init?: RequestInit) => {
      expect(JSON.parse(init?.body as string)).toEqual({
        action: "create",
        name: "Robin Hare",
        email: "robin@umd.edu",
        status: "Grad",
      });
      return new Response(JSON.stringify({ ok: true, pageId: "person-1" }), {
        headers: { "content-type": "application/json" },
      });
    }),
  );

  render(
    <ProfilePortal
      initial={unlinked}
      displayName="Robin Hare"
      today="2026-09-08"
    />,
  );
  expect(screen.getByText(/similar profile/i)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "robin@umd.edu" },
  });
  fireEvent.change(screen.getByLabelText("Status"), {
    target: { value: "Grad" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
});
