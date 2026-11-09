# Handoff: shared saved views (claude/explorer-saved-views)

Branch off `claude/explorer-polish` at 70f25e4. One WIP commit; split it into
small commits in the repo's voice before review. The spec is
`saved-views-spec.md` in the parent's scratchpad (`panel/`). It decides
everything below and wins over ADR 0014 and plan.md.

## Done (written; tested only as listed under Test status)

- **Sheet `Views` tab** (`src/lib/credits/sheet.ts`). `readSheet` passes the
  rows on unread (`ViewRow`, no JSON parsing in the Worker). `writeViews`
  handles save, rename, create, delete, reorder and restore. Each write is
  checked against the copy it was based on: the row's `updated at`, the
  order for a move, and the starter set for a first write. A failed check
  throws `ViewConflict`. A move leaves `updated at` alone.
- **Edit kinds** (`src/lib/credits/edits.ts`): `view-save`, `view-rename`,
  `view-create`, `view-delete`, `view-reorder`, `views-restore`. The log
  records page and view id only.
- **`/api/sheet`** (`src/pages/api/sheet.ts`): a view write answers
  `{ updatedAt }`; a conflict answers 409 `{ conflict }`, logged as
  `skipped`.
- **Browser side**:
  - `saved-views.ts` reads and checks each row with `readChart` and
    `readPivot`. It lists unreadable rows, falls back to the starter set,
    and turns saving off when the Sheet can't be read.
  - `view-writes.ts` sends a write, then reads it back. It says Saved only
    when the read shows the change, otherwise "unconfirmed" with a recheck.
  - `view-actions.tsx` holds the writer hook, the conflict dialog
    (Reload / Overwrite), the forms and the confirm dialog.
- **The view model** (`view-state.ts`, rewritten):
  - The state holds full values; edits are compared against the view as
    saved.
  - Links carry only what differs from the saved view.
  - An old `view=custom&base=` link opens its base view, edited.
  - A link to a view that is gone sets `missing`, and the page says so.
  - `NEW = "draft"` is the unsaved view the `+` makes. The id `new` was
    taken by the "New people" view.
- **The page** (`explorer.tsx`, `view-tabs.tsx`):
  - The Custom tab is gone. The active tab has a ▾ menu (Rename, Edit
    question, Duplicate, Move left and right, Copy link, Delete with
    confirmation and an Undo toast).
  - There is a `+` for a new view, a maroon dot on an edited tab, and one
    Reset.
  - Save for everyone has a "Save as new view…" menu item.
  - Switching tabs discards unsaved edits, with an Undo toast.
  - The Columns menu edits the view's columns.
- **The maroon tint**: the `--edited*` tokens in `globals.css` and
  `edited.ts`. It goes on Time, Sections, Roles, search, chips, Show,
  Columns, the Customize button, and the Customize rows with "saved: X".
- **The shell** (`archive-shell.tsx`): `useViewEdits` replaces Clear, the
  sheet's Reset and the old group resets. The phone badge counts every
  difference from the saved view.
- **Grouped chips**: `via=` lives in `FilterState`, and `slice-panel.tsx`
  sets it (a 4-line change).
- **Settings**: the Views section is `settings-views.tsx`.
- **Copy as view** is removed (`viewSource`), and so are `carryOver` and
  `CUSTOM`.
- **Docs**: ADR 0015 is new. ADR 0011, ADR 0014, CONTEXT.md, AGENTS.md and
  the README are updated.

## Left to do

1. **Run every gate**: `astro check`, lint, the full test suite,
   `format:check` and `build`. None of these has passed yet. The page
   tests are written but have never run:
   - `saved-views.page.test.tsx`
   - `explorer.test.tsx`
   - `declared-view.test.tsx`
   - `view-tabs.test.tsx` passes.

   Expect some fixes to queries and toast text.
2. **The phone layout of Reset / Save** beside the swiping tab strip is
   unchecked. Look at it in screenshots.
3. **QA screenshots.**
   - The harness server (`qa/server.mjs` in the parent's scratchpad) now has
     an in-memory Views tab, `/qa/views/touch` and `/qa/views/reset`. The
     original is kept as `server.mjs.bak-before-saved`.
   - The states file is in this session's scratchpad as
     `qa/states-saved.mjs`. Copy it across if needed.
   - Command:
     `node shots.mjs <worktree> --name saved --states states-saved.mjs`
   - Shots to capture: the edited state, the tab menu, the Save menu, a
     conflict, and Settings' Views section.
4. **Recheck the delete-then-Undo path on a page still on its starter
   set.** Undo writes against the latest read, so it should not resend the
   starter set.
5. **Split the WIP commit** into small commits, then report to the parent.

## Test status (Pi, after the last change)

`vitest run src/lib/credits src/pages/api` plus `saved-views.test.ts`,
`view-writes.test.ts`, `view-state.test.ts` and `view-tabs.test.tsx`: 14
files, 151 tests, all passing.

`tsc --noEmit` shows no errors in this branch's code. The 5 errors it does
show are Astro virtual modules (`astro:middleware`, `import.meta.env` and
`glob`), which only `astro check` resolves.

## Gotchas

- **Run tools directly, not through npx or npm.** On Node 26, `npx vitest`
  sat at 100% CPU for over 25 minutes on a 6-test file. Use:
  - `node node_modules/vitest/vitest.mjs run …`
  - `node node_modules/typescript/bin/tsc --noEmit -p .`
  - `node node_modules/prettier/bin/prettier.cjs`
- **`wrangler types` hung on the Pi with no output.** Our
  `worker-configuration.d.ts` (gitignored) is the main checkout's, with the
  `.dev.vars`-only names removed. Run `npm run types` properly on the new
  host.
- **`node_modules` on the Pi** is a hard-link copy (`cp -al`) of the main
  checkout's (same lockfile), because `npm ci` was killed by the time
  limit. Run `npm ci` on the new host.
- **Sheet fixtures need the Views tab.** Any test fixture with a read Sheet
  must have `views: []` and `tabs.views`. `pageViews` reads `sheet.views`,
  and `stubArchive({ viewsTab })` gives a Views tab that `/api/sheet`
  writes through the real `applyEdit`.
- **`NEW` is `"draft"`, never `"new"`.** `readRow` rejects a row whose id
  is `draft`.
- **Stay out of the other delegate's files.** `claude/explorer-display-fixes`
  owns `pivot-view.tsx`, `pivot.ts`, `charts.tsx` and `slice-panel.tsx`.
  This branch touches only `SeeIn` in `slice-panel.tsx`.
