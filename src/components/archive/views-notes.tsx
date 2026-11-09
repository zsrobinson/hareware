import type { ArchiveArticle } from "~/lib/credits/archive";
import { thinText, thinViews, type ViewsSummary } from "~/lib/credits/views";

/**
 * Under a count of views that looks short, a muted line saying so: the
 * zeros are Jetpack's answer and stay drawn, but a board member should not
 * read them as a section nobody reads (~/lib/credits/views `thinViews`)
 */
export function ThinViews({
  articles,
  summary,
}: {
  articles: readonly Pick<ArchiveArticle, "publishedAt" | "views">[];
  summary: ViewsSummary;
}) {
  const thin = thinViews(articles, summary);
  if (!thin) return null;
  return (
    <span className="text-muted-foreground block text-xs" role="note">
      {thinText(thin)}
    </span>
  );
}
