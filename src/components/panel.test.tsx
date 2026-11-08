// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { SidePanel } from "./panel";

afterEach(cleanup);

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
