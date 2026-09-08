/*
  the islands' side of the GET routes above.

  three things live here, and each is here because an island getting it wrong
  is invisible:

  - `RosterQueries`, the provider. These are separate astro islands hydrated
    independently, so there is no single React root to put one at the top of
    and no shared cache between them. Each island wraps itself.
  - the query keys, spelled once. A mutation that invalidates a key nobody
    reads is a mutation that silently still needs a reload, and two string
    literals in two files is exactly how that happens.
  - `useRosterQuery`, which takes the page's server-rendered read as
    `initialData`. That is what keeps first paint the same: the island renders
    the data the page already had, rather than a spinner and a second request
    for what is on screen.
*/

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import {
  applyIntent,
  applyIntents,
  type Intent,
} from "~/lib/members/attendance";
import type { KioskData } from "~/lib/members/views";
import { notify } from "~/lib/notify";
import { postJson } from "~/lib/post-json";

/** every roster query's key, so a mutation cannot invalidate a name nobody uses */
export const rosterKeys = {
  /* the pinned meeting is part of the key, because it is part of the answer:
     the route decides which meetings are offerable around it. A constant key
     with the meeting in the path only meant a refetch after a switch re-read
     the meeting the page opened on */
  kiosk: (meetingId = "") =>
    ["members", "kiosk", meetingId] as const satisfies QueryKey,
  reconciler: () => ["members", "reconciler"] as const satisfies QueryKey,
  /*
    who is in the room, kept apart from the roster read on purpose.

    it used to live inside the kiosk answer, and a revalidation of that answer
    then landed on top of writes that were still in flight: the refetch had
    left before the write and arrived after it, so somebody who had just
    tapped disappeared. Nothing about that looks like a failure on screen.

    its own key, never refetched, only written. Revalidating the roster — the
    names, the calendar, notion's statuses — can no longer touch it
  */
  attendees: (meetingId = "") =>
    ["members", "attendees", meetingId] as const satisfies QueryKey,
  /* the writes, keyed the same way, so the queue for one meeting can be read
     back without the queue for another */
  attendance: (meetingId = "") =>
    ["members", "attendance", meetingId] as const satisfies QueryKey,
};

/**
 * how long a read stays fresh before a refocus would re-ask for it.
 *
 * notion allows about three requests a second and each of these reads is
 * several, so a window regaining focus may not cost a page load's worth of
 * them. The invalidations after a mutation are exact and ignore this
 */
const FRESH_MS = 60_000;

function client() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: FRESH_MS,
        /* the kiosk is a laptop somebody walks past all evening, and the
           reconciler is worked through top to bottom. A list reordering itself
           because a window was clicked loses the reader's place */
        refetchOnWindowFocus: false,
        /* and not because the wifi blinked. this defaults to true, and on a
           meeting room's network every `online` event would spend a read worth
           several notion requests, which `retry: false` then turns into a
           visible error rather than a retry */
        refetchOnReconnect: false,
        /* a read here is several notion requests; retrying a failed one three
           times is how a rate limit becomes a worse rate limit. The client
           already waits out a 429 on each request */
        retry: false,
      },
    },
  });
}

/**
 * the cache, at module scope so it outlives a remount.
 *
 * it was per-mount, which reads as the tidier choice and was wrong here:
 * `dashboard.astro` renders `<ClientRouter />`, so every navigation swaps the
 * body and remounts the islands, and a client in `useState` was thrown away
 * with them. Every visit then paid for a full read again, which is the
 * "constantly reloading" this layer was added to stop.
 *
 * outliving the tree is the point, not a leak: the entries are the roster, the
 * keys are stable, and `staleTime` decides when they are asked for again
 */
let cache: QueryClient | undefined;

/**
 * the errors already toasted about.
 *
 * module scope for the same reason the client is: both outlive the mounted
 * tree, so a ref would forget on every navigation and say it again. Weak so a
 * collected error takes its entry with it
 */
const reported = new WeakSet<object>();

function sharedClient() {
  return (cache ??= client());
}

export function RosterQueries({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={sharedClient()}>
      {children}
    </QueryClientProvider>
  );
}

/**
 * a roster read, seeded with what the page already rendered.
 *
 * `initialData` is the whole point of the shape: the astro page reads
 * server-side and hands the answer down, so this resolves on the first render
 * with no loading state and no second fetch on arrival. `path` answers the
 * same type from the same function in `~/lib/members/views`
 */
export function useRosterQuery<T extends object>(
  key: QueryKey,
  path: string,
  initialData: T,
  /**
   * whether `initialData` actually describes *this* key.
   *
   * react query installs `initialData` under whatever key has no entry yet, so
   * a key that varies — the kiosk's, which carries the pinned meeting — would
   * otherwise be seeded with the page's opening snapshot and, with no
   * `initialDataUpdatedAt`, treated as fresh for a whole `staleTime`. Switching
   * meetings then showed the previous meeting's answer for a minute, which is
   * the bug varying the key was meant to fix.
   *
   * false stamps the seed as already stale, so it still paints without a
   * loading flash and re-reads immediately
   */
  seeded = true,
): T {
  const { data, isError, error } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<T> => {
      const response = await fetch(path, {
        headers: { accept: "application/json" },
      });

      const said = (await response.json().catch(() => ({}))) as T & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          said.error ?? `${response.status} ${response.statusText}`,
        );
      }

      return said;
    },
    initialData,
    ...(seeded ? {} : { initialDataUpdatedAt: 0 }),
  });

  /*
    a failed refetch leaves the last good answer on screen, which is the right
    thing to show and the wrong thing to show *silently*: on the reconciler,
    the page somebody opens the morning of an election, a stale screen and a
    fresh one look identical. so it says so once per failure.

    once per *failure*, not once per mount. the client outlives the tree now,
    so a failed query keeps its error in the cache and every navigation back to
    the page would otherwise toast again about a failure from minutes ago
  */
  useEffect(() => {
    if (!isError || !error || reported.has(error)) return;

    reported.add(error);
    notify.failed(
      `Could not refresh: ${error instanceof Error ? error.message : String(error)}`,
    );
  }, [isError, error]);

  return data;
}

/**
 * edits the cached answer in place, without a read.
 *
 * for the one case a read cannot cover in time: a row the person at the laptop
 * just created or corrected has to be on screen before notion is asked again.
 * The kiosk uses this alone, deliberately. Pairing it with `useRefresh` there
 * spent three notion requests to be told what the page had just written, and
 * redrew a screen somebody is queueing at while it did
 */
export function usePatch<T>(key: QueryKey) {
  const queries = useQueryClient();

  return (change: (current: T) => T) =>
    queries.setQueryData<T>(key, (current) =>
      current === undefined ? current : change(current),
    );
}

/**
 * re-reads one roster query after a write.
 *
 * returned as a function rather than called for you, because the kiosk never
 * uses it: a tap draws from its own queue, and a refetch would put a round
 * trip between somebody tapping their name and the room seeing it
 */
export function useRefresh(key: QueryKey) {
  const queries = useQueryClient();

  return () => queries.invalidateQueries({ queryKey: key });
}

/** the meeting's attendees as the last read left them, in insertion order */
function attendeesOf(data: KioskData | undefined, meetingId: string): string[] {
  return (
    data?.meetings.find((meeting) => meeting.pageId === meetingId)
      ?.attendeeIds ?? []
  );
}

/**
 * the queue a room's taps go through.
 *
 * every problem this replaced came from the attendee list being held twice —
 * once in the cache and once in the island's own state — and from each tap
 * sending a whole list it had computed before the last one answered. Two
 * people tapping a second apart both wrote three names derived from the same
 * two, and the second write erased the first. Nothing errored.
 *
 * so a tap is an `Intent`, and three rules follow:
 *
 * - `scope` makes the writes serial. React Query runs one mutation per scope
 *   at a time and queues the rest, so the second tap's list is computed from
 *   the answer the first one got back rather than from what was on screen when
 *   it was tapped.
 * - the list lives only in the cache. There is no second copy to reconcile,
 *   which is what an effect syncing state to props was papering over.
 * - the screen draws the cache plus everything still queued, so a tap shows up
 *   the instant it is made even though its write has not started. Applying an
 *   intent is idempotent, so the write that is halfway through — already in
 *   the answer and still in the queue — draws the same either way.
 *
 * a failed write simply leaves the queue, and the row returns to whatever
 * notion last said. No rollback, because nothing was overwritten.
 *
 * `data` seeds the list and is then out of the way: the attendees have a cache
 * entry of their own that nothing revalidates, so a roster refetch landing
 * mid-write cannot take a tap back off the screen
 */
export function useAttendance(meetingId: string, data: KioskData) {
  const queries = useQueryClient();
  const key = rosterKeys.attendees(meetingId);
  const mutationKey = rosterKeys.attendance(meetingId);

  /*
    a query rather than state, for the cache and nothing else: it is where the
    writes put their answer, and it survives the island being remounted by a
    navigation. `staleTime: Infinity` is what makes it a record rather than a
    read — notion is asked once, by the page, and after that this list only
    moves when somebody at the laptop moves it
  */
  const { data: recorded } = useQuery({
    queryKey: key,
    queryFn: () =>
      attendeesOf(
        queries.getQueryData<KioskData>(rosterKeys.kiosk(meetingId)),
        meetingId,
      ),
    initialData: () => attendeesOf(data, meetingId),
    staleTime: Infinity,
  });

  const { mutate } = useMutation({
    mutationKey,
    /* one write at a time, per meeting */
    scope: { id: `members-attendance-${meetingId}` },
    mutationFn: async (intent: Intent): Promise<string[]> => {
      /* the cache, not the render's copy: several taps may have been queued
         since this one was made, and each has to be applied to what the last
         write actually got back */
      const known = queries.getQueryData<string[]>(key) ?? [];
      const wanted = applyIntent(known, intent);

      /* `known` as well as `wanted`: the route merges against notion rather
         than replacing, so a second device's sign-ins survive this write */
      const { memberIds } = await postJson<{ memberIds?: string[] }>(
        "/api/members/attendance",
        { meetingId, memberIds: wanted, known },
      );

      return memberIds ?? wanted;
    },
    onSuccess: (attendeeIds) => queries.setQueryData(key, attendeeIds),
  });

  const queued = useMutationState({
    filters: { mutationKey, status: "pending" },
    select: (mutation) => mutation.state.variables as Intent,
  });

  return {
    /** what notion last took, with everything still queued applied on top */
    present: applyIntents(recorded, queued),
    /** whether any write is still in flight, for the one word that says so */
    saving: queued.length > 0,
    /** enqueue one tap. `say` names it once notion has taken it */
    tap: (
      intent: Intent,
      handlers: { onSuccess?: () => void; onError?: (thrown: unknown) => void },
    ) =>
      mutate(intent, {
        onSuccess: handlers.onSuccess,
        onError: handlers.onError,
      }),
  };
}
