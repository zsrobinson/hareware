import { useState, type ReactNode } from "react";
import { SidePanel } from "~/components/panel";
import { Button } from "~/components/ui/button";
import type { ArchiveArticle } from "~/lib/credits/archive";
import { ROLE_NAMES, ROLES, type Role } from "~/lib/credits/labels";
import { compareSections } from "~/lib/credits/sections";
import { easternDate, type Measure, type Member } from "~/lib/credits/stats";
import { cn } from "~/lib/utils";
import { counted } from "./chart-slice";
import { formatDate } from "./dates";
import { useTrail } from "./archive-shell";
import { articleHref, personHref, type Trail } from "./open-row";
import { SectionName } from "./section-name";

/* a long slice draws its first rows at once and the rest when asked */
const FIRST = 100;

const newest = (a: ArchiveArticle, b: ArchiveArticle) =>
  Date.parse(b.publishedAt) - Date.parse(a.publishedAt);

/**
 * What a chart's mark counts, beside the chart: the articles, the
 * contributions by article, the people with their count, or the newcomers
 * with where they started.
 */
export function SlicePanel({
  title,
  caption,
  measure,
  members,
  roles,
  onClose,
  restoreFocus,
}: {
  title: string;
  caption: string;
  measure: Measure;
  members: Member[];
  /** the role filter, which says whose names an article's row shows */
  roles: Role[];
  onClose: () => void;
  restoreFocus: () => HTMLElement | null;
}) {
  return (
    <SidePanel
      title={title}
      back="Charts"
      onClose={onClose}
      restoreFocus={restoreFocus}
    >
      <div className="-mt-3 space-y-3">
        <p className="text-muted-foreground text-sm">{caption}</p>
        <Rows measure={measure} members={members} roles={roles} />
      </div>
    </SidePanel>
  );
}

function Rows({
  measure,
  members,
  roles,
}: {
  measure: Measure;
  members: Member[];
  roles: Role[];
}) {
  const [all, setAll] = useState(false);
  const rows = rowsOf(measure, members, roles, useTrail());
  if (rows.length === 0)
    return <p className="text-muted-foreground text-sm">Nothing here.</p>;
  const shown = all ? rows : rows.slice(0, FIRST);
  return (
    <>
      <ul className="divide-y border-y">
        {shown.map((row) => (
          <li key={row.key} className="space-y-0.5 py-2.5 text-sm">
            {row.content}
          </li>
        ))}
      </ul>
      {shown.length < rows.length && (
        <Button variant="outline" size="sm" onClick={() => setAll(true)}>
          Show all {rows.length.toLocaleString()}
        </Button>
      )}
    </>
  );
}

type Row = { key: string; content: ReactNode };

function rowsOf(
  measure: Measure,
  members: Member[],
  roles: Role[],
  trail: Trail,
): Row[] {
  if (measure === "articles")
    return members
      .map((member) => member.units[0]!.article)
      .sort(newest)
      .map((article) => ({
        key: String(article.id),
        content: (
          <>
            <Title article={article} />
            <Meta article={article}>
              <Names
                names={[
                  ...new Set(
                    article.credits
                      .filter(
                        (credit) =>
                          roles.length === 0 || roles.includes(credit.role),
                      )
                      .flatMap((credit) =>
                        credit.contributors.map((c) => c.name),
                      ),
                  ),
                ].map((name) => ({ name }))}
              />
            </Meta>
          </>
        ),
      }));

  if (measure === "contributions") {
    /* one row an article, with who did what on it */
    const byArticle = new Map<
      number,
      { article: ArchiveArticle; who: { name: string; role?: Role }[] }
    >();
    for (const { units } of members)
      for (const unit of units) {
        const row = byArticle.get(unit.article.id) ?? {
          article: unit.article,
          who: [],
        };
        row.who.push({ name: unit.person!, role: unit.role });
        byArticle.set(unit.article.id, row);
      }
    return [...byArticle.values()]
      .sort((a, b) => newest(a.article, b.article))
      .map(({ article, who }) => ({
        key: String(article.id),
        content: (
          <>
            <Title article={article} />
            <Meta article={article}>
              <Names names={who} />
            </Meta>
          </>
        ),
      }));
  }

  if (measure === "newcomers")
    return members
      .map((member) => member.units[0]!)
      .sort((a, b) => newest(a.article, b.article))
      .map((unit) => ({
        key: unit.person!,
        content: (
          <>
            <Person name={unit.person!} />
            <div className="text-muted-foreground text-xs">
              First:{" "}
              <a
                href={articleHref(unit.article.id, trail)}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {unit.article.title}
              </a>
            </div>
            <Meta article={unit.article}>
              {unit.role && ROLE_NAMES[unit.role]}
            </Meta>
          </>
        ),
      }));

  /* people: each with what they did in the slice, the most first */
  return members
    .map((member) => ({ name: String(member.id), units: member.units }))
    .sort(
      (a, b) => b.units.length - a.units.length || a.name.localeCompare(b.name),
    )
    .map(({ name, units }) => {
      const sections = [...new Set(units.map((u) => u.article.section))].sort(
        compareSections,
      );
      const latest = units
        .map((u) => easternDate(u.article.publishedAt))
        .sort()
        .at(-1)!;
      return {
        key: name,
        content: (
          <>
            <div className="flex items-baseline gap-2">
              <Person name={name} className="min-w-0 flex-1" />
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {counted(units.length, "contribution", "contributions")}
              </span>
            </div>
            <div className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
              <span>Latest {formatDate(latest)}</span>
              {sections.map((section) => (
                <SectionName key={section} section={section} />
              ))}
            </div>
          </>
        ),
      };
    });
}

function Title({ article }: { article: ArchiveArticle }) {
  return (
    <a
      href={articleHref(article.id, useTrail())}
      className="block font-medium underline-offset-4 hover:underline"
    >
      {article.title}
    </a>
  );
}

function Person({ name, className }: { name: string; className?: string }) {
  return (
    <a
      href={personHref(name, useTrail())}
      className={cn(
        "block font-medium underline-offset-4 hover:underline",
        className,
      )}
    >
      {name}
    </a>
  );
}

/** an article's date and section, then whatever the row adds */
function Meta({
  article,
  children,
}: {
  article: ArchiveArticle;
  children?: ReactNode;
}) {
  return (
    <div className="text-muted-foreground text-xs">
      {formatDate(article.publishedAt)} ·{" "}
      <SectionName section={article.section} />
      {children && <> · {children}</>}
    </div>
  );
}

/** each person once, with every role of theirs: "Ada Example (Writing, Image)" */
function Names({ names }: { names: { name: string; role?: Role }[] }) {
  const trail = useTrail();
  if (names.length === 0) return <span>No credits</span>;
  const roles = new Map<string, Role[]>();
  for (const { name, role } of names) {
    const held = roles.get(name) ?? [];
    if (role && !held.includes(role)) held.push(role);
    roles.set(name, held);
  }
  return [...roles].map(([name, held], index) => (
    <span key={name}>
      {index > 0 && ", "}
      <a
        href={personHref(name, trail)}
        className="text-foreground underline-offset-4 hover:underline"
      >
        {name}
      </a>
      {held.length > 0 &&
        ` (${held
          .sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b))
          .map((role) => ROLE_NAMES[role])
          .join(", ")})`}
    </span>
  ));
}
