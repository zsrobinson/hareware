import {
  AlertTriangleIcon,
  AtSignIcon,
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  GraduationCapIcon,
  MailIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "~/components/copy-button";
import { NewMemberForm, type NewMember } from "~/components/new-member-form";
import { AlumMissing, Problem } from "~/components/problem";
import { StatusPicker } from "~/components/status-picker";
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
  emailProblems,
  emailsInExport,
  GROUP_MEMBERS_URL,
  identifiesNobody,
  isExternalAddress,
} from "~/lib/members/group";
import {
  MemberEditDialog,
  type Editing,
} from "~/components/member-edit-dialog";
import { MemberEntry } from "~/components/member-entry";
import { MemberFace } from "~/components/member-face";
import type { Faces } from "~/lib/faces";
import {
  SURE,
  WHY_ALIKE,
  WHY_UNDECIDED,
  type Resolution,
} from "~/lib/members/match";
import { postJson } from "~/lib/post-json";
import { errorMessage, plural } from "~/lib/utils";
import type { Person } from "~/lib/members/records";
import { rosterKeys } from "~/lib/members/query-keys";
import { RosterQueries } from "~/lib/members/roster-queries";
import { usePatch, useRefresh, useRosterQuery } from "~/lib/members/queries";
import type { ReconcilerData } from "~/lib/members/views";
import type { Application } from "~/lib/members/applications";

/*
  every roster decision the unattended sync declined to make, for a person to
  make before a vote. Nothing here acts on a guess; ADR 0010 has why.
*/

type Props = {
  /** the page's server-side read; `/api/members/reconciler` answers the same */
  initial: ReconcilerData;
  faces: Faces;
};

/** what the last write for a row answered */
type Said = { ok: boolean; text: string };

function Section({
  title,
  how,
  count,
  clear,
  children,
}: {
  title: string;
  how?: string;
  /** null while there is nothing to count yet, which is not the same as none */
  count: number | null;
  /** shown instead of an empty list; absent where the body is not a list */
  clear?: string;
  children: React.ReactNode;
}) {
  return (
    <Collapsible defaultOpen render={<section />}>
      <h2 className="text-lg font-medium">
        <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
          {/* base-ui marks the trigger, not the icon, as open */}
          <ChevronDownIcon className="text-muted-foreground size-4 transition-transform duration-200 group-data-[panel-open]:rotate-180" />
          {title}
          {count !== null && (
            <Badge variant={count > 0 ? "default" : "outline"}>{count}</Badge>
          )}
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent className="space-y-2 pt-2">
        {how && <p className="text-muted-foreground text-sm">{how}</p>}
        {clear && count === 0 ? <Cleared>{clear}</Cleared> : children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** an application whose name or email the form did not give, added by hand */
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
  said?: Said;
  onAdd: (member: NewMember) => void;
}) {
  return (
    <div className="space-y-3 p-4">
      <Applicant application={application} faces={faces} />
      <Badge variant="destructive">
        the form gave no {missing.join(" or ")}
      </Badge>

      {said?.ok ? (
        <Note>{said.text}</Note>
      ) : (
        <NewMemberForm
          id={`add-${application.id}`}
          initialName={application.name ?? ""}
          initialEmail={application.email ?? ""}
          statuses={statuses}
          busy={busy}
          submit="Add member"
          onAdd={onAdd}
        />
      )}
      {said && !said.ok && <Note>{said.text}</Note>}
    </div>
  );
}

/** an applicant, who has a Discord account but no Members row yet */
function Applicant({
  application,
  faces,
}: {
  application: Application;
  faces: Faces;
}) {
  return (
    <MemberEntry
      person={{
        pageId: application.id,
        name: application.name ?? application.username,
        discordId: application.discordId,
        email: application.email,
        status: null,
        contributions: 0,
      }}
      faces={faces}
      badges={
        <>
          <Badge variant="outline">
            <AtSignIcon />
            {application.username}
          </Badge>
          {!application.email && (
            <Badge variant="destructive">
              <MailIcon />
              no email given
            </Badge>
          )}
          {/* shown but never stored; see ADR 0010 */}
          {application.gradYear && (
            <Badge variant="outline">
              <GraduationCapIcon />
              says {application.gradYear}
            </Badge>
          )}
          {application.applied && (
            <Badge variant="outline">applied {application.applied}</Badge>
          )}
        </>
      }
    />
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
    liveStatuses,
    alumMissing,
    discordProblem,
    notionProblem,
  } = useRosterQuery(
    rosterKeys.reconciler(),
    "/api/members/reconciler",
    initial,
  );

  /* every write re-reads the whole page: a link or a merge changes what the
     other sections say */
  const refresh = useRefresh(rosterKeys.reconciler());

  /* an edited row is patched in at once, then re-read with the rest */
  const patch = usePatch<ReconcilerData>(rosterKeys.reconciler());

  /* each row's last answer. A success locks the row until the re-read removes
     it; a failure leaves it open to retry */
  const [said, setSaid] = useState<Record<string, Said>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [merging, setMerging] = useState<{
    keep: Person;
    drop: Person;
  } | null>(null);
  /* the Google Group export. It is every member's address, so it never
     leaves the browser */
  const [inGroup, setInGroup] = useState<Set<string> | null>(null);
  const [exportName, setExportName] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  async function act(key: string, run: () => Promise<{ summary?: string }>) {
    setBusy(key);
    try {
      const { summary } = await run();
      const text = summary ?? "Done.";
      setSaid((prev) => ({ ...prev, [key]: { ok: true, text } }));
      /* a toast, because the re-read removes the row and its note */
      toast.success(text);
      await refresh();
    } catch (thrown) {
      setSaid((prev) => ({
        ...prev,
        [key]: { ok: false, text: errorMessage(thrown) },
      }));
    } finally {
      setBusy(null);
    }
  }

  const incomplete = resolutions.filter(
    (one): one is Extract<Resolution, { status: "incomplete" }> =>
      one.status === "incomplete",
  );

  const linkable = resolutions.filter(
    (one): one is Extract<Resolution, { status: "linkable" }> =>
      one.status === "linkable",
  );
  /* by shape rather than by status, so a new undecided arm cannot be dropped
     from the page */
  const ambiguous = resolutions.filter(
    (one): one is Extract<Resolution, { people: Person[] }> => "people" in one,
  );

  const diff = inGroup ? compareToGroup(roster, inGroup) : null;
  const emails = (diff?.missing ?? [])
    .map((person) => person.email)
    .filter((email): email is string => Boolean(email));
  /* the group's bulk-add field takes commas */
  const blob = emails.join(", ");
  /* google does not auto-add these, so they are flagged */
  const external = emails.filter((email) => isExternalAddress(email));

  const { missing, wrongDomain } = emailProblems(roster);

  const unlinked = roster
    .filter((person) => !person.discordId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const suggestedFor = new Map(
    discordSuggestions.map((one) => [one.person.pageId, one.account]),
  );

  return (
    <div className="space-y-10">
      {(notionProblem || alumMissing || discordProblem) && (
        <div className="space-y-2">
          {notionProblem && <Problem>{notionProblem}</Problem>}
          {alumMissing && <AlumMissing options={liveStatuses} />}
          {discordProblem && (
            <Problem>
              Discord could not be read completely, so application and account
              suggestions may be unavailable: {discordProblem}
            </Problem>
          )}
        </div>
      )}

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
                      disabled={busy !== null || said[key]?.ok}
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
                {said[key] && <Note>{said[key].text}</Note>}
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
              onAdd={({ name, email, status }) =>
                void act(`add:${one.application.id}`, () =>
                  postJson("/api/members/create", {
                    name,
                    email,
                    ...(status ? { status } : {}),
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
                <Badge variant="destructive">{WHY_UNDECIDED[one.status]}</Badge>
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
                        {/* one per other row, so which survives is explicit */}
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
                      {said[key] && <Note>{said[key].text}</Note>}
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
                  <StatusPicker
                    statuses={statuses}
                    value={null}
                    label={`${person.name}'s status`}
                    hideLabel
                    size="sm"
                    disabled={busy !== null || said[key]?.ok}
                    onPick={(status) =>
                      void act(key, () =>
                        postJson("/api/members/status", {
                          pageId: person.pageId,
                          status,
                        }),
                      )
                    }
                  />
                </MemberEntry>
                {said[key] && <Note>{said[key].text}</Note>}
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
                  {account && !said[key]?.ok && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() =>
                        void act(key, () =>
                          postJson("/api/members/discord", {
                            pageId: person.pageId,
                            discordId: account.id,
                          }),
                        )
                      }
                    >
                      Same person
                    </Button>
                  )}
                </MemberEntry>
                {said[key] && <Note>{said[key].text}</Note>}
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
        count={diff ? diff.missing.length : null}
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

                file.text().then(
                  (text) => {
                    setInGroup(emailsInExport(text));
                    setExportName(file.name);
                  },
                  (thrown: unknown) =>
                    toast.error(
                      `Could not read ${file.name}: ${errorMessage(thrown)}`,
                    ),
                );
              }}
            />
          </div>

          <p className="text-muted-foreground text-sm">
            {exportName
              ? `Compared against ${exportName}, which stayed in this browser.`
              : "The file is read in this browser and never uploaded."}
          </p>

          {/* counted, not listed: they are listed under Missing email field */}
          {diff && diff.unreachable.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {plural(diff.unreachable.length, "member")}{" "}
              {diff.unreachable.length === 1 ? "has" : "have"} no address at
              all, so nothing below can reach them and no paste will fix it.
              They are listed under Missing email field.
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

              <ul className="divide-y rounded-lg border">
                {diff.missing.map((person) => (
                  <li key={person.pageId} className="p-3">
                    <MemberEntry person={person} faces={faces} />
                  </li>
                ))}
              </ul>

              <label className="sr-only" htmlFor="group-blob">
                Emails to paste into the group
              </label>
              <div className="flex items-start gap-2">
                <Textarea
                  id="group-blob"
                  readOnly
                  rows={Math.min(emails.length + 1, 10)}
                  value={blob}
                  className="font-mono text-xs"
                />
                <CopyButton id="group-blob" label="Copy the addresses" />
              </div>
            </>
          )}

          {diff && diff.strangers.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {plural(diff.strangers.length, "address", "addresses")} in the
              group match nobody on the roster. Alumni, mostly, though a typo in
              a Notion email looks the same from here.
            </p>
          )}
        </div>
      </Section>

      <MemberEditDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={(person: Person) => {
          patch((current) => ({
            ...current,
            roster: current.roster.map((one) =>
              one.pageId === person.pageId ? person : one,
            ),
          }));
          void refresh();
        }}
        guild={guild}
        statuses={statuses}
      />

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
