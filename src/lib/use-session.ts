import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ViewerState } from "./admin";
import { queryClient } from "./query-client";
import { useHydrated } from "./use-hydrated";

/*
  Who is looking, from /api/session.json, which makes the same lookup
  `viewer()` makes. Every page is static (ADR 0012), so there is one answer per
  window, kept in the shared query client: the account panel, the drawer that
  holds one, and the sign-in page all read it and cannot disagree. Signing out
  reloads the page, which empties it.

  The nav does not depend on it: every tool is shown to everybody, and the
  APIs say why when they refuse.
*/

const SIGNED_OUT: ViewerState = { session: null, profile: null };

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

/** a lookup that cannot be made reads as signed out, as the APIs treat it */
async function readViewer(): Promise<ViewerState> {
  try {
    const response = await fetch("/api/session.json");
    const data = (response.ok ? await response.json() : {}) as Record<
      string,
      unknown
    >;
    return data.signedIn === true && str(data.discordUserId)
      ? {
          session: { discordUserId: data.discordUserId as string },
          profile: readProfile(data.profile),
        }
      : SIGNED_OUT;
  } catch {
    return SIGNED_OUT;
  }
}

export const viewerQuery = queryOptions({
  queryKey: ["viewer"],
  queryFn: readViewer,
  staleTime: Infinity,
  retry: false,
});

/** whoever is looking; signed out until the lookup answers, and in the build */
export function useViewer(): ViewerState {
  const hydrated = useHydrated();
  const { data } = useQuery(viewerQuery, queryClient);
  return hydrated ? (data ?? SIGNED_OUT) : SIGNED_OUT;
}

/** whether the lookup has answered, so "signed out" can be told apart from
    "not asked yet" (the sidebar's lock must not flash) */
export function useViewerKnown(): boolean {
  const hydrated = useHydrated();
  const { isSuccess } = useQuery(viewerQuery, queryClient);
  return hydrated && isSuccess;
}
