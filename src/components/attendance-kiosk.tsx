import { CheckIcon, UserPlusIcon, XIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { GhostKey, MemberFace } from "~/components/member-face";
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
  distinguish,
  indistinguishable,
  searchCandidates,
  type Candidate,
} from "~/lib/members/kiosk";
import type { MeetingRecord } from "~/lib/members/records";
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
  meetings: MeetingRecord[];
  candidates: Candidate[];
  /** the meeting the page opened on: the `meeting` search param, else today's */
  initialMeetingId: string | null;
  /** discord pictures for the roster, from one request for the whole guild */
  faces: Faces;
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

/* the route's own message where there is one — notion's refusals say useful
   things, and everybody at this laptop holds @Editorial Board */
const reason = (thrown: unknown) =>
  thrown instanceof Error ? thrown.message : String(thrown);

export function AttendanceKiosk({
  meetings,
  candidates,
  initialMeetingId,
  faces,
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
  /* one notice, not a confirmation and an error side by side: they are
     mutually exclusive, and keeping that true by hand across five call sites
     is how a kiosk shows a green tick above a red failure for the same tap */
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
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

  /* the query and the highlighted offer only ever move together: the list
     shortens under the fingers of somebody still typing, and an index left
     past its end selects nothing on Enter, silently */
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
    /* the new meeting's own attendees: carrying the current list across would
       file this room against a meeting it was not at */
    setPresent(meetings.find((one) => one.pageId === id)?.attendeeIds ?? []);
    setNotice(null);
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
      setNotice({ ok: true, text: say });
    } catch (thrown) {
      setPresent(before);
      setNotice({
        ok: false,
        text: `Not saved: ${reason(thrown)}. Try again.`,
      });
    } finally {
      setBusy(false);
      refocus();
    }
  }

  function markPresent(candidate: Candidate) {
    changeQuery("");

    if (present.includes(candidate.person.pageId)) {
      /* they tapped because they were not sure it had registered */
      setNotice({
        ok: true,
        text: `${candidate.person.name} was already signed in`,
      });
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
      setNewName("");
      setNewEmail("");
      setAdding(false);
      changeQuery("");

      await commit(
        [...present, created.pageId],
        `${created.name} was added and is signed in`,
      );
    } catch (thrown) {
      setNotice({ ok: false, text: `Could not add them: ${reason(thrown)}` });
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
              <SelectValue placeholder="Choose a meeting" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {meetings.map((one) => (
                  <SelectItem key={one.pageId} value={one.pageId}>
                    {dayOf(one)} {one.name || "Untitled"}
                    {one.type ? ` (${one.type})` : ""}
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
                          className={`hover:bg-muted flex w-full flex-col items-start gap-0.5 p-4 text-left first:rounded-t-lg last:rounded-b-lg disabled:opacity-50 ${
                            index === active ? "bg-muted" : ""
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
                            {clash && " · ask an officer, two rows look alike"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {query && matches.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  Nobody by that name yet.
                </p>
              )}
            </div>

            <div aria-live="polite" className="min-h-12">
              {notice?.ok && (
                <div className="flex items-center gap-2 rounded-lg border border-green-600/40 bg-green-600/10 p-4 text-lg font-medium">
                  <CheckIcon className="size-5 shrink-0" />
                  {notice.text}
                </div>
              )}
              {notice && !notice.ok && (
                <div
                  role="alert"
                  className="border-destructive/50 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm"
                >
                  {notice.text}
                </div>
              )}
            </div>

            {adding ? (
              <div className="space-y-3 rounded-lg border p-4">
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
                variant="ghost"
                className="h-12 w-full"
                onClick={() => setAdding(true)}
              >
                <UserPlusIcon className="size-4" />
                Someone new
              </Button>
            )}
          </>
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
              const person = byId.get(pageId)?.person ?? null;
              const name = person?.name ?? "Someone not on this list";

              return (
                <li
                  key={pageId}
                  className="flex items-center gap-3 py-2 pr-2 pl-3"
                >
                  <MemberFace
                    discordId={person?.discordId ?? null}
                    name={name}
                    faces={faces}
                  />
                  <span className="min-w-0 flex-1 truncate">{name}</span>
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

        <GhostKey />
      </div>
    </div>
  );
}
