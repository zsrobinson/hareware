// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, expect, test, vi } from "vitest";
import { Toaster } from "~/components/ui/sonner";
import type { Rows } from "~/lib/services/google/sheets";
import { ArticlesPage } from "./articles";
import { SettingsPage } from "./settings";
import { storedOf } from "./saved-views";
import { stubArchive } from "./stub-archive";
import { VIEWS, type View } from "./views";

/*
  A page's views as the board saves them, against a Views tab in memory
  that /api/sheet writes as the Worker would. Saved is said only once a
  read of it shows the change; nothing here reaches the club's Sheet.
*/

const HEADER = ["id", "page", "position", "view", "updated by", "updated at"];
const all = VIEWS.find((v) => v.id === "all")! as View;
const history = VIEWS.find((v) => v.id === "history")! as View;
const cells = (view: View, position: number, at = "T0", by = "Sam Second") => [
  view.id,
  view.source,
  String(position),
  JSON.stringify(storedOf(view).view),
  by,
  at,
];

const posts = [
  {
    id: 1,
    title: "An invented headline",
    publishedAt: new Date().toISOString(),
    categoryIds: [1],
    paragraphs: ["Article by: Ada Example"],
  },
];

afterEach(() => {
  /* a toast outlives its page, as in a browser: each test starts with none */
  toast.dismiss();
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const page = (path: string) => {
  window.history.replaceState(null, "", path);
  return render(
    <>
      <Toaster />
      <ArticlesPage />
    </>,
  );
};
const views = (tabs: Record<string, Rows>) =>
  tabs.Views!.slice(1).map((row) => [row[0], JSON.parse(row[3]!).range]);

test("Save for everyone writes the starter views with the change, and says Saved once it reads back", async () => {
  const { tabs } = stubArchive({ posts, viewsTab: [] });
  const user = userEvent.setup();
  page("/articles?range=12m");

  await user.click(
    await screen.findByRole("button", { name: "Save for everyone" }),
  );
  expect(await screen.findByText("Saved All for everyone")).toBeTruthy();
  expect(views(tabs)).toEqual(
    VIEWS.filter((v) => v.source === "articles").map((v) => [
      v.id,
      v.id === "all" ? "12m" : v.range,
    ]),
  );
  /* the view is what is on screen now: nothing left to save */
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "All" })).toBeTruthy(),
  );
  expect(
    screen.queryByRole("button", { name: "Save for everyone" }),
  ).toBeNull();
  expect(window.location.search).toBe("");
});

test("a save the Sheet refuses says so, and the view stays edited", async () => {
  const { tabs } = stubArchive({
    posts,
    viewsTab: [HEADER, cells(all, 1)],
    answer: () => new Response("google sheets answered 500", { status: 502 }),
  });
  const user = userEvent.setup();
  page("/articles?range=12m");

  await user.click(
    await screen.findByRole("button", { name: "Save for everyone" }),
  );
  expect(
    await screen.findByText("Not saved: google sheets answered 500"),
  ).toBeTruthy();
  expect(screen.queryByText("Saved All for everyone")).toBeNull();
  expect(screen.getByRole("tab", { name: "All, edited" })).toBeTruthy();
  expect(JSON.parse(tabs.Views![1]![3]!).range).toBe("3m");
});

test("a save over someone else's since is a conflict, which Overwrite saves over", async () => {
  const { tabs } = stubArchive({ posts, viewsTab: [HEADER, cells(all, 1)] });
  const user = userEvent.setup();
  page("/articles?range=12m");
  await screen.findByRole("tab", { name: "All, edited" });

  /* someone saves All after this page opened it */
  tabs.Views![1] = cells({ ...all, range: "all" }, 1, "T9");
  await user.click(screen.getByRole("button", { name: "Save for everyone" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Someone changed this view since you opened it",
  });
  expect(JSON.parse(tabs.Views![1]![3]!).range).toBe("all");

  await user.click(within(dialog).getByRole("button", { name: "Overwrite" }));
  expect(await screen.findByText("Saved All for everyone")).toBeTruthy();
  expect(JSON.parse(tabs.Views![1]![3]!).range).toBe("12m");
});

test("Reload after a conflict shows theirs, and Undo puts these edits back over it", async () => {
  const { tabs } = stubArchive({ posts, viewsTab: [HEADER, cells(all, 1)] });
  const user = userEvent.setup();
  page("/articles?range=12m");
  await screen.findByRole("tab", { name: "All, edited" });

  tabs.Views![1] = cells({ ...all, label: "Everything" }, 1, "T9");
  await user.click(screen.getByRole("button", { name: "Save for everyone" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Reload" }));

  expect(await screen.findByRole("tab", { name: "Everything" })).toBeTruthy();
  expect(window.location.search).toBe("");
  await user.click(
    within(
      (await screen.findByText("Unsaved changes to All discarded")).closest(
        "li",
      )!,
    ).getByRole("button", { name: "Undo" }),
  );
  expect(
    await screen.findByRole("tab", { name: "Everything, edited" }),
  ).toBeTruthy();
});

test("the tab's menu renames a view for everyone, and deletes one, undoably", async () => {
  const { tabs } = stubArchive({
    posts,
    viewsTab: [HEADER, cells(all, 1), cells(history, 2)],
  });
  const user = userEvent.setup();
  page("/articles?view=history");

  await user.click(
    await screen.findByRole("button", { name: "History's menu" }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
  const form = await screen.findByRole("dialog", { name: "Rename History" });
  const name = within(form).getByRole("textbox", { name: "Name" });
  await user.clear(name);
  await user.type(name, "The long run");
  await user.click(within(form).getByRole("button", { name: "Rename" }));
  expect(await screen.findByText("Renamed to The long run")).toBeTruthy();
  expect(JSON.parse(tabs.Views![2]![3]!).label).toBe("The long run");
  expect(tabs.Views![2]![4]).toBe("Riley Real");

  await user.click(screen.getByRole("button", { name: "The long run's menu" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Delete",
    }),
  );
  const done = await screen.findByText("Deleted The long run");
  expect(tabs.Views).toHaveLength(2);
  expect(
    screen.getByRole("tab", { name: "All" }).getAttribute("aria-selected"),
  ).toBe("true");

  await user.click(
    within(done.closest("li")!).getByRole("button", { name: "Undo" }),
  );
  expect(await screen.findByRole("tab", { name: "The long run" })).toBeTruthy();
  expect(tabs.Views!.map((row) => row[2])).toEqual(["position", "1", "2"]);
});

test("a link to a view the page no longer has says so, and opens its first as saved", async () => {
  stubArchive({ posts, viewsTab: [HEADER, cells(all, 1)] });
  page("/articles?view=history&range=12m&layout=pivot");
  expect(
    await screen.findByText(
      /The link was to a view, “history”, that Articles no longer has/,
    ),
  ).toBeTruthy();
  expect(
    screen.getByRole("tab", { name: "All" }).getAttribute("aria-selected"),
  ).toBe("true");
  expect(window.location.search).toBe("");
});

test("Settings lists each page's views, who saved them, the rows it couldn't read, and restores the starter set", async () => {
  const { tabs } = stubArchive({
    posts,
    viewsTab: [
      HEADER,
      cells(history, 1, "2026-11-01T15:00:00.000Z", "Riley Real"),
      ["broken", "articles", "2", "{not json", "", ""],
    ],
  });
  const user = userEvent.setup();
  window.history.replaceState(null, "", "/settings");
  render(
    <>
      <Toaster />
      <SettingsPage />
    </>,
  );

  expect(await screen.findByText(/^Saved by Riley Real/)).toBeTruthy();
  expect(
    screen.getByText(/People shows the starter views; they will be saved/),
  ).toBeTruthy();
  expect(screen.getByText("1 view couldn't be read")).toBeTruthy();
  expect(
    screen.getByText(/Views, row 3: broken, its view isn't JSON/),
  ).toBeTruthy();

  await user.click(
    screen.getByRole("button", { name: "Restore starter views" }),
  );
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Restore",
    }),
  );
  expect(
    await screen.findByText("Restored the starter views on Articles"),
  ).toBeTruthy();
  expect(tabs.Views!.slice(1).map((row) => row[0])).toEqual(
    VIEWS.filter((v) => v.source === "articles").map((v) => v.id),
  );
});
