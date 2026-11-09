import { useState, type ReactNode } from "react";
import { SidePanel } from "~/components/panel";
import { NewspaperIcon, UsersIcon } from "lucide-react";
import { Button, buttonVariants } from "~/components/ui/button";
import type { ArchiveArticle } from "~/lib/credits/archive";
import { ROLE_NAMES, ROLES, type Role } from "~/lib/credits/labels";
import { compareSections } from "~/lib/credits/sections";
import { contributionsOn } from "~/lib/credits/person";
import {
  easternDate,
  isCounted,
  isQuantity,
  quantityOf,
  type Filters,
  type Measure,
  type Member,
} from "~/lib/credits/stats";
import { cn } from "~/lib/utils";
import { counted, type SliceFilters } from "./chart-slice";
import { formatDate } from "./dates";
import { useTrail } from "./archive-shell";
import { archiveHref, articleHref, personHref, type Trail } from "./open-row";
import { SectionName } from "./section-name";

/* a long slice draws its first rows at once and the rest when asked */
const FIRST = 100;

const newest = (a: ArchiveArticle, b: ArchiveArticle) =>
  Date.parse(b.publishedAt) - Date.parse(a.publishedAt);

/**
 * What a chart's mark counts, beside the chart: the articles, the
 * contributions by article, the people with their count, the newcomers
 * with where they started, or the articles with their words or views, the
 * most first, which the mark's number is the sum of.
 */
export function SlicePanel({
  title,
  caption,
  back,
  measure,
  members,
  filters,
  seeing,
  onClose,
  restoreFocus,
}: {
  title: string;
  caption: string;
  /** the phone's Back, named for the view the slice is on */
  back: string;
  measure: Measure;
  members: Member[];
  /** whose contributions count, which says whose names an article's row shows */
  filters: Filters;
  /** the slice as each table's filters, for the links to them; none in a test of the rows alone */
  seeing?: SliceFilters;
  onClose: () => void;
  restoreFocus: () => HTMLElement | null;
}) {
  return (
    <SidePanel
      title={title}
      back={back}
      onClose={onClose}
      restoreFocus={restoreFocus}
    >
      <div className="-mt-3 space-y-3">
        <p className="text-muted-foreground text-sm">{caption}</p>
        {seeing && <SeeIn seeing={seeing} />}
        <Rows measure={measure} members={members} filters={filters} />
      </div>
    </SidePanel>
  );
}

/* the same slice as a table to sort, read through and download: a chart's
   search is of articles, which People's is not, so it goes only to Articles */
function SeeIn({ seeing }: { seeing: SliceFilters }) {
  const link = cn(buttonVariants({ variant: "outline", size: "sm" }));
  return (
    <div className="flex flex-wrap gap-2">
      <a
        className={link}
        href={archiveHref("articles", {
          state: seeing.articles,
          searching: "articles",
        })}
      >
        <NewspaperIcon />
        See in Articles
      </a>
      <a
        className={link}
        href={archiveHref("people", {
          state: seeing.people,
          searching: "articles",
        })}
      >
        <UsersIcon />
        See the people
      </a>
      {seeing.broader && (
        <p className="text-muted-foreground w-full text-xs">
          Too many articles to name in a link, so these open on the people's
          whole record in these filters, not on these articles alone.
        </p>
      )}
    </div>
  );
}

function Rows({
  measure,
  members,
  filters,
}: {
  measure: Measure;
  members: Member[];
  filters: Filters;
}) {
  const [all, setAll] = useState(false);
  const rows = rowsOf(measure, members, filters, useTrail());
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
  filters: Filters,
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
                names={contributionsOn(article)
                  .filter(isCounted(filters))
                  .map((c) => ({ name: c.person }))}
              />
            </Meta>
          </>
        ),
      }));

  if (isQuantity(measure)) {
    const unit = measure === "words" ? "word" : "view";
    return members
      .map((member) => member.units[0]!.article)
      .map((article) => ({ article, own: quantityOf(article, measure) }))
      .sort(
        (a, b) => (b.own ?? -1) - (a.own ?? -1) || newest(a.article, b.article),
      )
      .map(({ article, own }) => ({
        key: String(article.id),
        content: (
          <>
            <div className="flex items-baseline gap-2">
              <Title article={article} className="min-w-0 flex-1" />
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {own === null
                  ? "not counted yet"
                  : counted(own, unit, `${unit}s`)}
              </span>
            </div>
            <Meta article={article}>
              <Names
                names={contributionsOn(article)
                  .filter(isCounted(filters))
                  .map((c) => ({ name: c.person }))}
              />
            </Meta>
          </>
        ),
      }));
  }

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

function Title({
  article,
  className,
}: {
  article: ArchiveArticle;
  className?: string;
}) {
  return (
    <a
      href={articleHref(article.id, useTrail())}
      className={cn(
        "block font-medium underline-offset-4 hover:underline",
        className,
      )}
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
