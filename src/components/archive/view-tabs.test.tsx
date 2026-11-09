// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SquareIcon } from "lucide-react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { foldTabs, ViewTabs } from "./view-tabs";

/* every tab 100 wide, the menu too, with 4 between */
test("as many views as fit stay in the row, beside the menu and the plus", () => {
  const widths = [100, 100, 100, 100, 100, 100];
  /* all of them: five views and the plus */
  expect(foldTabs(widths, 100, 620, 0)).toEqual({
    shown: [0, 1, 2, 3, 4],
    folded: [],
  });
  /* 500 leaves 296 for views beside the plus and the menu */
  expect(foldTabs(widths, 100, 500, 0)).toEqual({
    shown: [0, 1],
    folded: [2, 3, 4],
  });
});

test("a folded view chosen takes the place of the last that fit", () => {
  const widths = [100, 100, 100, 100, 100, 100];
  expect(foldTabs(widths, 100, 500, 3)).toEqual({
    shown: [0, 3],
    folded: [1, 2, 4],
  });
  /* one wider than the last gives up as many as it needs */
  expect(foldTabs([100, 100, 100, 250, 100, 100], 100, 500, 3)).toEqual({
    shown: [3],
    folded: [0, 1, 2, 4],
  });
});

const TABS = ["All", "Sections", "History", "Most read", "Retention"].map(
  (label) => ({ id: label.toLowerCase(), label, icon: SquareIcon }),
);

function Row() {
  const [view, setView] = useState("all");
  return (
    <ViewTabs
      tabs={TABS}
      view={view}
      edited={false}
      menu={null}
      panelId="panel"
      onChoose={setView}
      onNew={() => {}}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  /* a row 500 wide, of tabs 100 wide */
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const shown = () => screen.getAllByRole("tab").map((tab) => tab.textContent);

test("the views that do not fit are a menu, and the one chosen there joins the row", async () => {
  const user = userEvent.setup();
  render(<Row />);
  expect(shown()).toEqual(["All", "Sections"]);
  await user.click(screen.getByRole("button", { name: "3 more" }));
  await user.click(await screen.findByRole("menuitem", { name: "Most read" }));
  expect(shown()).toEqual(["All", "Most read"]);
  const chosen = screen.getByRole("tab", { name: "Most read" });
  expect(chosen.getAttribute("aria-selected")).toBe("true");
  await waitFor(() => expect(document.activeElement).toBe(chosen));
});

test("arrows move through every view, folded or not, and keep focus on the one chosen", async () => {
  const user = userEvent.setup();
  render(<Row />);
  screen.getByRole("tab", { name: "All" }).focus();
  await user.keyboard("{ArrowRight}{ArrowRight}");
  /* History was folded: it is in the row now, and has focus */
  expect(document.activeElement?.textContent).toBe("History");
  expect(shown()).toEqual(["All", "History"]);
  await user.keyboard("{End}");
  expect(document.activeElement?.textContent).toBe("Retention");
  await user.keyboard("{Home}");
  expect(document.activeElement?.textContent).toBe("All");
  await user.keyboard("{ArrowLeft}");
  expect(document.activeElement?.textContent).toBe("Retention");
});

test("the chosen view has its menu beside it, and a dot while it is edited", () => {
  render(
    <ViewTabs
      tabs={TABS}
      view="history"
      edited
      menu={<button type="button">History's menu</button>}
      panelId="panel"
      onChoose={() => {}}
      onNew={() => {}}
    />,
  );
  expect(screen.getByRole("tab", { name: "History, edited" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "History's menu" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "New view" })).toBeTruthy();
});

test("a touch screen keeps every view in the row, to swipe", () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(pointer: coarse)",
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  render(<Row />);
  expect(shown()).toHaveLength(5);
  expect(screen.queryByRole("button", { name: /more/ })).toBeNull();
});

test("a touch screen narrowed keeps the chosen view in sight", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(pointer: coarse)",
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const observed: (() => void)[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: () => void) {}
      observe() {
        observed.push(this.callback);
      }
      disconnect() {}
    },
  );
  /* each tab 100 wide, side by side, in a strip 600 wide */
  let width = 600;
  const scrolled = new WeakMap<Element, number>();
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => width,
  );
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(
    function (this: HTMLElement) {
      return [...(this.parentElement?.children ?? [])].indexOf(this) * 100;
    },
  );
  vi.spyOn(Element.prototype, "scrollLeft", "get").mockImplementation(function (
    this: Element,
  ) {
    return scrolled.get(this) ?? 0;
  });
  vi.spyOn(Element.prototype, "scrollLeft", "set").mockImplementation(function (
    this: Element,
    value: number,
  ) {
    scrolled.set(this, value);
  });
  const user = userEvent.setup();
  render(<Row />);
  await user.click(screen.getByRole("tab", { name: "Retention" }));
  const strip = screen.getByRole("tablist");
  expect(strip.scrollLeft).toBe(0);
  /* Retention runs from 400 to 500, past a strip 300 wide */
  width = 300;
  act(() => observed.forEach((callback) => callback()));
  expect(strip.scrollLeft).toBe(200);
});
