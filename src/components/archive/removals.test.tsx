// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { Edit } from "~/lib/credits/edits";
import type { Label } from "~/lib/credits/labels";
import { SHEET_KEY } from "./archive-data";
import { useRemovals } from "./removals";

/*
  The Labels tab is written whole, so these drive the case where that bites:
  a list whose every removal rewrites the list. The Sheet here is an array the
  stubbed /api/sheet rewrites, and the list rereads it as the page does.
*/

function setUp(labels: Label[]) {
  const sheet = { labels };
  const written: Label[][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const edit = JSON.parse(init.body as string) as Edit;
      if (edit.kind !== "labels") throw new Error("not a labels edit");
      written.push(edit.labels.map((l) => l));
      sheet.labels = edit.labels;
      return Response.json({ ok: true });
    }),
  );

  function Labels() {
    const { data = [] } = useQuery({
      queryKey: SHEET_KEY,
      queryFn: () => sheet.labels,
    });
    const removals = useRemovals(data, (label) => label.label);
    return (
      <ul>
        {removals.entries.map(({ key, item, removed }) =>
          removed ? (
            removals.removedRow(key)
          ) : (
            <li key={key}>
              {item.label}
              <button
                ref={removals.focusBack(key)}
                aria-label={`Remove ${item.label}`}
                onClick={() =>
                  removals.remove(item, {
                    done: `Removed “${item.label}”`,
                    restored: `Restored “${item.label}”`,
                    edit: (rest) => ({ kind: "labels", labels: rest }),
                    undo: (rest) => ({
                      kind: "labels",
                      labels: [...rest, item],
                    }),
                  })
                }
              />
            </li>
          ),
        )}
        {removals.status}
      </ul>
    );
  }

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Labels />
    </QueryClientProvider>,
  );
  return { sheet, written };
}

const names = (labels: Label[]) => labels.map((l) => l.label);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("a removal is written at once and undone in its own row", async () => {
  const user = userEvent.setup();
  const { sheet } = setUp([
    { label: "Article by", role: "writer" },
    { label: "Photos by", role: "image" },
  ]);

  await user.click(await screen.findByLabelText("Remove Photos by"));
  expect(
    screen.getByText("Removed “Photos by”", { selector: "li span" }),
  ).toBeTruthy();
  await waitFor(() => expect(names(sheet.labels)).toEqual(["Article by"]));
  /* the row stays, in place, after the reread has dropped it */
  expect(
    screen.getByText("Removed “Photos by”", { selector: "li span" }),
  ).toBeTruthy();
  expect(document.activeElement?.textContent).toBe("Undo");

  await user.click(screen.getByText("Undo"));
  await waitFor(() =>
    expect(names(sheet.labels)).toEqual(["Article by", "Photos by"]),
  );
  await waitFor(() =>
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Remove Photos by",
    ),
  );
  expect(screen.getByRole("status").textContent).toBe("Restored “Photos by”");
});

test("undoing one of two removals puts back only that one", async () => {
  const user = userEvent.setup();
  const { sheet, written } = setUp([
    { label: "Article by", role: "writer" },
    { label: "By", role: "writer" },
    { label: "Photos by", role: "image" },
  ]);

  /* the second removal goes out before the first one's reread arrives */
  await user.click(await screen.findByLabelText("Remove By"));
  await user.click(screen.getByLabelText("Remove Photos by"));
  await waitFor(() => expect(names(sheet.labels)).toEqual(["Article by"]));
  expect(written.map(names)).toEqual([
    ["Article by", "Photos by"],
    ["Article by"],
  ]);

  const [undoBy] = screen.getAllByText("Undo");
  await user.click(undoBy!);
  await waitFor(() =>
    expect(names(sheet.labels)).toEqual(["Article by", "By"]),
  );
  expect(
    screen.getByText("Removed “Photos by”", { selector: "li span" }),
  ).toBeTruthy();
});

test("a removed row goes after eight seconds, but not while hovered", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const { sheet } = setUp([{ label: "By", role: "writer" }]);

  await user.click(await screen.findByLabelText("Remove By"));
  await waitFor(() => expect(sheet.labels).toEqual([]));
  const row = screen
    .getByText("Removed “By”", { selector: "li span" })
    .closest("li")!;
  await user.hover(row);
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(
    screen.queryByText("Removed “By”", { selector: "li span" }),
  ).toBeTruthy();

  await user.unhover(row);
  await act(() => vi.advanceTimersByTimeAsync(8_000));
  expect(
    screen.queryByText("Removed “By”", { selector: "li span" }),
  ).toBeNull();
});
