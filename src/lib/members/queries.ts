/*
  the islands' side of the GET routes above.

  three things live here, and each is here because an island getting it wrong
  is invisible:

  - the provider and its cache live in `roster-queries.tsx`, and the keys in
    `query-keys.ts`. Both are next door rather than here for the same reason:
    react fast refresh gives up on a module that mixes a component with
    anything else, and a module it gives up on remounts the island on every
    edit — mid-meeting, in a dev session, that is the room's sign-ins gone.
  - the hooks the islands read and write through. The keys they use live in
    `query-keys.ts` rather than here, and that is a dev-server constraint
    rather than taste: react fast refresh only accepts a module whose exports
    are all components or hooks, and one plain object among them made every
    edit to this file invalidate its importers and remount the island.
  - `useRosterQuery`, which takes the page's server-rendered read as
    `initialData`. That is what keeps first paint the same: the island renders
    the data the page already had, rather than a spinner and a second request
    for what is on screen.
*/

import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useEffect } from "react";
import {
  applyIntent,
  applyIntents,
  stableOrder,
  type Intent,
} from "~/lib/members/attendance";
import type { KioskData } from "~/lib/members/views";
import { rosterKeys } from "~/lib/members/query-keys";
import { notify } from "~/lib/notify";
import { postJson } from "~/lib/post-json";

/**
 * the errors already toasted about.
 *
 * module scope for the same reason the client is: both outlive the mounted
 * tree, so a ref would forget on every navigation and say it again. Weak so a
 * collected error takes its entry with it
 */
const reported = new WeakSet<object>();

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
/**
 * one tap: what it changes, and what to say once notion has taken it.
 *
 * the words travel with the intent rather than in `mutate`'s own callbacks,
 * which look like the place for them and are not. React Query keeps those on
 * the observer, so a second tap before the first has answered overwrites them
 * and the first tap's confirmation is either the wrong name or never said at
 * all. A room signing five people in hits that every time
 */
export type Tap = { intent: Intent; say: string };

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
    mutationFn: async ({ intent }: Tap): Promise<string[]> => {
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
    onSuccess: (attendeeIds, { say }) => {
      /*
        the answer decides who is in the room; the order stays the screen's.

        notion gives a relation no ordering guarantee, and a write answers with
        the whole thing, so taking the sequence from the answer let a list
        reshuffle itself under a room that was still queueing. Normalising here
        rather than at the point it is drawn means nothing downstream has to
        know, and re-drawing never moves anything
      */
      queries.setQueryData<string[]>(key, (current) =>
        stableOrder(current ?? [], attendeeIds),
      );
      notify.ok(say);
    },
    onError: (thrown) =>
      notify.failed(
        `Not saved: ${thrown instanceof Error ? thrown.message : String(thrown)}. Try again.`,
      ),
  });

  const queued = useMutationState({
    filters: { mutationKey, status: "pending" },
    select: (mutation) => (mutation.state.variables as Tap).intent,
  });

  return {
    /** who is in the room: notion's answer, then everything still queued */
    present: applyIntents(recorded, queued),
    /** whether any write is still in flight, for the one word that says so */
    saving: queued.length > 0,
    /** enqueue one tap. it draws at once and writes in its turn */
    tap: (tap: Tap) => mutate(tap),
  };
}
