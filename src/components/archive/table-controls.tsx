import type { TableControls } from "~/components/data-table";
import { PageActions } from "~/components/page-actions";
import { PanelGroup } from "~/components/panel";
import { SheetGroup, ToolbarEnd } from "./archive-shell";

/**
 * Where an archive table's controls go: Columns after the toolbar's divider,
 * Download CSV in the title row, and both in a "Table" group of the phone's
 * Customize sheet, which is where a phone keeps them.
 */
export function ShellTableControls({ columns, download }: TableControls) {
  return (
    <>
      <ToolbarEnd>{columns}</ToolbarEnd>
      {download && (
        <PageActions>
          <span className="contents max-md:hidden">{download}</span>
        </PageActions>
      )}
      <SheetGroup>
        <PanelGroup label="Table">
          <div className="flex flex-wrap gap-2">
            {columns}
            {download}
          </div>
        </PanelGroup>
      </SheetGroup>
    </>
  );
}
