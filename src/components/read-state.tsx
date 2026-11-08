/*
  What an island shows while it reads, and when the read failed: one look and
  one wording across the tools.
*/

import { Throttled } from "~/lib/services/wordpress/request";
import { LoaderCircle } from "./loader-circle";
import { Button } from "./ui/button";

/** "Reading the article…", with the spinner */
export function Reading({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-muted-foreground flex items-center gap-2 text-sm"
      role="status"
    >
      <LoaderCircle className="size-4 animate-spin" />
      {children}
    </p>
  );
}

/** a read that failed, said in words, and the way to ask again */
export function ReadFailed({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <p className="text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
        {retrying ? "Trying…" : "Try again"}
      </Button>
    </div>
  );
}

/** why `what` couldn't be read from WordPress, in the pages' words */
export function couldNotRead(error: unknown, what: string): string {
  return error instanceof Throttled
    ? `WordPress is busy right now, so ${what} couldn't be read. Try again in a minute.`
    : `${what[0]?.toUpperCase()}${what.slice(1)} couldn't be read just now.`;
}
