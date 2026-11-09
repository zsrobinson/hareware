// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SidePanel } from "./panel";

/* a laptop narrower than the width a panel fits beside a full sidebar */
const media = { phone: false, roomy: false };
beforeEach(() =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("max-width") ? media.phone : media.roomy,
    addEventListener: () => {},
    removeEventListener: () => {},
  })),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.getElementById("shell")?.remove();
  Object.assign(media, { phone: false, roomy: false });
});

/* a list whose rows are drawn afresh whenever a panel opens or closes, as a
   table's are when its columns depend on which row is open */
function People() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <ul>
        {["Alex Park", "Riley Chen"].map((name) => (
          <li key={`${name} ${open}`}>
            <button data-row-key={name} onClick={() => setOpen(name)}>
              {name}
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <SidePanel
          title={open}
          back="All people"
          onClose={() => setOpen(null)}
          restoreFocus={() =>
            document.querySelector<HTMLElement>(`[data-row-key="${open}"]`)
          }
        >
          <p>Contributions</p>
        </SidePanel>
      )}
    </>
  );
}

test.each([
  ["Escape", () => userEvent.keyboard("{Escape}")],
  ["the close button", () => userEvent.click(screen.getByLabelText("Close"))],
])(
  "closing with %s gives focus to the redrawn name that opened it",
  async (_, close) => {
    render(<People />);
    await userEvent.click(screen.getByRole("button", { name: "Riley Chen" }));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Riley Chen" }),
    );

    await close();

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Riley Chen" }),
      ),
    );
  },
);

/* the layout's shell, whose state the sidebar is drawn from */
function shell(state: "expanded" | "collapsed") {
  const element = document.createElement("div");
  element.id = "shell";
  element.dataset.state = state;
  document.body.appendChild(element);
  return element;
}

test("a panel folds the sidebar to make room, and unfolds it on closing", async () => {
  const sidebar = shell("expanded");
  render(<People />);
  await userEvent.click(screen.getByRole("button", { name: "Riley Chen" }));
  expect(sidebar.dataset.state).toBe("collapsed");
  /* from one panel to another, it stays folded */
  await userEvent.click(screen.getByRole("button", { name: "Alex Park" }));
  expect(sidebar.dataset.state).toBe("collapsed");
  await userEvent.keyboard("{Escape}");
  expect(sidebar.dataset.state).toBe("expanded");
});

test("a sidebar folded by hand, or opened again while a panel is open, is left as it is", async () => {
  const sidebar = shell("collapsed");
  const { unmount } = render(<People />);
  await userEvent.click(screen.getByRole("button", { name: "Riley Chen" }));
  await userEvent.keyboard("{Escape}");
  expect(sidebar.dataset.state).toBe("collapsed");
  unmount();

  /* opened again with the layout's toggle while a panel has it folded */
  sidebar.dataset.state = "expanded";
  render(<People />);
  await userEvent.click(screen.getByRole("button", { name: "Riley Chen" }));
  expect(sidebar.dataset.state).toBe("collapsed");
  sidebar.dataset.state = "expanded";
  delete sidebar.dataset.folded;
  await userEvent.click(screen.getByRole("button", { name: "Alex Park" }));
  await userEvent.keyboard("{Escape}");
  expect(sidebar.dataset.state).toBe("expanded");
});

test("a panel leaves the sidebar alone where there is room for both", async () => {
  media.roomy = true;
  const sidebar = shell("expanded");
  render(<People />);
  await userEvent.click(screen.getByRole("button", { name: "Riley Chen" }));
  expect(sidebar.dataset.state).toBe("expanded");
});
