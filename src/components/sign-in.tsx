/*
  Where a failed OAuth callback, or "use a different account", lands. A static
  page (ADR 0012): this asks /api/session.json who is signed in, and sends a
  signed-in visitor with nothing gone wrong on to where they were going.
*/

import { useEffect, useState } from "react";
import { returnToOf } from "~/lib/return-to";
import { buttonVariants } from "./ui/button";

const ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled. Nothing changed.",
  invalid_state: "That sign-in attempt expired. Try again.",
  discord: "Discord sign-in failed. Try again.",
  not_configured: import.meta.env.DEV
    ? "Discord sign-in is not configured. Follow the README setup checklist."
    : "Sign-in is temporarily unavailable.",
};

export function SignIn() {
  const [{ returnTo, code }] = useState(() => {
    /* client-only, so the address is there on the first render */
    const url = new URL(window.location.href);
    return {
      returnTo: returnToOf(url),
      code: url.searchParams.get("error") ?? "",
    };
  });
  const error = ERRORS[code] ?? null;
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/session.json", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ signedIn: boolean }>)
      .then(({ signedIn }) => {
        if (signedIn && !error) window.location.replace(returnTo);
        else setSignedIn(signedIn);
      })
      .catch(() => setSignedIn(false));
  }, [error, returnTo]);

  /* signed in already and back with an error: the error is what happened */
  const title = signedIn ? "Sign in again" : "Sign in to HareWare";
  const configured = code !== "not_configured";

  return (
    <section className="max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="text-muted-foreground mt-1 text-sm">
        {error ?? "HareWare uses your Discord account to know who you are."}
      </div>
      {configured && (
        <a
          href={`/auth/discord?${new URLSearchParams({ returnTo })}`}
          className={`${buttonVariants()} mt-4`}
        >
          {signedIn ? "Sign in again" : "Sign in with Discord"}
        </a>
      )}
    </section>
  );
}
