import { useMutation } from "@tanstack/react-query";
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
} from "~/lib/members/kiosk";
import { defaultStatus } from "~/lib/members/config";
import {
  RosterQueries,
  rosterKeys,
  useAttendance,
  usePatch,
  useRosterQuery,
} from "~/lib/members/queries";
import type { KioskData } from "~/lib/members/views";
import type { Intent } from "~/lib/members/attendance";
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
   * the page's own server-side read: the meetings on offer, the roster, the
   * meeting to open on, and notion's statuses.
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
    the attendee list is held in exactly one place: the query cache.

    it used to be held twice, in the cache and in the island's own state, and
    every reported problem came from that — a switch that reseeded from a stale
    read, a write whose answer overwrote what had been tapped since, an
    optimistic list computed before the last write had landed. `useAttendance`
    keeps the list in the cache and the taps in a serial queue, and this
    component only says what was tapped.

    `meetingId` is the one piece of state, and it is the query key too, so the
    read and the meeting on screen cannot disagree
  */
  const [meetingId, setMeetingId] = useState(initial.openingId ?? "");

  const data = useRosterQuery(
    rosterKeys.kiosk(meetingId),
    `/api/members/kiosk?today=${encodeURIComponent(today)}${
      meetingId ? `&meeting=${encodeURIComponent(meetingId)}` : ""
    }`,
    initial,
    /* the seed describes the meeting the page opened on and no other, so a
       switch re-reads rather than showing the last one for a staleTime */
    meetingId === (initial.openingId ?? ""),
  );

  const { meetings, candidates, statuses } = data;
  const { present, saving, tap } = useAttendance(meetingId, data);

  const patchRoster = usePatch<KioskData>(rosterKeys.kiosk(meetingId));

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [newEmail, setNewEmail] = useState("");
  /* Undergrad through `defaultStatus`, never the head of notion's options —
     those currently begin with Alum, and an alum does not vote */
  const [newStatus, setNewStatus] = useState(() => defaultStatus(statuses));
  const [editing, setEditing] = useState<Editing | null>(null);

  const search = useRef<HTMLInputElement>(null);

  const meeting = meetings.find((one) => one.pageId === meetingId) ?? null;

  const byId = useMemo(
    () => new Map(candidates.map((person) => [person.pageId, person])),
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

  /* the next person is already reaching for the keyboard. `preventScroll`
     because focusing scrolls the input into view, and on a laptop showing a
     room's worth of names that yanked the page back to the top after every
     single tap */
  function refocus() {
    search.current?.focus({ preventScroll: true });
  }

  function switchMeeting(id: string) {
    /* the attendees follow from the key, so there is nothing else to reseed */
    setMeetingId(id);
    /*
      so a reload during the meeting comes back to the same one.

      `history.state` is passed back rather than replaced with null, which is
      not a detail: astro's `<ClientRouter />` keeps its own scroll and index
      record in there, and a popstate arriving to find it missing calls
      `location.reload()`. Wiping it here is what reloaded the page under
      somebody halfway through signing a room in
    */
    history.replaceState(
      history.state,
      "",
      withParam(location.href, "meeting", id),
    );
    refocus();
  }

  /**
   * one tap, onto the queue.
   *
   * it draws immediately and writes in turn. A refusal takes it back off the
   * list and says so, which is what keeps the screen honest: a kiosk showing
   * somebody as present when the write failed would cost them a vote they
   * could not know they had lost
   */
  function record(intent: Intent, say: string) {
    if (!meetingId) return;

    tap({ intent, say });
    refocus();
  }

  function markPresent(person: Person) {
    changeQuery("");

    if (present.includes(person.pageId)) {
      /* they tapped because they were not sure it had registered */
      notify.ok(`${shownName(person)} was already signed in`);
      refocus();
      return;
    }

    record(
      { kind: "add", pageId: person.pageId },
      `${shownName(person)} is signed in`,
    );
  }

  function remove(pageId: string) {
    const person = byId.get(pageId);
    const name = person ? shownName(person) : "that row";

    record({ kind: "remove", pageId }, `Removed ${name}`);
  }

  /**
   * the row as it now is, on screen before notion is asked again.
   *
   * written into the cache and not re-read. The route already validated what
   * it wrote and answered with it, so a refetch would spend three notion
   * requests to be told the same thing, and redraw a page somebody is
   * queueing at while it did. The next mount reads notion again
   */
  function replacePerson(person: Person) {
    patchRoster((current) => ({
      ...current,
      candidates: current.candidates.map((one) =>
        one.pageId === person.pageId ? person : one,
      ),
    }));
  }

  /*
    creating somebody is its own write, and deliberately not in the attendance
    queue: it has to finish before there is an id to sign in
  */
  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: (fields: {
      name: string;
      email: string;
      status: string | null;
    }) => createPerson(fields.name, fields.email, fields.status),
    onSuccess: (created, fields) => {
      const added: Person = {
        pageId: created.pageId,
        name: created.name,
        email: created.email,
        discordId: null,
        status: fields.status,
        /* nobody has written anything under a row created a second ago */
        contributions: 0,
      };

      /* into the roster on screen too, so a second person with the same name
         later this evening is disambiguated against them rather than matched
         to them. Patched rather than refetched: re-reading costs three notion
         requests to be told what this page just wrote, and redraws a screen
         somebody is queueing at while it does */
      patchRoster((current) => ({
        ...current,
        candidates: [...current.candidates, added],
      }));
      changeQuery("");

      record(
        { kind: "add", pageId: created.pageId },
        `${created.name} was added and is signed in`,
      );
    },
    onError: (thrown) => notify.failed(`Could not add them: ${reason(thrown)}`),
  });

  function addNewPerson() {
    const name = query.trim();
    const email = newEmail.trim();
    if (!name || !email) return;

    create({ name, email, status: newStatus });
  }

  /*
    newest first on screen, oldest first everywhere else.

    `present` is insertion order, which is what notion's relation holds and
    what `mergeAttendance` preserves when it appends another device's people.
    Keeping one order and reversing it here means a reload shows the same list
    as the tap did; prepending locally instead put the newest at the top until
    the write answered, and then the server's order flipped it back
  */
  const signedIn = useMemo(() => [...present].reverse(), [present]);

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
                {matches.map((person, index) => {
                  /* insisted on rather than merely shown when another offer
                       reads identically: that pair is not a choice anybody can
                       make correctly */
                  const clash = matches.some(
                    (other) =>
                      other !== person && indistinguishable(other, person),
                  );

                  return (
                    <li key={person.pageId}>
                      <button
                        type="button"
                        id={`kiosk-match-${index}`}
                        role="option"
                        aria-selected={index === active}
                        onClick={() => markPresent(person)}
                        onMouseEnter={() => setActive(index)}
                        className={`hover:bg-muted flex w-full cursor-pointer items-center gap-3 p-3 text-left first:rounded-t-lg last:rounded-b-lg ${
                          index === active ? "bg-muted" : ""
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          {/* a name and a count: every edit lives on the
                              signed-in side, where the person is looking at
                              their own row rather than scanning a list */}
                          <MemberEntry person={person} faces={faces} />
                        </div>

                        {present.includes(person.pageId) && (
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
                  disabled={creating || !newEmail.trim()}
                  onClick={() => addNewPerson()}
                >
                  <PlusIcon className="size-4" />
                  {creating ? "Adding…" : "Add and sign in"}
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
          {saving && (
            <span className="text-muted-foreground text-sm font-normal">
              saving…
            </span>
          )}
        </h2>

        {present.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nobody yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {signedIn.map((pageId) => {
              const person = byId.get(pageId) ?? {
                pageId,
                name: "Someone not on this list",
                discordId: null,
                email: null,
                status: null,
                contributions: 0,
              };
              const name = shownName(person);

              return (
                <li
                  key={pageId}
                  className="flex items-center gap-3 py-2 pr-2 pl-3"
                >
                  <div className="min-w-0 flex-1">
                    {/* every chip and every edit lives here: the person has
                        tapped, and this is the one row they are looking at */}
                    <MemberEntry
                      person={person}
                      faces={faces}
                      onEdit={(field) => setEditing({ field, person })}
                    />
                  </div>
                  {/* removing is possible only because `setAttendees` replaces
                      the whole relation rather than appending to it */}
                  <Button
                    variant="ghost"
                    size="sm"
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
