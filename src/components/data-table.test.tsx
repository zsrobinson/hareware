// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { DataTable } from "./data-table";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("Copy table pastes visible columns in the filtered sort order, guarding every cell", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(
    <DataTable
      csv="invented"
      columns={[
        { accessorKey: "name", header: "Name" },
        { accessorKey: "secret", header: "Hidden" },
        { accessorKey: "count", header: "Count" },
      ]}
      hidden={["secret"]}
      sorting={[{ id: "count", desc: true }]}
      data={[
        { name: "Hidden Person", secret: "private", count: 3 },
        { name: "=Example", secret: "private", count: 1 },
        { name: "Ada\tExample", secret: "private", count: 2 },
      ]}
    />,
  );
  await user.type(
    screen.getByRole("searchbox", { name: "Search the table" }),
    "Example",
  );
  await user.click(screen.getByRole("button", { name: /^Copy table/ }));
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(
      "Name\tCount\nAda Example\t2\n'=Example\t1",
    ),
  );
});
