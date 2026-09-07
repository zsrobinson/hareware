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
  type Candidate,
} from "~/lib/members/kiosk";
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
  /** already narrowed to the window, newest first */
  meetings: MeetingRecord[];
  candidates: Candidate[];
  /** the meeting the page opened on: the `meeting` search param, else today's */
  initialMeetingId: string | null;
  /** discord pictures for the roster, from one request for the whole guild */
  faces: Faces;
  /** the same request's members, for the Discord chip's autocomplete */
  guild: GuildOption[];
  /** notion's Status options, read from the schema rather than spelled here */
  statuses: string[];
};

/** the whole attendee list, written over the meeting's relation */
async function save(meetingId: string, memberIds: string[]): Promise<void> {
  await postJson("/api/members/attendance", { meetingId, memberIds });
}

async function createPerson(
  name: string,
  email: string,
): Promise<{ pageId: string; name: string; email: string }> {
  const { pageId } = await postJson<{ pageId?: string }>(
    "/api/members/create",
    { name, email },
  );

  /* a member with no id would be one the list could not remove again, so it is
     checked rather than asserted */
  if (!pageId) throw new Error("the member was created without an id");

  return { pageId, name, email };
}

const dayOf = (meeting: MeetingRecord) => meeting.date.slice(0, 10);

/** the date the calendar holds, then the name with its own date taken off */
const describe = (meeting: MeetingRecord) =>
  `${dayOf(meeting)} ${meetingLabel(meeting.name) || "Untitled"}${
    meeting.type ? ` (${meeting.type})` : ""
  }`;

/* the route's own message where there is one — notion's refusals say useful
   things, and everybody at this laptop holds @Editorial Board */
const reason = (thrown: unknown) =>
  thrown instanceof Error ? thrown.message : String(thrown);

export function AttendanceKiosk({
  meetings,
  candidates,
  initialMeetingId,
  faces,
  guild,
  statuses,
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
  const [newEmail, setNewEmail] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
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

  /* the query and the highlighted offer only ever move together: the list
     shortens under the fingers of somebody still typing, and an index left
     past its end selects nothing on Enter, silently */
  function changeQuery(value: string) {
    setQuery(value);
    setActive(0);
    setNewEmail("");
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
      notify.ok(`${candidate.person.name} was already signed in`);
      refocus();
      return;
    }

    /* onto the front of the list. by the end of a general body meeting this is
       forty rows, and the person who just tapped has to be able to see that it
       worked without scrolling past everybody who arrived before them */
    void commit(
      [candidate.person.pageId, ...present],
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

  /** the roster row this page holds, replaced after a chip was edited */
  function replacePerson(person: Person) {
    setRoster((current) =>
      current.map((candidate) =>
        candidate.person.pageId === person.pageId
          ? { ...candidate, person }
          : candidate,
      ),
    );
  }

  async function addNewPerson() {
    const name = query.trim();
    const email = newEmail.trim();
    if (!name || !email) return;

    setBusy(true);

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

      /* into the local roster too, so a second person with the same name later
         this evening is disambiguated against them rather than matched to them */
      setRoster((current) => [...current, candidate]);
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
                      {/*
                          a div and not a button, because the chips inside it
                          are buttons of their own and one cannot nest. the row
                          is still the target for a tap and for Enter, which
                          reaches it through the input's aria-activedescendant
                        */}
                      <div
                        id={`kiosk-match-${index}`}
                        role="option"
                        aria-selected={index === active}
                        onClick={() => !busy && markPresent(candidate)}
                        onMouseEnter={() => setActive(index)}
                        className={`hover:bg-muted flex w-full cursor-pointer items-center gap-3 p-3 text-left first:rounded-t-lg last:rounded-b-lg ${
                          busy ? "opacity-50" : ""
                        } ${index === active ? "bg-muted" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <MemberEntry
                            candidate={candidate}
                            faces={faces}
                            onEdit={(field) =>
                              setEditing({
                                field,
                                person: candidate.person,
                              })
                            }
                          />
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
                      </div>
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
                  yet.
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
                <Button
                  className="h-12"
                  disabled={busy || !newEmail.trim()}
                  onClick={() => void addNewPerson()}
                >
                  <PlusIcon className="size-4" />
                  {busy ? "Adding…" : `Add ${query.trim()} and sign in`}
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
              const candidate = byId.get(pageId);
              const name = candidate?.person.name ?? "Someone not on this list";

              return (
                <li
                  key={pageId}
                  className="flex items-center gap-3 py-2 pr-2 pl-3"
                >
                  <div className="min-w-0 flex-1">
                    {/* the same row as the left column, minus the edits: two
                        components meant two answers to "what do we know about
                        this person" */}
                    <MemberEntry
                      candidate={
                        candidate ?? {
                          person: {
                            pageId,
                            name,
                            discordId: null,
                            email: null,
                            status: null,
                          },
                          contributions: 0,
                        }
                      }
                      faces={faces}
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
