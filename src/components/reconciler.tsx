import {
  AlertTriangleIcon,
  AtSignIcon,
  BellOffIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  ExternalLinkIcon,
  GraduationCapIcon,
  MailIcon,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { defaultStatus } from "~/lib/members/config";
import {
  compareToGroup,
  emailProblem,
  emailsInExport,
  GROUP_MEMBERS_URL,
  identifiesNobody,
  isExternalAddress,
  type EmailProblem,
} from "~/lib/members/group";
import {
  MemberEditDialog,
  type Editing,
} from "~/components/member-edit-dialog";
import { MemberEntry } from "~/components/member-entry";
import { MemberFace } from "~/components/member-face";
import type { Faces } from "~/lib/faces";
import type { Duplicate, Resolution } from "~/lib/members/match";
import { postJson } from "~/lib/post-json";
import { plural } from "~/lib/utils";
import type { Person } from "~/lib/members/records";
import { rosterKeys } from "~/lib/members/query-keys";
import { RosterQueries } from "~/lib/members/roster-queries";
import { usePatch, useRefresh, useRosterQuery } from "~/lib/members/queries";
import type { ReconcilerData } from "~/lib/members/views";
import type { Application } from "~/lib/services/discord/join-requests";

/*
  everything that needs a human, on one page. one rule between the sections:
  nothing here acts on a guess. Every decision is one the unattended cron
  declined to make, because a wrong guess makes two people out of one, and
  under ADR 0010 that costs somebody their vote.

  the duplicates section is why the standing page links here and refuses to
  look final until it is empty. The reconciler is run *before* the vote.
*/

/**
 * the page's own server-side read, which seeds the query and is then replaced
 * by it. `/api/members/reconciler` answers the same type from the same
 * function, so what a refetch shows cannot differ in shape from first paint
 */
type Props = {
  initial: ReconcilerData;
  /** discord pictures, so a person looks the same here as on the kiosk */
  faces: Faces;
};

/**
 * one heading and what is under it.
 *
 * the title says what the section is for in the words an editor would use, and
 * `why` is the sentence under it rather than the only explanation: a heading
 * that reads as a category — "Applications", "Duplicates" — makes somebody
 * open the section to find out what it wants from them
 */
function Section({
  title,
  how,
  count,
  clear,
  children,
}: {
  title: string;
  /** one short line, only where how the list was arrived at is not obvious */
  how?: string;
  count: number;
  /**
   * what to say when there is nothing in it, in four or five words.
   *
   * absent for a section whose body is not a list — the Google Group's is a
   * file picker, and hiding it whenever there was nothing to report would hide
   * the only control that could produce a report
   */
  clear?: string;
  children: React.ReactNode;
}) {
  return (
    <Collapsible defaultOpen render={<section />}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
        {/* base-ui puts `data-panel-open` on the trigger, not on the icon
            inside it, so the variant has to reach up to the group */}
        <ChevronDownIcon className="text-muted-foreground size-4 transition-transform duration-200 group-data-[panel-open]:rotate-180" />
        <h2 className="text-lg font-medium">{title}</h2>
        <Badge variant={count > 0 ? "default" : "outline"}>{count}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        {how && <p className="text-muted-foreground text-sm">{how}</p>}
        {clear && count === 0 ? <Cleared>{clear}</Cleared> : children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * an application the form's questions could not be read from, added by hand.
 *
 * prefilled with whatever did come back, so the usual case is confirming two
 * fields rather than typing them. What the applicant actually answered is
 * printed above it, because when a question is renamed the answers are all
 * still there and only their labels stopped matching
 */
function ManualAdd({
  application,
  missing,
  faces,
  statuses,
  busy,
  said,
  onAdd,
}: {
  application: Application;
  missing: string[];
  faces: Faces;
  statuses: string[];
  busy: boolean;
  said?: string;
  onAdd: (fields: { name: string; email: string; status?: string }) => void;
}) {
  const [name, setName] = useState(application.name ?? "");
  const [email, setEmail] = useState(application.email ?? "");
  const [status, setStatus] = useState(() => defaultStatus(statuses));

  return (
    <div className="space-y-3 p-4">
      <Applicant application={application} faces={faces} />
      <Badge variant="destructive">
        the form gave no {missing.join(" or ")}
      </Badge>

      {said ? (
        <Note>{said}</Note>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`add-name-${application.id}`}>Name</Label>
            <Input
              id={`add-name-${application.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`add-email-${application.id}`}>Email</Label>
            <Input
              id={`add-email-${application.id}`}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <div className="flex flex-wrap gap-2">
              {statuses.map((one) => (
                <Button
                  key={one}
                  type="button"
                  size="sm"
                  variant={status === one ? "secondary" : "outline"}
                  aria-pressed={status === one}
                  onClick={() => setStatus(one)}
                >
                  {one}
                </Button>
              ))}
            </div>
          </div>
          <Button
            disabled={busy || !name.trim() || !email.trim()}
            onClick={() =>
              onAdd({
                name: name.trim(),
                email: email.trim(),
                ...(status ? { status } : {}),
              })
            }
          >
            Add member
          </Button>
        </div>
      )}
    </div>
  );
}

/** how two rows came to be listed together, in the words the page uses */
const WHY_ALIKE: Record<Duplicate["on"], string> = {
  name: "the same name",
  email: "the same email",
  "near-name": "one letter apart",
  "same-ends": "a middle name on one and not the other",
};

/* the first two are exact matches and almost always one person; the other two
   are guesses, and a page that shouted equally about both would train an
   editor to ignore the ones that matter */
const SURE: Record<Duplicate["on"], boolean> = {
  name: true,
  email: true,
  "near-name": false,
  "same-ends": false,
};

/**
 * an applicant, drawn to line up with the roster rows beside them.
 *
 * they have no Members row yet, so there is no `Person` and no linked face —
 * but the account is in the guild, and that picture is the one thing that
 * makes an application recognisable as somebody the room knows
 */
function Applicant({
  application,
  faces,
}: {
  application: Application;
  faces: Faces;
}) {
  const called = application.name ?? application.username;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <MemberFace
        discordId={application.discordId}
        name={called}
        faces={faces}
        size="default"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="truncate font-medium">{called}</div>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="outline">
            <AtSignIcon />
            {application.username}
          </Badge>
          <Badge variant={application.email ? "outline" : "destructive"}>
            <MailIcon />
            {application.email ?? "no email given"}
          </Badge>
          {/* the graduation year is read and deliberately never stored — ADR
              0010 on why a kept one is wrong more often than it is useful */}
          {application.gradYear && (
            <Badge variant="outline">
              <GraduationCapIcon />
              says {application.gradYear}
            </Badge>
          )}
          <Badge variant="outline">applied {application.applied}</Badge>
        </div>
      </div>
    </div>
  );
}

export function Reconciler({ initial, faces }: Props) {
  return (
    <RosterQueries>
      <Sections initial={initial} faces={faces} />
    </RosterQueries>
  );
}

function Sections({ initial, faces }: Props) {
  const {
    resolutions,
    duplicates,
    unknownStatus,
    statuses,
    roster,
    discordSuggestions,
    guild,
  } = useRosterQuery(
    rosterKeys.reconciler(),
    "/api/members/reconciler",
    initial,
  );

  /*
    every action on this page changes what the *other* sections should say:
    linking an application can resolve a duplicate, and merging two rows takes
    an entry out of the list of members with no status. So each of them
    re-reads the whole page's answer rather than crossing off the row it
    touched, which is what used to leave an editor with a stale screen and a
    reload
  */
  const refresh = useRefresh(rosterKeys.reconciler());

  /*
    a corrected row goes into the cache rather than costing a re-read.
    Everything else on this page re-reads, because a link or a merge changes
    what the *other* sections should say; an address does not
  */
  const patch = usePatch<ReconcilerData>(rosterKeys.reconciler());

  /* what each row has been told about itself. a row that has been acted on
     stays on screen saying so rather than vanishing: this page is worked
     through top to bottom, and a list that reorders itself under somebody
     loses their place */
  const [said, setSaid] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [merging, setMerging] = useState<{
    keep: Person;
    drop: Person;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  /*
    the google group's own member list, as exported by an editor.

    held here and nowhere else: it is read from a file the browser already has,
    compared against the roster in memory, and never sent anywhere. There is
    nothing a server would add to a comparison of two lists of strings, and an
    export sitting in a log is a list of everybody's address
  */
  const [inGroup, setInGroup] = useState<Set<string> | null>(null);
  const [exportName, setExportName] = useState<string | null>(null);
  /* the same dialog the kiosk uses, so an address is corrected where it is
     noticed rather than in a second tab */
  const [editing, setEditing] = useState<Editing | null>(null);

  async function act(key: string, run: () => Promise<{ summary?: string }>) {
    setBusy(key);
    try {
      const { summary } = await run();
      setSaid((prev) => ({ ...prev, [key]: summary ?? "Done." }));
      await refresh();
    } catch (thrown) {
      setSaid((prev) => ({
        ...prev,
        [key]: thrown instanceof Error ? thrown.message : String(thrown),
      }));
    } finally {
      setBusy(null);
    }
  }

  /* narrowed with predicates rather than checked again inside the render: a
     `Resolution` is a union whose arms carry different fields, and re-testing
     `status` in the jsx is how one of them ends up reading a field the other
     does not have */
  /* the form's questions could not be found, so there is nothing to match on
     and nothing to write. Added by hand from what the applicant typed */
  const incomplete = resolutions.filter(
    (one): one is Extract<Resolution, { status: "incomplete" }> =>
      one.status === "incomplete",
  );

  const linkable = resolutions.filter(
    (one): one is Extract<Resolution, { status: "linkable" }> =>
      one.status === "linkable",
  );
  /*
    narrowed on the shape rather than by listing statuses: `people` is carried
    by exactly the arms nobody can decide automatically, so a seventh arm joins
    this section by existing. Naming the three meant a new one would be dropped
    from the page silently, which for a roster is how somebody goes missing
  */
  const ambiguous = resolutions.filter(
    (one): one is Extract<Resolution, { people: Person[] }> => "people" in one,
  );

  /* until a file is handed over there is nothing to say, which is different
     from saying nobody is missing */
  const diff = inGroup ? compareToGroup(roster, inGroup) : null;
  const emails = (diff?.missing ?? [])
    .map((person) => person.email)
    .filter((email): email is string => Boolean(email));
  /* flagged rather than dropped: google does not auto-add these, and an
     address nobody can add is still an address somebody has to deal with */
  const external = emails.filter((email) => isExternalAddress(email));

  /*
    one pass over the roster for the three ways an address can be unusable.
    Sorted by name inside each so the lists do not reshuffle between visits
  */
  const problems = roster
    .map((person) => ({ person, problem: emailProblem(person.email) }))
    .filter((one) => one.problem !== null)
    .sort((a, b) => a.person.name.localeCompare(b.person.name));

  const of = (kind: EmailProblem) =>
    problems.filter((one) => one.problem === kind).map((one) => one.person);

  const missing = of("missing");
  /* one section, because the fix is the same and so is the question an editor
     asks of it: text that is not an address, and a real address at neither
     university domain, are both "this is not the address we expect" */
  const wrongDomain = [...of("malformed"), ...of("outside")].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  /*
    every unlinked row, not only the ones a name matches. an empty section
    reading "nothing to suggest" and one reading "nobody is unlinked" are very
    different answers, and the rows without a suggestion are still the ones
    somebody has to work through
  */
  const unlinked = roster
    .filter((person) => !person.discordId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const suggestedFor = new Map(
    discordSuggestions.map((one) => [one.person.pageId, one.account]),
  );

  return (
    <div className="space-y-10">
      <Section
        title="Discord applicants needing attention"
        how="Approved applications the hourly sync would not act on by itself."
        count={linkable.length + ambiguous.length + incomplete.length}
        clear="No applicants waiting"
      >
        <div className="divide-y rounded-lg border">
          {linkable.map((one) => {
            const key = `link:${one.application.id}`;
            return (
              <div key={key} className="space-y-3 p-4">
                <Applicant application={one.application} faces={faces} />
                <div className="border-l-2 pl-4">
                  <MemberEntry
                    person={one.person}
                    faces={faces}
                    note={`the only row with the same ${one.on}`}
                  >
                    <Button
                      size="sm"
                      disabled={busy !== null || Boolean(said[key])}
                      onClick={() =>
                        void act(key, () =>
                          postJson("/api/members/link", {
                            applicationId: one.application.id,
                            pageId: one.person.pageId,
                          }),
                        )
                      }
                    >
                      {busy === key ? "Linking…" : "This is them"}
                    </Button>
                  </MemberEntry>
                </div>
                {said[key] && <Note>{said[key]}</Note>}
              </div>
            );
          })}
          {incomplete.map((one) => (
            <ManualAdd
              key={one.application.id}
              application={one.application}
              missing={one.missing}
              faces={faces}
              statuses={statuses}
              busy={busy !== null}
              said={said[`add:${one.application.id}`]}
              onAdd={(fields) =>
                void act(`add:${one.application.id}`, () =>
                  postJson("/api/members/create", {
                    ...fields,
                    discordId: one.application.discordId,
                  }),
                )
              }
            />
          ))}
          {ambiguous.map((one) => (
            <div key={one.application.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start gap-2">
                <Applicant application={one.application} faces={faces} />
                <Badge variant="destructive">
                  {one.status === "similar"
                    ? "too close to call"
                    : one.status === "conflicted"
                      ? "two rows disagree"
                      : "could be either"}
                </Badge>
              </div>
              <ul className="space-y-3 border-l-2 pl-4">
                {one.people.map((person) => (
                  <li key={person.pageId}>
                    <MemberEntry person={person} faces={faces} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Possible duplicate members"
        how="Rows sharing a name or an address, one letter apart, or differing only by a middle name. Merging cannot be undone."
        count={duplicates.length}
        clear="No duplicate members detected"
      >
        <div className="divide-y rounded-lg border">
          {duplicates.map((pair) => (
            <div key={`${pair.on}:${pair.value}`} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangleIcon
                  className={
                    SURE[pair.on] ? "text-destructive size-4" : "size-4"
                  }
                />
                <span className="font-medium">{pair.value}</span>
                <Badge variant={SURE[pair.on] ? "destructive" : "outline"}>
                  {WHY_ALIKE[pair.on]}
                </Badge>
              </div>
              <ul className="space-y-2">
                {pair.people.map((person) => {
                  const key = `merge:${person.pageId}`;
                  return (
                    <li key={person.pageId} className="space-y-1">
                      <MemberEntry person={person} faces={faces}>
                        {/* one button per *other* row, so the choice of which
                            survives is made explicitly rather than by whichever
                            happened to be listed first */}
                        {pair.people
                          .filter((other) => other.pageId !== person.pageId)
                          .map((other) => (
                            <Button
                              key={other.pageId}
                              size="sm"
                              variant="outline"
                              disabled={busy !== null}
                              onClick={() =>
                                setMerging({ keep: person, drop: other })
                              }
                            >
                              Keep this one
                            </Button>
                          ))}
                      </MemberEntry>
                      {said[key] && <Note>{said[key]}</Note>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Missing status field"
        how="Nothing can work this out, and the voting rule turns on it. An empty status does not disqualify anybody."
        count={unknownStatus.length}
        clear="Every member has a status"
      >
        <div className="divide-y rounded-lg border">
          {unknownStatus.map((person) => {
            const key = `status:${person.pageId}`;
            return (
              <div key={person.pageId} className="p-4">
                <MemberEntry person={person} faces={faces}>
                  {statuses.map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant="outline"
                      disabled={busy !== null || Boolean(said[key])}
                      onClick={() =>
                        void act(key, () =>
                          postJson("/api/members/status", {
                            pageId: person.pageId,
                            name: person.name,
                            status,
                          }),
                        )
                      }
                    >
                      {status}
                    </Button>
                  ))}
                </MemberEntry>
                {said[key] && <Note>{said[key]}</Note>}
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title="Missing Discord ID"
        how="A match is offered where exactly one account in the server shares their name."
        count={unlinked.length}
        clear="Every member is linked to an account"
      >
        <div className="divide-y rounded-lg border">
          {unlinked.map((person) => {
            const key = `discord:${person.pageId}`;
            const account = suggestedFor.get(person.pageId);

            return (
              <div key={key} className="space-y-2 p-4">
                <MemberEntry
                  person={person}
                  faces={faces}
                  note={
                    account && (
                      <span className="flex flex-wrap items-center gap-1.5">
                        looks like
                        <MemberFace
                          discordId={account.id}
                          name={account.displayName}
                          faces={faces}
                        />
                        <strong>{account.username}</strong>
                      </span>
                    )
                  }
                  onEdit={(field) => setEditing({ field, person })}
                >
                  {account && !said[key] && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() =>
                        void act(key, () =>
                          postJson("/api/members/discord", {
                            pageId: person.pageId,
                            name: person.name,
                            discordId: account.id,
                          }),
                        )
                      }
                    >
                      Same person
                    </Button>
                  )}
                </MemberEntry>
                {said[key] && <Note>{said[key]}</Note>}
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title="Missing email field"
        how="An address is what matches somebody to their application later and what the announcements reach them at. Expected on rows that predate the kiosk."
        count={missing.length}
        clear="Every member has an address"
      >
        <ul className="divide-y rounded-lg border">
          {missing.map((person) => (
            <li key={person.pageId} className="p-3">
              <MemberEntry
                person={person}
                faces={faces}
                note={
                  identifiesNobody(person)
                    ? "nothing else on this row either"
                    : undefined
                }
                onEdit={(field) => setEditing({ field, person })}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Incorrect email domain"
        how="Not terpmail.umd.edu or umd.edu, or not an address at all. Google will not add these to the group without an invitation."
        count={wrongDomain.length}
        clear="Every address is a university one"
      >
        <ul className="divide-y rounded-lg border">
          {wrongDomain.map((person) => (
            <li key={person.pageId} className="p-3">
              <MemberEntry
                person={person}
                faces={faces}
                note={
                  emailProblem(person.email) === "malformed"
                    ? "not an address at all"
                    : undefined
                }
                onEdit={(field) => setEditing({ field, person })}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Missing from Google Group"
        how="Google gives software no way to read this group, so it is compared by hand."
        count={diff ? diff.missing.length : 0}
      >
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              render={
                <a href={GROUP_MEMBERS_URL} target="_blank" rel="noreferrer" />
              }
            >
              <ExternalLinkIcon className="size-4" />
              Open the group's members
            </Button>
            <Label
              htmlFor="group-export"
              className="text-muted-foreground text-sm font-normal"
            >
              then Export CSV and choose the file:
            </Label>
            <Input
              id="group-export"
              type="file"
              accept=".csv,text/csv,text/plain"
              className="w-auto"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;

                void file.text().then((text) => {
                  setInGroup(emailsInExport(text));
                  setExportName(file.name);
                });
              }}
            />
          </div>

          {/* the file is read here and goes no further, which is worth saying
              on screen: it is every member's address */}
          <p className="text-muted-foreground text-sm">
            {exportName
              ? `Compared against ${exportName}, which stayed in this browser.`
              : "The file is read in this browser and never uploaded."}
          </p>

          {/* the same rows the email section lists, said once here as a count:
              repeating the names put everybody with no address on this page
              twice, in two sections that meant the same thing by it */}
          {diff && diff.unreachable.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {plural(diff.unreachable.length, "member")}{" "}
              {diff.unreachable.length === 1 ? "has" : "have"} no address at
              all, so nothing below can reach them and no paste will fix it.
              They are listed under Email addresses worth a look.
            </p>
          )}

          {!diff ? null : emails.length === 0 ? (
            <Cleared>Everybody with an address is in the group</Cleared>
          ) : (
            <>
              {external.length > 0 && (
                <div className="border-destructive/50 bg-destructive/10 space-y-1 rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangleIcon className="size-4" />
                    {external.length} address
                    {external.length === 1 ? "" : "es"} outside terpmail.umd.edu
                    and umd.edu
                  </div>
                  <p className="text-muted-foreground">
                    These do not auto-add and may need an invitation instead.
                  </p>
                  <ul className="list-inside list-disc">
                    {external.map((email) => (
                      <li key={email}>{email}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/*
                the people, not only their addresses. a blob of text is what
                gets pasted, and it is also the one thing on this page nobody
                can check: an editor who recognises a name as somebody who left
                on purpose can only act on it if the name is on screen
              */}
              <ul className="divide-y rounded-lg border">
                {diff.missing.map((person) => {
                  const key = `mute:${person.pageId}`;
                  return (
                    <li key={person.pageId} className="space-y-1 p-3">
                      <MemberEntry person={person} faces={faces}>
                        {!said[key] && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy !== null}
                            onClick={() =>
                              void act(key, () =>
                                postJson("/api/members/announcements", {
                                  pageId: person.pageId,
                                  name: person.name,
                                  noAnnouncements: true,
                                }),
                              )
                            }
                          >
                            <BellOffIcon className="size-4" />
                            They opted out
                          </Button>
                        )}
                      </MemberEntry>
                      {said[key] && <Note>{said[key]}</Note>}
                    </li>
                  );
                })}
              </ul>

              <label className="sr-only" htmlFor="group-blob">
                Emails to paste into the group
              </label>
              <Textarea
                id="group-blob"
                readOnly
                rows={Math.min(emails.length + 1, 10)}
                /* comma-separated because that is the shape the group's
                   bulk-add field accepts; a newline-separated list has to be
                   cleaned up by hand */
                value={emails.join(", ")}
                className="font-mono text-xs"
              />

              <Button
                variant="outline"
                onClick={() => {
                  /* the clipboard rejects when the document is not focused
                     or permission was refused, and the textarea above is
                     still selectable by hand, so a failure leaves the tick
                     off rather than throwing */
                  void navigator.clipboard
                    .writeText(emails.join(", "))
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false));
                }}
              >
                {copied ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
                {copied
                  ? "Copied"
                  : `Copy ${plural(emails.length, "address", "addresses")}`}
              </Button>
            </>
          )}

          {/* the people the comparison deliberately does not offer. shown as a
              count, because the point is that nobody has to do anything about
              them — and shown at all, because a silent exclusion is how the
              numbers stop adding up with nothing to explain why */}
          {diff && diff.optedOut.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {plural(diff.optedOut.length, "member")} asked not to be added,
              and {diff.optedOut.length === 1 ? "is" : "are"} left out of the
              list above. Untick No Announcements on their Notion row to offer
              them again.
            </p>
          )}

          {/* an address in the group that no row claims is how a typo in
              notion shows up, and it is also every alum the club has ever
              had. A count, not a list to work through */}
          {diff && diff.strangers.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {plural(diff.strangers.length, "address", "addresses")} in the
              group match nobody on the roster. Alumni, mostly, though a typo in
              a Notion email looks the same from here.
            </p>
          )}
        </div>
      </Section>

      {/* every chip on this page opens this, so a missing address or account
          is fixed where somebody noticed it */}
      <MemberEditDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={(person: Person) =>
          patch((current) => ({
            ...current,
            roster: current.roster.map((one) =>
              one.pageId === person.pageId ? person : one,
            ),
          }))
        }
        guild={guild}
        statuses={statuses}
      />

      {/* the only irreversible action on the page, so it names both rows and
          says which one is going away */}
      <Dialog
        open={merging !== null}
        onOpenChange={(open) => !open && setMerging(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge these two rows?</DialogTitle>
            <DialogDescription>
              <strong>{merging?.keep.name}</strong> (
              {merging?.keep.email ?? "no email"}) will survive and keep its
              name and status. <strong>{merging?.drop.name}</strong> (
              {merging?.drop.email ?? "no email"}) will have its articles,
              images and attendance moved across and will then be put in
              Notion's trash. This cannot be undone from here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMerging(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const { keep, drop } = merging!;
                setMerging(null);
                void act(`merge:${keep.pageId}`, () =>
                  postJson("/api/members/merge", {
                    keepId: keep.pageId,
                    dropId: drop.pageId,
                    keepName: keep.name,
                  }),
                );
              }}
            >
              Merge into {merging?.keep.name}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** nothing to do here, said the same way in every section */
function Cleared({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 rounded-lg border p-4 text-sm">
      <CheckIcon className="size-4" />
      {children}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm">{children}</p>;
}
