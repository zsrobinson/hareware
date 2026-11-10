import type { ArchiveArticle } from "~/lib/credits/archive";
import type { Measure, Member } from "~/lib/credits/stats";
import { tooNewMark } from "./chart-slice";
import { thinText, thinViews, type ViewsSummary } from "~/lib/credits/views";

/**
 * Under a count of views that looks short, a muted line saying so: the
 * zeros are Jetpack's answer and stay drawn, but a board member should not
 * read them as a section nobody reads (~/lib/credits/views `thinViews`)
 */
export function ThinViews({
  articles,
  summary,
  notice = true,
}: {
  articles: readonly Pick<ArchiveArticle, "publishedAt" | "views">[];
  summary: ViewsSummary;
  notice?: boolean;
}) {
  const thin = thinViews(articles, summary);
  if (!thin) return null;
  return (
    <span
      className={
        notice
          ? "block rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
          : "text-muted-foreground block text-xs"
      }
      role="note"
    >
      {thinText(thin)}
    </span>
  );
}

/** a faint dagger beside a number some of whose articles are too new to count */
export function TooNew({
  members,
  measure,
}: {
  members: readonly Member[];
  measure: Measure;
}) {
  const said = tooNewMark(members, measure);
  if (!said) return null;
  return (
    <sup className="text-muted-foreground/70 ml-0.5" title={said}>
      †<span className="sr-only">, {said}</span>
    </sup>
  );
}
