/*
  the hooks the islands read and write roster data through. The provider lives
  in `roster-queries.tsx` and the keys in `query-keys.ts`, because react fast
  refresh remounts an island whose module exports anything but hooks or
  components.
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
import { toast } from "sonner";
import { postJson } from "~/lib/post-json";
import { errorMessage } from "~/lib/utils";

/* the errors already toasted about. module scope because the query client
   outlives the island, so a failure would otherwise be toasted again on every
   navigation back */
const reported = new WeakSet<object>();

/**
 * a roster read, seeded with what the page already rendered so first paint
 * needs no second fetch. `path` answers the same type from `~/lib/members/views`
 */
/** a roster read, and whether the last attempt at it failed */
export type RosterRead<T> = {
  data: T;
  failed: boolean;
  retry: () => void;
};

export function useRosterQuery<T extends object>(
  key: QueryKey,
  path: string,
  initialData: T,
  /**
   * whether `initialData` describes this key. React Query seeds whichever key
   * has no entry yet, so a varying key would otherwise treat the page's
   * snapshot as fresh; false marks the seed stale so it re-reads at once
   */
  seeded = true,
): RosterRead<T> {
  const { data, isError, error, refetch } = useQuery({
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

  /* a failed refetch keeps the last good answer on screen, which looks
     identical to a fresh one, so it is said once per failure */
  useEffect(() => {
    if (!isError || !error || reported.has(error)) return;

    reported.add(error);
    toast.error(`Could not refresh: ${errorMessage(error)}`);
  }, [isError, error]);

  return {
    data,
    failed: isError,
    retry: () => void refetch(),
  };
}

/**
 * edits the cached answer in place, without a read. The kiosk uses this alone:
 * a re-read costs several notion requests and redraws a screen a queue is using
 */
export function usePatch<T>(key: QueryKey) {
  const queries = useQueryClient();

  return (change: (current: T) => T) =>
    queries.setQueryData<T>(key, (current) =>
      current === undefined ? current : change(current),
    );
}

/** re-reads one roster query after a write */
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
 * one tap, and what to say once notion has taken it.
 *
 * the words travel with the intent because `mutate`'s own callbacks live on
 * the observer, and a second tap overwrites the first one's before it answers
 */
export type Tap = { intent: Intent; say: string };

/**
 * the queue a room's taps go through.
 *
 * - `scope` makes the writes serial, so each list is computed from what the
 *   previous write got back rather than from what was on screen.
 * - the list lives only in the cache, in an entry nothing revalidates, so a
 *   roster refetch landing mid-write cannot take a tap off the screen.
 * - the screen draws the cache plus everything still queued. Applying an
 *   intent is idempotent, so a write that has answered but not left the queue
 *   draws the same.
 *
 * a failed write leaves the queue and the row returns to notion's answer
 */
export function useAttendance(meetingId: string, data: KioskData) {
  const queries = useQueryClient();
  const key = rosterKeys.attendees(meetingId);
  const mutationKey = rosterKeys.attendance(meetingId);

  /* the route answers with the meeting it was asked about as `openingId`,
     which tells a read of this meeting from the opening snapshot shown while
     it loads. Nothing re-reads this list, so a stale seed would stay */
  const read = (data.openingId ?? "") === meetingId ? data : undefined;

  /* a query so the list survives a remount; `staleTime: Infinity` because
     after the seed only this laptop's writes move it */
  const { data: recorded } = useQuery({
    queryKey: key,
    queryFn: () => attendeesOf(read, meetingId),
    enabled: read !== undefined,
    initialData: read && (() => attendeesOf(read, meetingId)),
    staleTime: Infinity,
  });

  const { mutate } = useMutation({
    mutationKey,
    scope: { id: `members-attendance-${meetingId}` },
    mutationFn: async ({ intent }: Tap): Promise<string[]> => {
      /* the cache, not the render's copy: taps queued since this one must
         apply to what the last write got back */
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
      /* the answer decides who is in the room and the screen keeps its
         order: notion's relation comes back in no particular order */
      queries.setQueryData<string[]>(key, (current) =>
        stableOrder(current ?? [], attendeeIds),
      );
      toast.success(say);
    },
    onError: (thrown) =>
      toast.error(`Not saved: ${errorMessage(thrown)}. Try again.`),
  });

  const queued = useMutationState({
    filters: { mutationKey, status: "pending" },
    select: (mutation) => (mutation.state.variables as Tap).intent,
  });

  return {
    /** who is in the room: notion's answer, then everything still queued */
    present: applyIntents(recorded ?? [], queued),
    /** whether notion has said who is in the room yet */
    known: recorded !== undefined,
    /** whether any write is still in flight */
    saving: queued.length > 0,
    /** enqueue one tap; it draws at once and writes in its turn */
    tap: (tap: Tap) => mutate(tap),
  };
}
