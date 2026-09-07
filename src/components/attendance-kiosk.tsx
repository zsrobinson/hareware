import { CheckIcon, UserPlusIcon, XIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  distinguish,
  indistinguishable,
  searchCandidates,
  type Candidate,
} from "~/lib/members/kiosk";
import type { MeetingRecord } from "~/lib/members/standing";

/*
  the kiosk. a laptop at the front of the room, already signed in, with a queue
  of people in front of it typing their own names — see ADR 0010, which chose
  this over a public url with a per-meeting token because an officer's existing
  session is simpler and strictly safer.

  three things follow from "a queue of people", and they are the reason this is
  not just a form:

  - the input takes focus back after every entry, because the next person is
    already reaching for the keyboard. Anything that leaves focus on a button
    makes the second person in the queue type into nothing.
  - the last entry is confirmed loudly and by name. Somebody who cannot tell
    whether their tap registered taps again, and a double entry is a
    duplicate — which under this design denies eligibility rather than
    granting it.
  - tap targets are large, because this is used standing up, quickly, by
    people who are not looking closely.

  and one thing follows from "they type their own names": two members sharing a
  name are shown side by side with what separates them, and never collapsed
  into one offer. Autocomplete removes typos and introduces the worse error,
  which is tapping the wrong existing person.
*/

type Props = {
  /** every meeting, so an officer can file against one other than today's */
  meetings: MeetingRecord[];
  candidates: Candidate[];
  /** the meeting the page opened on, decided server-side by `defaultMeeting` */
  initialMeetingId: string | null;
};

/** the whole attendee list, written over the meeting's relation */
async function save(meetingId: string, memberIds: string[]): Promise<void> {
  const response = await fetch("/api/members/attendance", {
    method: "POST",
    // astro refuses a cross-site POST that looks like a form submission, and
    // one carrying no content type counts as one
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meetingId, memberIds }),
  });

  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(error ?? `${response.status}`);
  }
}

async function createPerson(
  name: string,
  email: string,
): Promise<{ pageId: string; name: string; email: string }> {
  const response = await fetch("/api/members/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, email }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    pageId?: string;
    error?: string;
  };

  if (!response.ok || !body.pageId) {
    throw new Error(body.error ?? `${response.status}`);
  }

  return { pageId: body.pageId, name, email };
}

const dayOf = (meeting: MeetingRecord) => meeting.date.slice(0, 10);

export function AttendanceKiosk({
  meetings,
  candidates,
  initialMeetingId,
}: Props) {
  const [meetingId, setMeetingId] = useState(initialMeetingId ?? "");
  const [roster, setRoster] = useState(candidates);
  const [present, setPresent] = useState<string[]>(
    () =>
      meetings.find((meeting) => meeting.pageId === initialMeetingId)
        ?.attendeeIds ?? [],
  );
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const search = useRef<HTMLInputElement>(null);

  const meeting = meetings.find((one) => one.pageId === meetingId) ?? null;

  const byId = useMemo(
    () =>
      new Map(roster.map((candidate) => [candidate.person.pageId, candidate])),
    [roster],
  );

  const matches = useMemo(
    () => searchCandidates(roster, query),
    [roster, query],
  );

  /**
   * the query and the highlighted offer, which only ever move together.
   *
   * the list shortens under the fingers of somebody still typing, and an index
   * left past its end selects nothing on Enter — silently, which on this
   * screen means somebody walks away believing they signed in
   */
  function changeQuery(value: string) {
    setQuery(value);
    setActive(0);
  }

  /* the next person is already reaching for the keyboard */
  function refocus() {
    search.current?.focus();
  }

  function switchMeeting(id: string) {
    setMeetingId(id);
    /*
      the new meeting's own attendees, read from what the page loaded with.
      the alternative — carrying the current list across — would file this
      room against a meeting it was not at, which is the mistake this picker
      exists to allow rather than to cause
    */
    setPresent(meetings.find((one) => one.pageId === id)?.attendeeIds ?? []);
    setConfirmed(null);
    setProblem(null);
    refocus();
  }

  /**
   * writes a whole attendee list, and puts it back if notion refused.
   *
   * optimistic because the person is standing there: the name appears the
   * instant they tap it. The rollback is what makes that honest — a kiosk that
   * showed somebody as present when the write failed would cost them a vote,
   * and they would have no way of knowing
   */
  async function commit(next: string[], say: string) {
    if (!meetingId) return;

    const before = present;
    setPresent(next);
    setBusy(true);
    setProblem(null);

    try {
      await save(meetingId, next);
      setConfirmed(say);
    } catch (thrown) {
      setPresent(before);
      setConfirmed(null);
      setProblem(
        `Not saved: ${thrown instanceof Error ? thrown.message : String(thrown)}. Try again.`,
      );
    } finally {
      setBusy(false);
      refocus();
    }
  }

  function markPresent(candidate: Candidate) {
    changeQuery("");

    if (present.includes(candidate.person.pageId)) {
      /* already here, and saying so is better than a silent no-op: they tapped
         because they were not sure it had registered */
      setConfirmed(`${candidate.person.name} was already signed in`);
      refocus();
      return;
    }

    void commit(
      [...present, candidate.person.pageId],
      `${candidate.person.name} is signed in`,
    );
  }

  function remove(pageId: string) {
    const name = byId.get(pageId)?.person.name ?? "that row";
    void commit(
      present.filter((id) => id !== pageId),
      `Removed ${name}`,
    );
  }

  async function addNewPerson() {
    const name = newName.trim();
    const email = newEmail.trim();
    if (!name || !email) return;

    setBusy(true);
    setProblem(null);

    try {
      const created = await createPerson(name, email);
      const candidate: Candidate = {
        person: {
          pageId: created.pageId,
          name: created.name,
          email: created.email,
          discordId: null,
          status: null,
        },
        contributions: 0,
      };

      /* into the local roster as well, so a second person with the same name
         later this evening is disambiguated against them rather than matched
         to them by accident */
      setRoster((current) => [...current, candidate]);
      setNewName("");
      setNewEmail("");
      setAdding(false);
      changeQuery("");

      await commit(
        [...present, created.pageId],
        `${created.name} was added and is signed in`,
      );
    } catch (thrown) {
      setProblem(
        `Could not add them: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  const listboxId = "kiosk-matches";

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="kiosk-meeting">Meeting</Label>
        {/*
          a plain select rather than the styled one: this is the control an
          officer touches once, before the room arrives, and a native picker is
          the one thing on this screen guaranteed to work with a trackpad, a
          keyboard and a touchscreen alike
        */}
        <select
          id="kiosk-meeting"
          value={meetingId}
          onChange={(event) => switchMeeting(event.target.value)}
          className="border-input bg-background h-12 w-full rounded-lg border px-3 text-base"
        >
          <option value="">Choose a meeting…</option>
          {meetings.map((one) => (
            <option key={one.pageId} value={one.pageId}>
              {dayOf(one)} — {one.name || "Untitled"}
              {one.type ? ` (${one.type})` : ""}
            </option>
          ))}
        </select>
        {meeting && !meeting.type && (
          <p className="text-muted-foreground text-sm">
            This meeting has no <strong>Type</strong> set in Notion, so
            attendance at it counts toward nothing on the standing page.
          </p>
        )}
      </div>

      {!meetingId ? (
        <p className="text-muted-foreground text-sm">
          Pick a meeting before the room arrives.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="kiosk-search" className="text-base">
              Type your name
            </Label>
            <Input
              id="kiosk-search"
              ref={search}
              autoFocus
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              placeholder="Start typing…"
              className="h-14 text-lg"
              autoComplete="off"
              role="combobox"
              aria-expanded={matches.length > 0}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                matches.length > 0 ? `kiosk-match-${active}` : undefined
              }
              onKeyDown={(event) => {
                /* the list is operable without a mouse, because the laptop is
                   on a table and a keyboard is the fastest thing on it */
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((at) => Math.min(at + 1, matches.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((at) => Math.max(at - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const chosen = matches[active];
                  /*
                    Enter on an empty list does nothing at all. It deliberately
                    does not fall through to "create this person": a stranger's
                    half-typed name would become a Members row, which is the
                    duplicate this design most wants to avoid
                  */
                  if (chosen) markPresent(chosen);
                } else if (event.key === "Escape") {
                  changeQuery("");
                }
              }}
            />

            <ul id={listboxId} role="listbox" className="space-y-2">
              {matches.map((candidate, index) => {
                /* insisted on rather than merely shown when another offer on
                   screen reads identically — that pair is not a choice anybody
                   can make correctly, and the kiosk says so */
                const clash = matches.some(
                  (other) =>
                    other !== candidate && indistinguishable(other, candidate),
                );

                return (
                  <li key={candidate.person.pageId}>
                    <button
                      type="button"
                      id={`kiosk-match-${index}`}
                      role="option"
                      aria-selected={index === active}
                      disabled={busy}
                      onClick={() => markPresent(candidate)}
                      onMouseEnter={() => setActive(index)}
                      className={`hover:bg-muted flex w-full flex-col items-start gap-0.5 rounded-lg border p-4 text-left disabled:opacity-50 ${
                        index === active ? "border-primary bg-muted" : ""
                      }`}
                    >
                      <span className="text-lg font-medium">
                        {candidate.person.name}
                        {present.includes(candidate.person.pageId) && (
                          <Badge variant="secondary" className="ml-2">
                            already in
                          </Badge>
                        )}
                      </span>
                      <span
                        className={
                          clash
                            ? "text-destructive text-sm"
                            : "text-muted-foreground text-sm"
                        }
                      >
                        {distinguish(candidate)}
                        {clash &&
                          " — two rows here look the same; ask an officer"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {query && matches.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Nobody by that name yet — use <strong>Someone new</strong>{" "}
                below.
              </p>
            )}
          </div>

          {/* the loudest thing on the page: somebody who cannot tell whether
              their tap registered taps again, and a double entry is a
              duplicate */}
          <div aria-live="polite" className="min-h-12">
            {confirmed && (
              <div className="flex items-center gap-2 rounded-lg border border-green-600/40 bg-green-600/10 p-4 text-lg font-medium">
                <CheckIcon className="size-5 shrink-0" />
                {confirmed}
              </div>
            )}
            {problem && (
              <div
                role="alert"
                className="border-destructive/50 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm"
              >
                {problem}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            {adding ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="kiosk-name">Full name</Label>
                  <Input
                    id="kiosk-name"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    className="h-12 text-base"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kiosk-email">Email</Label>
                  <Input
                    id="kiosk-email"
                    type="email"
                    required
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                    className="h-12 text-base"
                    autoComplete="off"
                    aria-describedby="kiosk-email-why"
                  />
                  <p
                    id="kiosk-email-why"
                    className="text-muted-foreground text-sm"
                  >
                    Required. It is how we recognise you when you apply on
                    Discord — without it somebody has to match you up by hand,
                    and two half-copies of you count separately toward voting.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="h-12"
                    disabled={busy || !newName.trim() || !newEmail.trim()}
                    onClick={() => void addNewPerson()}
                  >
                    {busy ? "Adding…" : "Add me and sign me in"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-12"
                    onClick={() => {
                      setAdding(false);
                      refocus();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="h-12 w-full"
                onClick={() => setAdding(true)}
              >
                <UserPlusIcon className="size-4" />
                Someone new — first time here
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="font-medium">
              Signed in ({present.length})
              {busy && (
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  saving…
                </span>
              )}
            </h2>
            {present.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nobody yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {present.map((pageId) => (
                  <li key={pageId}>
                    <span className="flex items-center gap-1 rounded-lg border py-1 pr-1 pl-3">
                      {byId.get(pageId)?.person.name ??
                        "Someone not on this list"}
                      {/* removing is the one edit a kiosk needs, and it is
                          possible only because `setAttendees` replaces the
                          whole relation rather than appending to it */}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        aria-label={`Remove ${byId.get(pageId)?.person.name ?? "this person"}`}
                        onClick={() => remove(pageId)}
                      >
                        <XIcon className="size-4" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
