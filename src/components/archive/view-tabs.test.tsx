// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SquareIcon } from "lucide-react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { foldTabs, ViewTabs } from "./view-tabs";

/* every tab 100 wide, the menu too, with 4 between */
test("as many views as fit stay in the row, beside the menu and Custom", () => {
  const widths = [100, 100, 100, 100, 100, 100];
  /* all of them: five views and Custom */
  expect(foldTabs(widths, 100, 620, 0)).toEqual({
    shown: [0, 1, 2, 3, 4],
    folded: [],
  });
  /* 500 leaves 296 for views beside Custom and the menu */
  expect(foldTabs(widths, 100, 500, 0)).toEqual({
    shown: [0, 1],
    folded: [2, 3, 4],
  });
  /* Custom chosen is always shown, and folds nothing more */
  expect(foldTabs(widths, 100, 500, 5).shown).toEqual([0, 1]);
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
      tabs={[...TABS, { id: "custom", label: "Custom", icon: SquareIcon }]}
      view={view}
      panelId="panel"
      onChoose={setView}
      onClickCustom={() => {}}
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
  expect(shown()).toEqual(["All", "Sections", "Custom"]);
  await user.click(screen.getByRole("button", { name: "3 more" }));
  await user.click(await screen.findByRole("menuitem", { name: "Most read" }));
  expect(shown()).toEqual(["All", "Most read", "Custom"]);
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
  expect(shown()).toEqual(["All", "History", "Custom"]);
  await user.keyboard("{End}");
  expect(document.activeElement?.textContent).toBe("Custom");
  await user.keyboard("{Home}");
  expect(document.activeElement?.textContent).toBe("All");
  await user.keyboard("{ArrowLeft}");
  expect(document.activeElement?.textContent).toBe("Custom");
});

test("a touch screen keeps every view in the row, to swipe", () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(pointer: coarse)",
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  render(<Row />);
  expect(shown()).toHaveLength(6);
  expect(screen.queryByRole("button", { name: /more/ })).toBeNull();
});
