import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";
import type { SheetPayload } from "~/lib/credits/load";
import type { ViewRow } from "~/lib/credits/sheet";
import { pageViews, storedOf, starterOf } from "./saved-views";
import {
  deleteIntent,
  reorderIntent,
  saveIntent,
  writeViews,
} from "./view-writes";
import { VIEWS, type View } from "./views";

/*
  A write is Saved only when the Sheet, read back, shows it. These answer
  /api/sheet and /api/archive.json from a Views tab in memory; nothing here
  reaches the club's Sheet.
*/

const starter = starterOf("articles").map((s) => s.view);
const all = VIEWS.find((v) => v.id === "all")! as View;
const renamed: View = { ...all, label: "Everything" };

const payload = (rows: ViewRow[]): SheetPayload => ({
  sheet: {
    status: "read",
    overrides: [],
    unscoped: [],
    ignored: [],
    labels: null,
    views: rows,
    problems: [],
    tabs: { overrides: true, labels: true, ignored: true, views: true },
  },
});
const rowOf = (view: View, position: number, updatedAt: string): ViewRow => ({
  row: position + 1,
  id: view.id,
  page: view.source,
  position: String(position),
  view: JSON.stringify(storedOf(view).view),
  updatedBy: "Riley Real",
  updatedAt,
});

/**
 * /api/sheet as `answer` says, and the read after it as `then` says. Each
 * POST's body is kept, to see what was sent
 */
function serve(
  answer: () => Response,
  then: () => Response | Promise<Response>,
) {
  const sent: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/sheet") {
        sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return answer();
      }
      return then();
    }),
  );
  return sent;
}

afterEach(() => vi.unstubAllGlobals());

const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

test("a save the Sheet reads back is Saved, and the first write sends the starter set", async () => {
  const sent = serve(
    () => Response.json({ updatedAt: "T1" }),
    () =>
      Response.json(
        payload(
          starter.map((v, i) =>
            rowOf(v.id === "all" ? renamed : v, i + 1, "T1"),
          ),
        ),
      ),
  );
  const copy = pageViews(payload([]), "articles");

  const outcome = await writeViews(
    client(),
    "articles",
    copy,
    saveIntent(renamed, ""),
    starter,
  );

  expect(outcome).toEqual({ status: "saved" });
  expect(sent[0]).toMatchObject({
    kind: "view-save",
    page: "articles",
    id: "all",
    basedOn: "",
  });
  expect((sent[0]!.starter as unknown[]).length).toBe(starter.length);
});

test("a save the Sheet took but whose read does not show it is not confirmed, never Saved", async () => {
  let read = payload([rowOf(all, 1, "T0")]);
  serve(
    () => Response.json({ updatedAt: "T1" }),
    () => Response.json(read),
  );
  const copy = pageViews(read, "articles");

  const outcome = await writeViews(
    client(),
    "articles",
    copy,
    saveIntent(renamed, "T0"),
    starter,
  );
  expect(outcome.status).toBe("unconfirmed");

  /* the next read shows it: Recheck says Saved */
  read = payload([rowOf(renamed, 1, "T1")]);
  expect(outcome.status === "unconfirmed" && (await outcome.recheck())).toEqual(
    {
      status: "saved",
    },
  );
});

test("a read back that fails, or an answer with no stamp, is not confirmed", async () => {
  const copy = pageViews(payload([rowOf(all, 1, "T0")]), "articles");
  serve(
    () => Response.json({ updatedAt: "T1" }),
    () => new Response("could not read the Sheet", { status: 502 }),
  );
  expect(
    (
      await writeViews(
        client(),
        "articles",
        copy,
        saveIntent(renamed, "T0"),
        starter,
      )
    ).status,
  ).toBe("unconfirmed");

  serve(
    () => new Response(null, { status: 204 }),
    () => Response.json(payload([rowOf(renamed, 1, "T1")])),
  );
  expect(
    (
      await writeViews(
        client(),
        "articles",
        copy,
        saveIntent(renamed, "T0"),
        starter,
      )
    ).status,
  ).toBe("unconfirmed");
});

test("a refused or failed save says what went wrong, and is not Saved", async () => {
  const copy = pageViews(payload([rowOf(all, 1, "T0")]), "articles");
  serve(
    () => new Response("google sheets answered 500", { status: 502 }),
    () => Response.json(payload([rowOf(renamed, 1, "T1")])),
  );
  expect(
    await writeViews(
      client(),
      "articles",
      copy,
      saveIntent(renamed, "T0"),
      starter,
    ),
  ).toEqual({ status: "failed", message: "google sheets answered 500" });

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
  expect(
    (
      await writeViews(
        client(),
        "articles",
        copy,
        saveIntent(renamed, "T0"),
        starter,
      )
    ).status,
  ).toBe("failed");
});

test("a save based on an older copy comes back as a conflict, and Overwrite is based on the Sheet's", async () => {
  const sent = serve(
    () =>
      Response.json(
        { conflict: "Someone changed this view since you opened it" },
        { status: 409 },
      ),
    () => Response.json(payload([rowOf(all, 1, "T5")])),
  );
  const copy = pageViews(payload([rowOf(all, 1, "T0")]), "articles");

  expect(
    await writeViews(
      client(),
      "articles",
      copy,
      saveIntent(renamed, "T0"),
      starter,
    ),
  ).toEqual({
    status: "conflict",
    message: "Someone changed this view since you opened it",
  });

  /* overwriting: the same change, on the copy the Sheet holds now */
  const fresh = pageViews(payload([rowOf(all, 1, "T5")]), "articles");
  await writeViews(
    client(),
    "articles",
    fresh,
    saveIntent(renamed, null),
    starter,
  );
  expect(sent[1]).toMatchObject({ basedOn: "T5", starter: null });
});

test("a delete or a move is Saved only once the read shows the views as they should be", async () => {
  const history = VIEWS.find((v) => v.id === "history")! as View;
  const rows = [rowOf(all, 1, "T0"), rowOf(history, 2, "T0")];
  const copy = pageViews(payload(rows), "articles");

  serve(
    () => Response.json({ updatedAt: "T1" }),
    () => Response.json(payload(rows)),
  );
  expect(
    (
      await writeViews(
        client(),
        "articles",
        copy,
        deleteIntent("history", "T0"),
        starter,
      )
    ).status,
  ).toBe("unconfirmed");
  expect(
    (
      await writeViews(
        client(),
        "articles",
        copy,
        reorderIntent(["history", "all"]),
        starter,
      )
    ).status,
  ).toBe("unconfirmed");

  serve(
    () => Response.json({ updatedAt: "T1" }),
    () =>
      Response.json(
        payload([
          { ...rows[1]!, position: "1" },
          { ...rows[0]!, position: "2" },
        ]),
      ),
  );
  expect(
    (
      await writeViews(
        client(),
        "articles",
        copy,
        reorderIntent(["history", "all"]),
        starter,
      )
    ).status,
  ).toBe("saved");
});

test("a page whose Sheet cannot be read writes nothing", async () => {
  const sent = serve(
    () => Response.json({ updatedAt: "T1" }),
    () => Response.json(payload([])),
  );
  const copy = pageViews(
    { sheet: { status: "failed", reason: "403" } },
    "articles",
  );

  expect(
    (
      await writeViews(
        client(),
        "articles",
        copy,
        saveIntent(renamed, ""),
        starter,
      )
    ).status,
  ).toBe("failed");
  expect(sent).toEqual([]);
});
