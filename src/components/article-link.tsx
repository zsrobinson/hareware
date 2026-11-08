/*
  The link a tool starts from, with the button that reads it: Instagram Posts
  and InDesign Export open the same way. A plain GET form, so the address names
  the article and a reload or a shared link reads it again.
*/

import { ExternalLinkIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button, buttonVariants } from "./ui/button";
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
  /** the article's link once read, which the field shows in full and opens */
  link?: string;
  error: string | null;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <form action={action} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            /* remounted once the article is read, to show its full link */
            key={link ?? "typed"}
            type="text"
            name="article"
            defaultValue={link ?? typed}
            placeholder="Paste an article link"
            aria-label="Article link"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "article-link-error" : undefined}
            spellCheck={false}
            className={cn("font-mono md:text-[13px]", link && "pr-8")}
          />
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              aria-label="Open on theumdhare.com"
              title="Open on theumdhare.com"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-xs" }),
                "text-muted-foreground absolute top-1 right-1",
              )}
            >
              <ExternalLinkIcon />
            </a>
          )}
        </div>
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
