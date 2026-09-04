import { useEffect, useSyncExternalStore } from "react";
import type { Profile } from "./member";
import type { Session } from "./session";

/*
  who is signed in, shared by the two islands that care: the editorial nav at
  the top of the sidebar and the account panel at the bottom. they would
  otherwise each ask /api/session.json and could disagree.

  cached pages start without an answer; private pages seed this from their
  server-verified session. the fetch remains the one client-side source.
*/
let session: Session | null | undefined;
/* what to call them, read live by the api route rather than kept anywhere */
let profile: Profile | null = null;
/* whether that member may see the admin tools. the same answer, from the same
   request, so the two cannot disagree */
let admin = false;
let requested = false;

const listeners = new Set<() => void>();

function publish(
  value: Session | null,
  isAdmin = false,
  who: Profile | null = null,
) {
  session = value;
  admin = isAdmin;
  profile = who;
  for (const listener of listeners) listener();
}

function requestSession() {
  if (requested) return;
  requested = true;

  fetch("/api/session.json")
    // json() is typed unknown under the workers types, so narrow it here
    .then((r) => (r.ok ? r.json() : { signedIn: false }))
    .then(
      (body) =>
        body as {
          signedIn?: unknown;
          discordUserId?: unknown;
          profile?: unknown;
          admin?: unknown;
        },
    )
    .then((data) =>
      publish(
        data.signedIn === true && typeof data.discordUserId === "string"
          ? { discordUserId: data.discordUserId }
          : null,
        data.admin === true,
        readProfile(data.profile),
      ),
    )
    .catch(() => publish(null));
}

/** discord's answer off the wire, kept only if it is the shape we asked for */
function readProfile(value: unknown): Profile | null {
  if (!value || typeof value !== "object") return null;

  const who = value as Record<string, unknown>;
  const strings = ["displayName", "username", "avatarUrl"] as const;

  return strings.every((key) => typeof who[key] === "string")
    ? (who as Profile)
    : null;
}

/** react's contract for the store above: subscribe, and read */
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function useSession(knownByServer: Session | null = null) {
  /*
    this is a store outside react — module-level, shared by the islands, and
    written by a fetch none of them own. `useSyncExternalStore` is what that
    is for: it reads through on every render rather than copying into state
    and pushing an update from an effect, which is a second render for a value
    that was already known
  */
  const value = useSyncExternalStore(
    subscribe,
    () => (session === undefined ? null : session),
    /* the server has no store to read, and renders signed-out either way */
    () => null,
  );

  useEffect(() => {
    /* a page the cdn does not cache already rendered the answer, so there is
       nothing to ask for */
    if (knownByServer) {
      publish(knownByServer, admin, profile);
      requested = true;
      return;
    }

    if (session === undefined) requestSession();
  }, [knownByServer]);

  return knownByServer ?? value;
}

/**
 * whether the signed-in member may see the admin tools.
 *
 * the nav only decides what to draw; every admin page checks the role itself,
 * so a stale answer here shows a link that answers 404 rather than letting
 * anybody in
 */
export function useAdmin() {
  const value = useSession();
  return value !== null && admin;
}

/**
 * what to call the signed-in member, once it has arrived.
 *
 * a page that already looked them up server-side passes it in and this returns
 * it unchanged; a cached page gets it from the same request that answers who is
 * signed in. null until then, which the ui draws as the plain discord mark
 */
export function useProfile(knownByServer: Profile | null = null) {
  const value = useSession();
  return knownByServer ?? (value ? profile : null);
}
