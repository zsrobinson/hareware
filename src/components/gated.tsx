/*
  The refusal a gated API names, drawn in place of the page (ADR 0012); the
  asking is ~/lib/gated.
*/

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

/** the page a refused member sees: which refusal, and the one thing to do */
export function DenialMessage({ refusal }: { refusal: RefusalBody }) {
  const { title, body, action } = DENIALS[refusal.denial];
  const returnTo =
    typeof window === "undefined"
      ? "/"
      : `${window.location.pathname}${window.location.search}`;
  const next = actionFor(action, returnTo);

  return (
    <section className="max-w-md space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
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
          {next.label}
        </a>
      )}
    </section>
  );
}
