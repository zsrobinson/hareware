/*
  Where a link to the old Charts page goes (ADR 0014). Its page reads this
  before anything else, so it imports the declarations alone: no React, and
  nothing the archive needs to draw.
*/

import { VIEWS } from "./views";

/** where an address on the old Charts page goes now: its view's page, with the rest of its query */
export function chartsAddress(search: string): string {
  const params = new URLSearchParams(search);
  const asked = params.get("view");
  const id =
    asked === "custom"
      ? (params.get("base") ?? "sections")
      : (asked ?? "sections");
  const view = VIEWS.find((v) => v.id === id && v.layout.type === "chart");
  /* Charts opened on Sections, which is no longer a page's first view */
  if (asked === null || !view) params.set("view", view?.id ?? "sections");
  return `/${view?.source ?? "articles"}?${params}`;
}
