import { PlusIcon, XIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  MemberEditDialog,
  type Editing,
  type GuildOption,
} from "~/components/member-edit-dialog";
import { MemberEntry } from "~/components/member-entry";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { Faces } from "~/lib/faces";
import {
  indistinguishable,
  meetingLabel,
  searchCandidates,
  shownName,
  type Candidate,
} from "~/lib/members/kiosk";
import { defaultStatus } from "~/lib/members/config";
import {
  RosterQueries,
  rosterKeys,
  usePatch,
  useRefresh,
  useRosterQuery,
} from "~/lib/members/queries";
import type { KioskData } from "~/lib/members/views";
import type { MeetingRecord, Person } from "~/lib/members/records";
import { notify } from "~/lib/notify";
import { postJson } from "~/lib/post-json";
import { withParam } from "~/lib/search-params";

/*
  a laptop at the front of the room with a queue of people typing their own
  names — ADR 0010. three things follow from the queue:

  - the input takes focus back after every entry, or the second person types
    into nothing.
  - the last entry is confirmed by name, because somebody unsure whether their
    tap registered taps again, and a double entry is a duplicate.
  - two members sharing a name are shown side by side with what separates them
    and never collapsed into one offer.
*/

type Props = {
  /**
   * the page's own server-side read: the meetings on offer, the roster with
   * its contribution counts, the meeting to open on, and notion's statuses.
   *
   * `/api/members/kiosk` answers the same type from the same function, so this
   * seeds the query and every later read replaces it in place. Creating
   * somebody or correcting a row re-reads this rather than asking the room to
   * reload the laptop
   */
  initial: KioskData;
  /** `today` in eastern, fixed by the page so an evening does not roll over */
  today: string;
  /** discord pictures for the roster, from one request for the whole guild */
  faces: Faces;
  /** the same request's members, for the Discord chip's autocomplete */
  guild: GuildOption[];
};

/** the whole attendee list, written over the meeting's relation */
async function save(meetingId: string, memberIds: string[]): Promise<void> {
  await postJson("/api/members/attendance", { meetingId, memberIds });
}

async function createPerson(
  name: string,
  email: string,
  status: string | null,
): Promise<{ pageId: string; name: string; email: string }> {
  const { pageId } = await postJson<{ pageId?: string }>(
    "/api/members/create",
    { name, email, ...(status ? { status } : {}) },
  );

  /* a member with no id would be one the list could not remove again, so it is
     checked rather than asserted */
  if (!pageId) throw new Error("the member was created without an id");

  return { pageId, name, email };
}

const dayOf = (meeting: MeetingRecord) => meeting.date.slice(0, 10);

/** the date the calendar holds, then the name with its own date taken off */
const describe = (meeting: MeetingRecord) =>
  `${dayOf(meeting)} ${meetingLabel(meeting.name) || "Untitled"}`;

/* the route's own message where there is one — notion's refusals say useful
   things, and everybody at this laptop holds @Editorial Board */
const reason = (thrown: unknown) =>
  thrown instanceof Error ? thrown.message : String(thrown);

export function AttendanceKiosk(props: Props) {
  return (
    <RosterQueries>
      <Kiosk {...props} />
    </RosterQueries>
  );
}

function Kiosk({ initial, today, faces, guild }: Props) {
  /*
    the roster comes from the query and the attendee list does not.

    `present` is local and optimistic on purpose: the person who just tapped is
    standing at the laptop, and a refetch between their tap and the list moving
    is a wait the room watches. Everything a *write* changes about who is on
    the roster — a member created, an email or a status corrected — invalidates
    this query instead, so those stop needing a reload without putting a round
    trip in the queue's way
  */
  const { meetings, candidates, openingId, statuses } = useRosterQuery(
    rosterKeys.kiosk(),
    `/api/members/kiosk?today=${encodeURIComponent(today)}${
      initial.openingId
        ? `&meeting=${encodeURIComponent(initial.openingId)}`
        : ""
    }`,
    initial,
  );

  const refreshRoster = useRefresh(rosterKeys.kiosk());
  const patchRoster = usePatch<KioskData>(rosterKeys.kiosk());

  const [meetingId, setMeetingId] = useState(openingId ?? "");
  const [present, setPresent] = useState<string[]>(
    () =>
      meetings.find((meeting) => meeting.pageId === openingId)?.attendeeIds ??
      [],
  );
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [newEmail, setNewEmail] = useState("");
  /* Undergrad through `defaultStatus`, never the head of notion's options —
     those currently begin with Alum, and an alum does not vote */
  const [newStatus, setNewStatus] = useState(() => defaultStatus(statuses));
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);

  const search = useRef<HTMLInputElement>(null);

  const meeting = meetings.find((one) => one.pageId === meetingId) ?? null;

  const byId = useMemo(
    () =>
      new Map(
        candidates.map((candidate) => [candidate.person.pageId, candidate]),
      ),
    [candidates],
  );

  const matches = useMemo(
    () => searchCandidates(candidates, query),
    [candidates, query],
  );

  /* the query and the highlighted offer only ever move together: the list
     shortens under the fingers of somebody still typing, and an index left
     past its end selects nothing on Enter, silently */
  function changeQuery(value: string) {
    setQuery(value);
    setActive(0);
    setNewEmail("");
    setNewStatus(defaultStatus(statuses));
  }

  /* the next person is already reaching for the keyboard */
  function refocus() {
    search.current?.focus();
  }

  function switchMeeting(id: string) {
    setMeetingId(id);
    /* the new meeting's own attendees: carrying the current list across would
       file this room against a meeting it was not at */
    setPresent(meetings.find((one) => one.pageId === id)?.attendeeIds ?? []);
    /* so a reload during the meeting comes back to the same one */
    history.replaceState(null, "", withParam(location.href, "meeting", id));
    refocus();
  }

  /**
   * writes a whole attendee list, and puts it back if notion refused.
   *
   * optimistic because the person is standing there. the rollback is what
   * makes that honest: a kiosk showing somebody as present when the write
   * failed would cost them a vote they could not know they had lost
   */
  async function commit(next: string[], say: string) {
    if (!meetingId) return;

    const before = present;
    setPresent(next);
    setBusy(true);

    try {
      await save(meetingId, next);
      notify.ok(say);
    } catch (thrown) {
      setPresent(before);
      notify.failed(`Not saved: ${reason(thrown)}. Try again.`);
    } finally {
      setBusy(false);
      refocus();
    }
  }

  function markPresent(candidate: Candidate) {
    changeQuery("");

    if (present.includes(candidate.person.pageId)) {
      /* they tapped because they were not sure it had registered */
      notify.ok(`${shownName(candidate.person)} was already signed in`);
      refocus();
      return;
    }

    /* onto the front of the list. by the end of a general body meeting this is
       forty rows, and the person who just tapped has to be able to see that it
       worked without scrolling past everybody who arrived before them */
    void commit(
      [candidate.person.pageId, ...present],
      `${shownName(candidate.person)} is signed in`,
    );
  }

  function remove(pageId: string) {
    const person = byId.get(pageId)?.person;
    const name = person ? shownName(person) : "that row";
    void commit(
      present.filter((id) => id !== pageId),
      `Removed ${name}`,
    );
  }

  /**
   * the row as it now is, on screen before notion is asked again.
   *
   * the edit is written into the cache and then re-read: the person is looking
   * at their own chip and the change has to land immediately, but notion is
   * what the list actually means, so the optimistic shape does not survive
   */
  function replacePerson(person: Person) {
    patchRoster((current) => ({
      ...current,
      candidates: current.candidates.map((candidate) =>
        candidate.person.pageId === person.pageId
          ? { ...candidate, person }
          : candidate,
      ),
    }));
    void refreshRoster();
  }

  async function addNewPerson() {
    const name = query.trim();
    const email = newEmail.trim();
    if (!name || !email) return;

    setBusy(true);

    try {
      const created = await createPerson(name, email, newStatus);
      const candidate: Candidate = {
        person: {
          pageId: created.pageId,
          name: created.name,
          email: created.email,
          discordId: null,
          status: newStatus,
        },
        contributions: 0,
      };

      /* into the roster on screen too, so a second person with the same name
         later this evening is disambiguated against them rather than matched
         to them, and re-read so the row is notion's rather than ours */
      patchRoster((current) => ({
        ...current,
        candidates: [...current.candidates, candidate],
      }));
      void refreshRoster();
      changeQuery("");

      await commit(
        [created.pageId, ...present],
        `${created.name} was added and is signed in`,
      );
    } catch (thrown) {
      notify.failed(`Could not add them: ${reason(thrown)}`);
    } finally {
      setBusy(false);
    }
  }

  const listboxId = "kiosk-matches";

  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="kiosk-meeting" className="text-muted-foreground">
            Meeting
          </Label>
          <Select
            value={meetingId}
            onValueChange={(value) => switchMeeting(String(value))}
          >
            <SelectTrigger id="kiosk-meeting" size="sm">
              {/* base-ui renders the raw value unless it is told otherwise,
                  which put a notion page id in the trigger */}
              <SelectValue placeholder="Choose a meeting">
                {(value) => {
                  const one = meetings.find((m) => m.pageId === value);
                  return one ? describe(one) : "Choose a meeting";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {meetings.map((one) => (
                  <SelectItem key={one.pageId} value={one.pageId}>
                    {describe(one)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {meeting && !meeting.type && (
            <Badge variant="outline">No Type set, counts toward nothing</Badge>
          )}
        </div>

        {!meetingId ? (
          <p className="text-muted-foreground text-sm">
            Pick a meeting before the room arrives.
          </p>
        ) : (
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
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((at) => Math.min(at + 1, matches.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((at) => Math.max(at - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const chosen = matches[active];
                  /* Enter on an empty list deliberately does not fall through
                       to "create this person": a stranger's half-typed name
                       would become a Members row */
                  if (chosen) markPresent(chosen);
                } else if (event.key === "Escape") {
                  changeQuery("");
                }
              }}
            />

            {matches.length > 0 && (
              <ul
                id={listboxId}
                role="listbox"
                className="divide-y rounded-lg border"
              >
                {matches.map((candidate, index) => {
                  /* insisted on rather than merely shown when another offer
                       reads identically: that pair is not a choice anybody can
                       make correctly */
                  const clash = matches.some(
                    (other) =>
                      other !== candidate &&
                      indistinguishable(other, candidate),
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
                        className={`hover:bg-muted flex w-full cursor-pointer items-center gap-3 p-3 text-left first:rounded-t-lg last:rounded-b-lg ${
                          busy ? "opacity-50" : ""
                        } ${index === active ? "bg-muted" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          {/* a name and a count: every edit lives on the
                              signed-in side, where the person is looking at
                              their own row rather than scanning a list */}
                          <MemberEntry candidate={candidate} faces={faces} />
                        </div>

                        {present.includes(candidate.person.pageId) && (
                          <Badge variant="secondary">already in</Badge>
                        )}
                        {clash && (
                          <Badge variant="destructive">
                            two rows look alike, ask an officer
                          </Badge>
                        )}

                        <PlusIcon className="text-muted-foreground size-5 shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/*
                the offer to create somebody lives here rather than behind a
                button of its own: nobody presses "someone new" before typing
                their name, so the name is already in hand and the only thing
                left to ask for is the address the merge later depends on
              */}
            {query.trim() && matches.length === 0 && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm">
                  Nobody on the roster is called <strong>{query.trim()}</strong>{" "}
                  yet. Please use your full first and last name.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="kiosk-email">Email</Label>
                  <Input
                    id="kiosk-email"
                    type="email"
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                    className="h-12 text-base"
                    autoComplete="off"
                    placeholder="you@terpmail.umd.edu"
                    aria-describedby="kiosk-email-why"
                  />
                  <p
                    id="kiosk-email-why"
                    className="text-muted-foreground text-sm"
                  >
                    Use your @terpmail.umd.edu or @umd.edu address.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Status</Label>
                  {/* outline until it is the one chosen: this is a field
                      almost nobody has to touch, and the default is right */}
                  <div className="flex flex-wrap gap-2">
                    {statuses.map((status) => (
                      <Button
                        key={status}
                        type="button"
                        variant={newStatus === status ? "secondary" : "outline"}
                        aria-pressed={newStatus === status}
                        onClick={() => setNewStatus(status)}
                      >
                        {status}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button
                  className="h-12"
                  disabled={busy || !newEmail.trim()}
                  onClick={() => void addNewPerson()}
                >
                  <PlusIcon className="size-4" />
                  {busy ? "Adding…" : "Add and sign in"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 font-medium">
          Signed in
          <Badge variant={present.length > 0 ? "default" : "outline"}>
            {present.length}
          </Badge>
          {busy && (
            <span className="text-muted-foreground text-sm font-normal">
              saving…
            </span>
          )}
        </h2>

        {present.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nobody yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {present.map((pageId) => {
              const candidate = byId.get(pageId) ?? {
                person: {
                  pageId,
                  name: "Someone not on this list",
                  discordId: null,
                  email: null,
                  status: null,
                },
                contributions: 0,
              };
              const name = shownName(candidate.person);

              return (
                <li
                  key={pageId}
                  className="flex items-center gap-3 py-2 pr-2 pl-3"
                >
                  <div className="min-w-0 flex-1">
                    {/* every chip and every edit lives here: the person has
                        tapped, and this is the one row they are looking at */}
                    <MemberEntry
                      candidate={candidate}
                      faces={faces}
                      onEdit={(field) =>
                        setEditing({ field, person: candidate.person })
                      }
                    />
                  </div>
                  {/* removing is possible only because `setAttendees` replaces
                      the whole relation rather than appending to it */}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`Remove ${name}`}
                    onClick={() => remove(pageId)}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <MemberEditDialog
        editing={editing}
        onClose={() => {
          setEditing(null);
          refocus();
        }}
        onSaved={replacePerson}
        guild={guild}
        statuses={statuses}
      />
    </div>
  );
}
