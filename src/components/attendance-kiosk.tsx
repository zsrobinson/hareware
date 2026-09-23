import { useMutation } from "@tanstack/react-query";
import { PlusIcon, XIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  MemberEditDialog,
  type Editing,
  type GuildOption,
} from "~/components/member-edit-dialog";
import { MemberEntry } from "~/components/member-entry";
import { NewMemberForm, type NewMember } from "~/components/new-member-form";
import { Problem } from "~/components/problem";
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
} from "~/lib/members/kiosk";
import { rosterKeys } from "~/lib/members/query-keys";
import { RosterQueries } from "~/lib/members/roster-queries";
import { useAttendance, usePatch, useRosterQuery } from "~/lib/members/queries";
import type { KioskData } from "~/lib/members/views";
import type { Intent } from "~/lib/members/attendance";
import type { MeetingRecord, Person } from "~/lib/members/records";
import { postJson } from "~/lib/post-json";
import { errorMessage } from "~/lib/utils";

/*
  the sign-in laptop at a meeting (ADR 0010). A queue of people type their own
  names, so the input takes focus back after every entry and each entry is
  confirmed by name.
*/

type Props = {
  /** the page's server-side read; `/api/members/kiosk` answers the same */
  initial: KioskData;
  /** `today` in eastern, fixed by the page so an evening does not roll over */
  today: string;
  faces: Faces;
  /** for the Discord chip's autocomplete */
  guild: GuildOption[];
};

async function createPerson({ name, email, status }: NewMember) {
  const { pageId } = await postJson<{ pageId?: string }>(
    "/api/members/create",
    { name, email, ...(status ? { status } : {}) },
  );

  /* without an id the row could not be signed in or removed */
  if (!pageId) throw new Error("the member was created without an id");

  return pageId;
}

const describe = (meeting: MeetingRecord) =>
  `${meeting.date} ${meetingLabel(meeting.name) || "Untitled"}`;

export function AttendanceKiosk(props: Props) {
  return (
    <RosterQueries>
      <Kiosk {...props} />
    </RosterQueries>
  );
}

function Kiosk({ initial, today, faces, guild }: Props) {
  /* the attendee list lives only in `useAttendance`'s cache; the meeting id
     is also the query key, so the read and the screen cannot disagree */
  const [meetingId, setMeetingId] = useState(initial.openingId ?? "");

  const data = useRosterQuery(
    rosterKeys.kiosk(meetingId),
    `/api/members/kiosk?today=${encodeURIComponent(today)}${
      meetingId ? `&meeting=${encodeURIComponent(meetingId)}` : ""
    }`,
    initial,
    /* the seed describes only the meeting the page opened on */
    meetingId === (initial.openingId ?? ""),
  );

  const { meetings, candidates, statuses, notionProblem } = data;
  const { present, known, saving, tap } = useAttendance(meetingId, data);

  const patchRoster = usePatch<KioskData>(rosterKeys.kiosk(meetingId));

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
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

  /* an index left past the shortened list would select nothing on Enter */
  function changeQuery(value: string) {
    setQuery(value);
    setActive(0);
  }

  /* `preventScroll`, or every tap jumps a long page back to the top */
  function refocus() {
    search.current?.focus({ preventScroll: true });
  }

  function switchMeeting(id: string) {
    setMeetingId(id);
    /* so a reload comes back to this meeting. `history.state` must be kept:
       `<ClientRouter />` reloads the page on a popstate that finds it gone */
    const url = new URL(location.href);
    url.searchParams.set("meeting", id);
    history.replaceState(history.state, "", url);
    refocus();
  }

  /** one tap onto the queue. It draws at once; a refusal takes it back off */
  function record(intent: Intent, say: string) {
    if (!meetingId) return;

    tap({ intent, say });
    refocus();
  }

  function markPresent(person: Person) {
    changeQuery("");

    if (present.includes(person.pageId)) {
      /* they tapped because they were not sure it had registered */
      toast.success(`${person.name} was already signed in`);
      refocus();
      return;
    }

    record(
      { kind: "add", pageId: person.pageId },
      `${person.name} is signed in`,
    );
  }

  function remove(pageId: string) {
    const person = byId.get(pageId);
    const name = person ? person.name : "that row";

    record({ kind: "remove", pageId }, `Removed ${name}`);
  }

  /* patched, not re-read: see `usePatch` */
  function replacePerson(person: Person) {
    patchRoster((current) => ({
      ...current,
      candidates: current.candidates.map((one) =>
        one.pageId === person.pageId ? person : one,
      ),
    }));
  }

  /* not in the attendance queue: it must finish before there is an id */
  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: createPerson,
    onSuccess: (pageId, fields) => {
      const added: Person = {
        pageId,
        name: fields.name,
        email: fields.email,
        discordId: null,
        status: fields.status,
        contributions: 0,
      };

      /* into the roster, so a later namesake is told apart from them */
      patchRoster((current) => ({
        ...current,
        candidates: [...current.candidates, added],
      }));
      changeQuery("");

      record(
        { kind: "add", pageId },
        `${fields.name} was added and is signed in`,
      );
    },
    onError: (thrown) =>
      toast.error(`Could not add them: ${errorMessage(thrown)}`),
  });

  /* `present` is in insertion order, as notion keeps it; newest first here */
  const signedIn = useMemo(() => [...present].reverse(), [present]);

  const listboxId = "kiosk-matches";

  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        {notionProblem && <Problem>{notionProblem}</Problem>}
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="kiosk-meeting" className="text-muted-foreground">
            Meeting
          </Label>
          <Select
            value={meetingId}
            onValueChange={(value) => switchMeeting(String(value))}
          >
            <SelectTrigger id="kiosk-meeting" size="sm">
              {/* base-ui would otherwise show the raw page id */}
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
                  /* never falls through to creating a half-typed name */
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
                  const clash = matches.some(
                    (other) =>
                      other !== person && indistinguishable(other, person),
                  );

                  return (
                    <li key={person.pageId} role="presentation">
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
                          {/* no chips here: edits live on the signed-in row */}
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

            {query.trim() && matches.length === 0 && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm">
                  Nobody on the roster is called <strong>{query.trim()}</strong>{" "}
                  yet. Please use your full first and last name.
                </p>
                <NewMemberForm
                  key={query.trim()}
                  id="kiosk-new"
                  name={query.trim()}
                  statuses={statuses}
                  busy={creating}
                  large
                  submit={
                    <>
                      <PlusIcon className="size-4" />
                      {creating ? "Adding…" : "Add and sign in"}
                    </>
                  }
                  onAdd={(member) => create(member)}
                />
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
          <p className="text-muted-foreground text-sm">
            {known ? "Nobody yet." : "Reading who is signed in…"}
          </p>
        ) : (
          <ul aria-label="Signed in" className="divide-y rounded-lg border">
            {signedIn.map((pageId) => {
              const listed = byId.get(pageId);
              const person = listed ?? {
                pageId,
                name: "Someone not on this list",
                discordId: null,
                email: null,
                status: null,
                contributions: 0,
              };
              const name = person.name;

              return (
                <li
                  key={pageId}
                  className="flex items-center gap-3 py-2 pr-2 pl-3"
                >
                  <div className="min-w-0 flex-1">
                    {/* no chips for a row this roster does not hold */}
                    <MemberEntry
                      person={person}
                      faces={faces}
                      onEdit={
                        listed &&
                        ((field) => setEditing({ field, person: listed }))
                      }
                    />
                  </div>
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
