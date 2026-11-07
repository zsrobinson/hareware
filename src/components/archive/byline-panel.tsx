import { ArrowLeftIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import type { Archive, ArchiveArticle } from "~/lib/credits/archive";
import { ROLE_NAMES, type Role } from "~/lib/credits/labels";
import { same } from "~/lib/credits/sheet";
import { formatDate } from "./dates";
import { useEdit } from "./use-edit";

/* one article printing the byline, the roles it prints it in, and who it
   counts as there */
type Use = {
  article: ArchiveArticle;
  roles: Role[];
  /** this article's own answer; empty when it follows the pen name */
  own: string[];
};

const list = (text: string) =>
  text
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((name, i) => same(name, b[i]!));
const key = (use: Use) => String(use.article.id);

/** every article printing a byline, oldest first */
export function usesOf(archive: Archive, byline: string): Use[] {
  return archive.articles
    .flatMap((article): Use[] => {
      const credits = article.credits.filter((c) =>
        c.bylines.some((b) => same(b, byline)),
      );
      if (credits.length === 0) return [];
      const own = credits
        .flatMap((c) => c.contributors)
        .filter(
          (p) => p.source === "article" && p.byline && same(p.byline, byline),
        )
        .map((p) => p.name);
      return [
        {
          article,
          roles: [...new Set(credits.map((c) => c.role))],
          own: [...new Set(own)],
        },
      ];
    })
    .sort((a, b) => a.article.publishedAt.localeCompare(b.article.publishedAt));
}

/**
 * Who a byline is, on every article and on each one: how a pen name passes
 * from one person to another, as when a series changes hands. Changing who it
 * counts as keeps the articles already published with the person they were,
 * unless the editor says otherwise.
 */
export function BylinePanel({
  byline,
  archive,
  everyone,
  onBack,
  onDone,
  handOverTo,
}: {
  byline: string;
  archive: Archive;
  everyone: string[];
  /** opens with this person already typed in, as a hand-over to them */
  handOverTo?: string;
  /** shows a way back to where the panel was opened from */
  onBack?: () => void;
  onDone?: () => void;
}) {
  const save = useEdit();
  const names = useId();
  const uses = usesOf(archive, byline);
  const before =
    archive.penNames.find((pen) => same(pen.byline, byline))?.realName ?? [];

  const [everywhere, setEverywhere] = useState(handOverTo ?? before.join(", "));
  const [own, setOwn] = useState<Record<string, string>>(() =>
    Object.fromEntries(uses.map((use) => [key(use), use.own.join(", ")])),
  );
  const [keepEarlier, setKeepEarlier] = useState(true);

  const after = list(everywhere);
  const handedOver = !sameList(after, before);
  /* the articles that would change hands with the pen name */
  const following = uses.filter(
    (use) => list(own[key(use)] ?? "").length === 0,
  );
  const asking = handedOver && before.length > 0 && following.length > 0;

  const wanted = (use: Use) => {
    const typed = list(own[key(use)] ?? "");
    if (typed.length > 0) return typed;
    return asking && keepEarlier ? before : [];
  };
  const changes = uses.filter((use) => !sameList(wanted(use), use.own));
  const changed = handedOver || changes.length > 0;

  const shown = (names: string[]) =>
    names.length > 0 ? names.join(" and ") : "as printed";

  const submit = () =>
    save.mutate(
      {
        edit: {
          kind: "byline",
          byline,
          everywhere: handedOver ? after : undefined,
          articles: changes.flatMap((use) =>
            use.roles.map((role) => ({
              postId: use.article.id,
              role,
              realNames: wanted(use),
            })),
          ),
        },
        undo: {
          kind: "byline",
          byline,
          everywhere: handedOver ? before : undefined,
          articles: changes.flatMap((use) =>
            use.roles.map((role) => ({
              postId: use.article.id,
              role,
              realNames: use.own,
            })),
          ),
        },
        done: handedOver
          ? `${byline} now counts as ${shown(after)}${
              asking && keepEarlier
                ? `; ${following.length} earlier ${following.length === 1 ? "article stays" : "articles stay"} ${shown(before)}`
                : ""
            }`
          : `Saved who ${byline} is on ${changes.length} ${changes.length === 1 ? "article" : "articles"}`,
      },
      { onSuccess: onDone },
    );

  return (
    <>
      <SheetHeader>
        {onBack && (
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground -ml-2 w-fit"
            onClick={onBack}
          >
            <ArrowLeftIcon /> Back
          </Button>
        )}
        <SheetTitle>{byline}</SheetTitle>
        <SheetDescription>
          Printed on {uses.length} {uses.length === 1 ? "article" : "articles"}
        </SheetDescription>
      </SheetHeader>

      <form
        className="space-y-6 px-4 pb-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed) submit();
        }}
      >
        <datalist id={names}>
          {everyone.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Counts as</span>
          <Input
            list={names}
            value={everywhere}
            placeholder="as printed"
            onChange={(event) => setEverywhere(event.target.value)}
          />
          <span className="text-muted-foreground block text-xs">
            On every article below unless it says otherwise, and on later ones.
            Separate two people with a comma.
          </span>
        </label>

        {asking && (
          <fieldset className="space-y-1.5 text-sm">
            <legend className="sr-only">The articles already published</legend>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                className="accent-foreground mt-1"
                checked={keepEarlier}
                onChange={() => setKeepEarlier(true)}
              />
              <span>
                Keep the {following.length} earlier{" "}
                {following.length === 1 ? "article" : "articles"} as{" "}
                {shown(before)}
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                className="accent-foreground mt-1"
                checked={!keepEarlier}
                onChange={() => setKeepEarlier(false)}
              />
              <span>
                Count {following.length === 1 ? "it" : "them"} as {shown(after)}{" "}
                too
              </span>
            </label>
          </fieldset>
        )}

        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-medium">
            Each article
          </h3>
          <ul className="space-y-3">
            {uses.map((use) => (
              <li key={key(use)} className="space-y-1.5">
                <div className="text-sm">
                  <span className="font-medium">{use.article.title}</span>
                  <span className="text-muted-foreground block text-xs">
                    {formatDate(use.article.publishedAt)} ·{" "}
                    {use.roles.map((role) => ROLE_NAMES[role]).join(", ")}
                    {use.own.length > 0 && " · only this article"}
                  </span>
                </div>
                <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    counts as
                  </span>
                  <Input
                    list={names}
                    className="h-8"
                    value={own[key(use)] ?? ""}
                    placeholder={shown(asking && keepEarlier ? before : after)}
                    aria-label={`Who ${byline} is on ${use.article.title}`}
                    onChange={(event) =>
                      setOwn({ ...own, [key(use)]: event.target.value })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {changed && (
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEverywhere(before.join(", "));
                setOwn(
                  Object.fromEntries(
                    uses.map((use) => [key(use), use.own.join(", ")]),
                  ),
                );
                setKeepEarlier(true);
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </form>
    </>
  );
}
