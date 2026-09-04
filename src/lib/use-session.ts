import { useEffect, useSyncExternalStore } from "react";
import type { ViewerState } from "./admin";

/*
  who is looking, shared by the islands that care: the editorial nav, the mobile
  drawer, and the account panel. they would otherwise each ask
  /api/session.json and could disagree.

  one snapshot with three states, not three module variables with a shared
  boolean. the old shape published `session` from a page that had one while
  leaving `admin` and `profile` at their defaults, and set the "already asked"
  flag on the way past — so a member on a page that passed only a session saw
  their own id where their name belongs, and kept seeing it after navigating
  away, because the flag outlives the page under client-side routing.

  "not asked yet" has to be a state of its own. it is what tells the fetch to
  run, and conflating it with "asked, and the answer was nobody" is what made
  seeding silently cancel the request that would have filled in the rest.
*/

const SIGNED_OUT: ViewerState = { session: null, profile: null, admin: false };

type Snapshot =
  { status: "unknown" } | { status: "resolved"; viewer: ViewerState };

let snapshot: Snapshot = { status: "unknown" };
let inFlight = false;

const listeners = new Set<() => void>();

function publish(viewer: ViewerState) {
  snapshot = { status: "resolved", viewer };
  for (const listener of listeners) listener();
}

/** a nullable string off the wire, kept only when it is a non-empty one */
const str = (value: unknown) =>
  typeof value === "string" && value ? value : undefined;

/** discord's answer, kept only if it is the shape we asked for */
function readProfile(value: unknown): ViewerState["profile"] {
  if (!value || typeof value !== "object") return null;

  const who = value as Record<string, unknown>;
  const strings = ["displayName", "username", "avatarUrl"] as const;

  return strings.every((key) => typeof who[key] === "string")
    ? (who as ViewerState["profile"])
    : null;
}

function requestViewer() {
  if (inFlight || snapshot.status === "resolved") return;
  inFlight = true;

  fetch("/api/session.json")
    // json() is typed unknown under the workers types, so narrow it here
    .then((r) => (r.ok ? r.json() : {}))
    .then((body) => body as Record<string, unknown>)
    .then((data) =>
      publish(
        data.signedIn === true && str(data.discordUserId)
          ? {
              session: { discordUserId: data.discordUserId as string },
              profile: readProfile(data.profile),
              admin: data.admin === true,
            }
          : SIGNED_OUT,
      ),
    )
    .catch(() => publish(SIGNED_OUT));
}

/** react's contract for the store above: subscribe, and read */
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/**
 * everything the nav knows about whoever is looking.
 *
 * a page the cdn does not cache resolves this server-side and passes it in —
 * that answer is used directly and nothing is fetched. a cached page passes
 * nothing and gets it from /api/session.json, which makes the same lookup
 * `viewer()` makes. either way there is one answer, so the sidebar and the
 * drawer cannot disagree
 */
export function useViewer(knownByServer?: ViewerState | null): ViewerState {
  const value = useSyncExternalStore(
    subscribe,
    () => (snapshot.status === "resolved" ? snapshot.viewer : SIGNED_OUT),
    /* the server has no store to read, and renders signed-out either way */
    () => SIGNED_OUT,
  );

  useEffect(() => {
    /*
      only a page that passed nothing asks. a seeded page does NOT mark the
      store resolved — its answer belongs to that page, and writing it into a
      module that survives navigation is how a stale one followed the member
      around
    */
    if (knownByServer === undefined) requestViewer();
  }, [knownByServer]);

  return knownByServer ?? value;
}

export function useSession(knownByServer?: ViewerState | null) {
  return useViewer(knownByServer).session;
}

/**
 * whether the signed-in member may see the admin tools.
 *
 * the nav only decides what to draw; every admin page checks the role itself,
 * so a stale answer here shows a link that answers 404 rather than letting
 * anybody in
 */
export function useAdmin(knownByServer?: ViewerState | null) {
  return useViewer(knownByServer).admin;
}

/** what to call the signed-in member, once it has arrived */
export function useProfile(knownByServer?: ViewerState | null) {
  return useViewer(knownByServer).profile;
}
