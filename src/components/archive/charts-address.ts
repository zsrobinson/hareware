/*
  Where a link to the old Charts page goes (ADR 0014). Its page reads this
  before anything else, so it imports the declarations alone: no React, and
  nothing the archive needs to draw.
*/

import { RENAMED, VIEWS } from "./views";

/** where an address on the old Charts page goes now: its view's page, with the rest of its query */
export function chartsAddress(search: string): string {
  const params = new URLSearchParams(search);
  const asked = params.get("view");
  const id =
    asked === "custom"
      ? (params.get("base") ?? "sections")
      : (asked ?? "sections");
  /* each of its views was a chart, or has been merged into another since */
  const view = RENAMED[id]
    ? VIEWS.find((v) => v.id === RENAMED[id])
    : VIEWS.find((v) => v.id === id && v.layout.type === "chart");
  if (view && asked === "custom") params.set("base", view.id);
  /* Charts opened on Sections, which is no longer a page's first view */
  else if (asked === null || !view || view.id !== asked)
    params.set("view", view?.id ?? "sections");
  return `/${view?.source ?? "articles"}?${params}`;
}
