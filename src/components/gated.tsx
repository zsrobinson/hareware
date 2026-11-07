/*
  The admin pages are static shells (ADR 0012): what makes one private is its
  data, which only a gated API hands out. These read that API, and when it says
  no, draw the refusal it names in place of the page.
*/

import { buttonVariants } from "~/components/ui/button";
import type { RefusalBody } from "~/lib/admin-api";
import { DENIALS, type Action } from "~/lib/denial";

/** a gated API's refusal, carried as an error so a query can hold it */
export class Refused extends Error {
  constructor(readonly body: RefusalBody) {
    super(DENIALS[body.denial].title);
  }
}

/** a gated API's answer, or a `Refused`, or an error saying what went wrong */
export async function fetchGated<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (response.ok) return (await response.json()) as T;

  const text = await response.text();
  try {
    const body = JSON.parse(text) as Partial<RefusalBody>;
    if (body.denial && body.denial in DENIALS)
      throw new Refused(body as RefusalBody);
  } catch (error) {
    if (error instanceof Refused) throw error;
  }
  throw new Error(text || `HareWare answered ${response.status}`);
}

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
