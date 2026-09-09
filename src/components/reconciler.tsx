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
  why,
  count,
  children,
}: {
  title: string;
  why: string;
  count: number;
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
      <CollapsibleContent className="space-y-3 pt-3">
        <p className="text-muted-foreground max-w-prose text-sm">{why}</p>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * one kind of problem inside a section, with the rows it applies to.
 *
 * a heading rather than a section of its own. Three sections for three
 * spellings of "the address on this row is not usable" would be three places
 * to look for one question, and the count an editor actually cares about is
 * the two that are wrong rather than the one that is merely empty
 */
function Group({
  title,
  why,
  people,
  faces,
  onEdit,
  note,
}: {
  title: string;
  why: string;
  people: Person[];
  faces: Faces;
  onEdit: (editing: Editing) => void;
  note?: (person: Person) => string | undefined;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-muted-foreground max-w-prose text-sm">{why}</p>
      </div>
      <ul className="divide-y rounded-lg border">
        {people.map((person) => (
          <li key={person.pageId} className="p-3">
            <MemberEntry
              person={person}
              faces={faces}
              note={note?.(person)}
              onEdit={(field) => onEdit({ field, person })}
            />
          </li>
        ))}
      </ul>
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
  const malformed = of("malformed");
  const mistyped = of("outside");

  /* said in the suggestions' empty state: "nothing to suggest" and "nobody is
     unlinked" are very different answers and both render as an empty list */
  const unlinked = roster.filter((person) => !person.discordId).length;

  return (
    <div className="space-y-10">
      <Section
        title="Discord applicants waiting to be matched to a member"
        why="They filled in the join form and the hourly sync would not decide who they are on its own. A Link button means exactly one row matches. Without one, several rows could be them, and the fix is to correct those rows in Notion first."
        count={linkable.length + ambiguous.length}
      >
        <div className="divide-y rounded-lg border">
          {linkable.length + ambiguous.length === 0 && (
            <Empty>Every applicant is already on a row.</Empty>
          )}
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
        why="Their attendance and bylines are split between the rows, so neither reaches a threshold they actually met. Rows sharing a name or an address are almost certainly one person; the ones a letter apart or differing by a middle name are guesses, and some will be wrong. Merging cannot be undone from here: the row you keep gains the other's articles, images and attendance, and the other goes to Notion's trash."
        count={duplicates.length}
      >
        <div className="divide-y rounded-lg border">
          {duplicates.length === 0 && (
            <Empty>
              Nobody appears twice, so the standing page can be trusted.
            </Empty>
          )}
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
        title="Members nobody has said are undergrad, grad or alum"
        why="Status is the one field nothing can work out on its own, and the voting rule turns on it. An empty one is not a disqualification: the standing page flags these people rather than denying them."
        count={unknownStatus.length}
      >
        <div className="divide-y rounded-lg border">
          {unknownStatus.length === 0 && (
            <Empty>Every member has a status.</Empty>
          )}
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
        title="Members already in the server whose row is not linked"
        why="They were in the Discord before their row existed, so no application ever connected the two and their picture does not appear beside their name. Only offered where exactly one row and one account share a name."
        count={discordSuggestions.length}
      >
        <div className="divide-y rounded-lg border">
          {discordSuggestions.length === 0 && (
            <Empty>
              {unlinked === 0
                ? "Every member row is linked to a Discord account."
                : `No name matches exactly. ${plural(unlinked, "member")} still ${unlinked === 1 ? "has" : "have"} no Discord account, and each can be linked from their chip above or at the kiosk.`}
            </Empty>
          )}
          {discordSuggestions.map(({ person, account }) => {
            const key = `discord:${person.pageId}`;
            return (
              <div key={key} className="space-y-2 p-4">
                <MemberEntry
                  person={person}
                  faces={faces}
                  note={
                    <span className="flex flex-wrap items-center gap-1.5">
                      looks like
                      <MemberFace
                        discordId={account.id}
                        name={account.displayName}
                        faces={faces}
                      />
                      <strong>{account.username}</strong>
                      {account.displayName !== account.username &&
                        `, shown in the server as ${account.displayName}`}
                    </span>
                  }
                >
                  {!said[key] && (
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
        title="Email addresses worth a look"
        why="An address is how somebody is matched to their Discord application later and how the announcements reach them. The two groups at the top are addresses that cannot be right. The rest are rows that predate the kiosk, which is nothing to fix today."
        count={mistyped.length + malformed.length}
      >
        <div className="space-y-4">
          {problems.length === 0 ? (
            <Empty>Every member has a university address.</Empty>
          ) : (
            <>
              {malformed.length > 0 && (
                <Group
                  title={`${plural(malformed.length, "address", "addresses")} that cannot be delivered`}
                  why="There is text in the field but it is not an address, so nothing has ever reached them and nothing on this page questions it."
                  people={malformed}
                  faces={faces}
                  onEdit={setEditing}
                />
              )}

              {mistyped.length > 0 && (
                <Group
                  title={`${plural(mistyped.length, "address", "addresses")} outside terpmail.umd.edu and umd.edu`}
                  why="Google will not add these to the group without an invitation, and a mistyped terpmail looks exactly like this: terpmial.umd.edu is a real answer on a real application."
                  people={mistyped}
                  faces={faces}
                  onEdit={setEditing}
                />
              )}

              {missing.length > 0 && (
                <Group
                  title={`${plural(missing.length, "member")} with no address at all`}
                  why="Expected for now. Most of the roster predates the kiosk, and those rows carry a byline and nothing else. Anybody signing in at a meeting is asked for one."
                  people={missing}
                  faces={faces}
                  onEdit={setEditing}
                  note={(person) =>
                    identifiesNobody(person)
                      ? "nothing else on this row either: no Discord, no writing, no status"
                      : undefined
                  }
                />
              )}
            </>
          )}
        </div>
      </Section>

      <Section
        title="Members missing from the announcements email group"
        why="Google gives software no way to read or write this group, so it is compared by hand. Export its members from the link below, choose the file, and this lists who on the roster is not in it."
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

          {!diff ? (
            <Empty>Choose an export to compare the roster against.</Empty>
          ) : emails.length === 0 ? (
            <Empty>Everybody with an address is already in the group.</Empty>
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

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground p-4 text-sm">{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm">{children}</p>;
}
