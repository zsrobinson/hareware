/*
  The refusal a gated API names, drawn in place of the page (ADR 0012); the
  asking is ~/lib/gated.
*/

import { DiscordMark } from "~/components/discord-mark";
import { buttonVariants } from "~/components/ui/button";
import type { RefusalBody } from "~/lib/admin-api";
import { DENIALS, type Action } from "~/lib/denial";

/** where each action goes, with the label beside it so both stay in step */
function actionFor(action: Action, returnTo: string) {
  switch (action) {
    case "sign-in":
      return {
        label: "Sign in with Discord",
        href: `/auth/discord?${new URLSearchParams({ returnTo })}`,
      };
    case "retry":
      return { label: "Try again", href: returnTo };
    case "switch-account":
      return {
        label: "Use a different account",
        href: `/sign-in?${new URLSearchParams({ returnTo })}`,
        post: true,
      };
    case "leave":
      return { label: "Back to the tools", href: "/generate" };
  }
}

/**
 * Which refusal, in a line, and the one thing to do about it. Under a tool's
 * own title it is a section of that page; on /access-denied, which has no
 * title of its own, it is the page's heading.
 */
export function DenialMessage({
  refusal,
  level = "section",
}: {
  refusal: RefusalBody;
  level?: "page" | "section";
}) {
  const { title, body, action } = DENIALS[refusal.denial];
  const returnTo =
    typeof window === "undefined"
      ? "/"
      : `${window.location.pathname}${window.location.search}`;
  const next = actionFor(action, returnTo);
  const Heading = level === "page" ? "h1" : "h2";

  return (
    <section className="max-w-md space-y-4">
      <div className="space-y-1">
        <Heading
          className={
            level === "page"
              ? "text-2xl font-semibold tracking-tight"
              : "text-base font-semibold"
          }
        >
          {title}
        </Heading>
        <p className="text-muted-foreground text-sm">
          {body(refusal.you ?? "This account")}
        </p>
      </div>
      {next.post ? (
        /* signing out is a POST, like the account menu's */
        <form method="post" action="/auth/logout">
          <input type="hidden" name="returnTo" value={next.href} />
          <button type="submit" className={buttonVariants()}>
            {next.label}
          </button>
        </form>
      ) : (
        <a href={next.href} className={buttonVariants()}>
          {/* the sidebar's sign-in carries the mark too: one action, one look */}
          {action === "sign-in" && <DiscordMark />}
          {next.label}
        </a>
      )}
    </section>
  );
}
