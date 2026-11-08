/*
  The link a tool starts from, with the button that reads it: Instagram Posts
  and InDesign Export open the same way. A plain GET form, so the address names
  the article and a reload or a shared link reads it again.
*/

import { cn } from "~/lib/utils";
import { useIsPhone } from "./panel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function ArticleLink({
  action,
  verb,
  typed,
  link,
  error,
  className,
}: {
  /** the tool's own path, which reads `?article=` */
  action: string;
  verb: string;
  /** what the address held, shown until the article is read */
  typed: string;
  /** the article's link once read, which the field shows in full */
  link?: string;
  error: string | null;
  className?: string;
}) {
  /* a phone has no room for the scheme; the link reads without it */
  const phone = useIsPhone();
  const shown = link && phone ? link.replace(/^https?:\/\//, "") : link;

  return (
    <div className={cn("space-y-1.5", className)}>
      <form action={action} className="flex gap-2">
        <Input
          /* remounted once the article is read, to show its full link */
          key={shown ?? "typed"}
          type="text"
          name="article"
          defaultValue={shown ?? typed}
          placeholder="Paste an article link"
          aria-label="Article link"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "article-link-error" : undefined}
          spellCheck={false}
          /* below 16px a phone zooms in on focus, so 13px is a laptop's */
          className="min-w-0 flex-1 font-mono placeholder:font-sans md:text-[13px]"
        />
        <Button type="submit">{verb}</Button>
      </form>
      {error && (
        <p id="article-link-error" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
