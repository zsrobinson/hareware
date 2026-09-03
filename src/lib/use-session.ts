import { useEffect, useState } from "react";
import type { Session } from "./session";

/*
  who is signed in, shared by the two islands that care: the editorial nav at
  the top of the sidebar and the account panel at the bottom. they would
  otherwise each ask /api/session.json and could disagree.

  cached pages start without an answer; private pages seed this from their
  server-verified session. the fetch remains the one client-side source.
*/
let session: Session | null | undefined;
let requested = false;

const listeners = new Set<(value: Session | null) => void>();

function publish(value: Session | null) {
  session = value;
  for (const listener of listeners) listener(value);
}

function requestSession() {
  if (requested) return;
  requested = true;

  fetch("/api/session.json")
    .then((r) => (r.ok ? r.json() : { signedIn: false }))
    .then((data: { signedIn?: unknown; discordUserId?: unknown }) =>
      publish(
        data.signedIn === true && typeof data.discordUserId === "string"
          ? { discordUserId: data.discordUserId }
          : null,
      ),
    )
    .catch(() => publish(null));
}

export function useSession(knownByServer: Session | null = null) {
  const [value, setValue] = useState<Session | null>(
    knownByServer ?? session ?? null,
  );

  useEffect(() => {
    /* a page the cdn does not cache already rendered the answer, so there is
       nothing to ask for */
    if (knownByServer) {
      session = knownByServer;
      requested = true;
    }

    const listener = (next: Session | null) => setValue(next);
    listeners.add(listener);

    if (session === undefined) requestSession();
    else setValue(session);

    return () => {
      listeners.delete(listener);
    };
  }, [knownByServer]);

  return value;
}
