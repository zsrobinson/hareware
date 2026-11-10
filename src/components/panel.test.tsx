// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SidePanel } from "./panel";

/* a laptop narrower than the width a panel fits beside a full sidebar */
const media = { phone: false, roomy: false };
const listeners = new Set<() => void>();
beforeEach(() =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("max-width") ? media.phone : media.roomy;
    },
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  })),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  listeners.clear();
  document.getElementById("shell")?.remove();
  Object.assign(media, { phone: false, roomy: false });
});

/* the window resized across a width the layout changes at */
const resize = (to: Partial<typeof media>) =>
  act(() => {
    Object.assign(media, to);
    for (const listener of [...listeners]) listener();
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

/* the layout's shell, whose state the sidebar is drawn from, and its
   toggle, which flips it as the layout's script does */
function shell(state: "expanded" | "collapsed") {
  const element = document.createElement("div");
  element.id = "shell";
  element.dataset.state = state;
  const toggle = document.createElement("button");
  toggle.id = "sidebar-toggle";
  toggle.textContent = "Toggle sidebar";
  toggle.addEventListener("click", () => {
    element.dataset.state =
      element.dataset.state === "collapsed" ? "expanded" : "collapsed";
  });
  element.appendChild(toggle);
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
  await userEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
  expect(sidebar.dataset.state).toBe("expanded");
  /* theirs now, however the window changes, until the panel closes */
  resize({ roomy: true });
  resize({ roomy: false });
  expect(sidebar.dataset.state).toBe("expanded");
  await userEvent.click(screen.getByRole("button", { name: "Alex Park" }));
  await userEvent.keyboard("{Escape}");
  expect(sidebar.dataset.state).toBe("expanded");
});

test("an open panel folds and unfolds the sidebar as the window crosses its widths", async () => {
  media.roomy = true;
  const sidebar = shell("expanded");
  render(<People />);
  await userEvent.click(screen.getByRole("button", { name: "Riley Chen" }));
  expect(sidebar.dataset.state).toBe("expanded");
  /* narrowed from roomy to a laptop, and back */
  resize({ roomy: false });
  expect(sidebar.dataset.state).toBe("collapsed");
  resize({ roomy: true });
  expect(sidebar.dataset.state).toBe("expanded");
  /* from a phone to a laptop, and back to a phone, which has no sidebar */
  resize({ roomy: false, phone: true });
  expect(sidebar.dataset.state).toBe("expanded");
  resize({ phone: false });
  expect(sidebar.dataset.state).toBe("collapsed");
  resize({ phone: true });
  expect(sidebar.dataset.state).toBe("expanded");
  resize({ phone: false });
  await userEvent.keyboard("{Escape}");
  expect(sidebar.dataset.state).toBe("expanded");
  /* and no choice of anyone's is written down */
  expect(document.cookie).not.toContain("sidebar_state");
});

test("a panel leaves the sidebar alone where there is room for both", async () => {
  media.roomy = true;
  const sidebar = shell("expanded");
  render(<People />);
  await userEvent.click(screen.getByRole("button", { name: "Riley Chen" }));
  expect(sidebar.dataset.state).toBe("expanded");
});
