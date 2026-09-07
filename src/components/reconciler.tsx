import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  ExternalLinkIcon,
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
import { Textarea } from "~/components/ui/textarea";
import { MEMBER_STATUSES, type MemberStatus } from "~/lib/members/config";
import type { Duplicate, Resolution } from "~/lib/members/match";
import { postJson } from "~/lib/post-json";
import type { Person } from "~/lib/members/records";
import type { Application } from "~/lib/services/discord/join-requests";

/*
  everything that needs a human, on one page. one rule between the sections:
  nothing here acts on a guess. Every decision is one the unattended cron
  declined to make, because a wrong guess makes two people out of one, and
  under ADR 0010 that costs somebody their vote.

  the duplicates section is why the standing page links here and refuses to
  look final until it is empty. The reconciler is run *before* the vote.
*/

type GroupState = {
  /** the ISO day somebody last pasted into the group, or null if never */
  watermark: string | null;
  /** everyone approved since, in the order they applied */
  pending: Application[];
  /** the addresses that are not terpmail or umd, flagged by `isExternalAddress` */
  external: string[];
};

type Props = {
  resolutions: Resolution[];
  duplicates: Duplicate[];
  /** rows whose `Status` select is empty — the one field a person maintains */
  unknownStatus: Person[];
  group: GroupState;
};

/* a section with nothing waiting starts folded: this page is worked top to
   bottom, and the sections that need somebody are the ones with a count */
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
    <Collapsible defaultOpen={count > 0} render={<section />}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 text-left">
        <ChevronDownIcon className="text-muted-foreground size-4 transition-transform data-[panel-open]:rotate-180" />
        <h2 className="text-lg font-medium">{title}</h2>
        <Badge variant={count > 0 ? "default" : "outline"}>{count}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-3">
        <p className="text-muted-foreground text-sm">{why}</p>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** a person, spelled the way a page deciding about them needs to see them */
function Who({ person }: { person: Person }) {
  return (
    <span>
      <strong>{person.name}</strong>{" "}
      <span className="text-muted-foreground text-sm">
        {person.email ?? "no email"}
        {person.discordId ? " · has a Discord ID" : " · no Discord ID"}
        {person.status ? ` · ${person.status}` : ""}
      </span>
    </span>
  );
}

function Applicant({ application }: { application: Application }) {
  return (
    <span>
      <strong>{application.name ?? application.username}</strong>{" "}
      <span className="text-muted-foreground text-sm">
        {application.email ?? "no email given"} · applied {application.applied}
        {/* the graduation year is read and deliberately never stored — ADR
            0010 on why a kept one is wrong more often than it is useful */}
        {application.gradYear ? ` · says ${application.gradYear}` : ""}
      </span>
    </span>
  );
}

export function Reconciler({
  resolutions,
  duplicates,
  unknownStatus,
  group,
}: Props) {
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

  async function act(key: string, run: () => Promise<{ summary?: string }>) {
    setBusy(key);
    try {
      const { summary } = await run();
      setSaid((prev) => ({ ...prev, [key]: summary ?? "Done." }));
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

  const emails = group.pending
    .map((application) => application.email)
    .filter((email): email is string => Boolean(email));

  return (
    <div className="space-y-10">
      <Section
        title="Applications"
        why="What the hourly sync would not decide on its own. A Link button means one row matches; without one, several rows could be this person and the fix is to correct them in Notion and reload."
        count={linkable.length + ambiguous.length}
      >
        <div className="divide-y rounded-lg border">
          {linkable.length + ambiguous.length === 0 && (
            <Empty>Nothing waiting.</Empty>
          )}
          {linkable.map((one) => {
            const key = `link:${one.application.id}`;
            return (
              <div key={key} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Applicant application={one.application} />
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
                    {busy === key ? "Linking…" : "Link"}
                  </Button>
                </div>
                <div className="text-sm">
                  → <Who person={one.person} />{" "}
                  <Badge variant="outline">matched on {one.on}</Badge>
                </div>
                {said[key] && <Note>{said[key]}</Note>}
              </div>
            );
          })}
          {ambiguous.map((one) => (
            <div key={one.application.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Applicant application={one.application} />
                <Badge variant="destructive">{one.status}</Badge>
              </div>
              <ul className="space-y-1 text-sm">
                {one.people.map((person) => (
                  <li key={person.pageId}>
                    → <Who person={person} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Rows that look like the same person twice"
        why="Attendance split across two rows fails a threshold the person met. Merging cannot be undone from here: the row you keep gains the other's articles, images and attendance."
        count={duplicates.length}
      >
        <div className="divide-y rounded-lg border">
          {duplicates.length === 0 && (
            <Empty>No near-matches. The standing page can be trusted.</Empty>
          )}
          {duplicates.map((pair) => (
            <div key={`${pair.on}:${pair.value}`} className="space-y-2 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangleIcon className="text-destructive size-4" />
                <span className="font-medium">{pair.value}</span>
                <Badge variant="outline">same {pair.on}</Badge>
              </div>
              <ul className="space-y-2">
                {pair.people.map((person) => {
                  const key = `merge:${person.pageId}`;
                  return (
                    <li
                      key={person.pageId}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <Who person={person} />
                      <div className="flex flex-wrap gap-2">
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
                              Keep this one, fold in {other.name}
                            </Button>
                          ))}
                      </div>
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
        title="Members with no status"
        why="The one field nothing can derive. An empty status is not a disqualification; the standing page flags these people rather than denying them."
        count={unknownStatus.length}
      >
        <div className="divide-y rounded-lg border">
          {unknownStatus.length === 0 && <Empty>Everybody has one.</Empty>}
          {unknownStatus.map((person) => {
            const key = `status:${person.pageId}`;
            return (
              <div
                key={person.pageId}
                className="flex flex-wrap items-center justify-between gap-2 p-4"
              >
                <Who person={person} />
                <div className="flex flex-wrap items-center gap-2">
                  {MEMBER_STATUSES.map((status: MemberStatus) => (
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
                  {said[key] && <Note>{said[key]}</Note>}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title="Google Group"
        why="The group cannot be written by software. Paste this into its bulk-add field, then say it is done."
        count={emails.length}
      >
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">
            {group.watermark
              ? `Last done ${group.watermark}.`
              : "Never done. This is everybody ever approved."}
          </p>

          {emails.length === 0 ? (
            <Empty>Nobody new since then.</Empty>
          ) : (
            <>
              {group.external.length > 0 && (
                <div className="border-destructive/50 bg-destructive/10 space-y-1 rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangleIcon className="size-4" />
                    {group.external.length} address
                    {group.external.length === 1 ? "" : "es"} outside
                    terpmail.umd.edu and umd.edu
                  </div>
                  <p className="text-muted-foreground">
                    These do not auto-add and may need an invitation instead.
                  </p>
                  <ul className="list-inside list-disc">
                    {group.external.map((email) => (
                      <li key={email}>{email}</li>
                    ))}
                  </ul>
                </div>
              )}

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

              <div className="flex flex-wrap gap-2">
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
                  {copied ? "Copied" : `Copy ${emails.length} addresses`}
                </Button>

                <Button
                  variant="outline"
                  render={
                    <a
                      href="https://groups.google.com/"
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  <ExternalLinkIcon className="size-4" />
                  Open Google Groups
                </Button>

                <Button
                  disabled={busy !== null || Boolean(said["group"])}
                  onClick={() =>
                    void act("group", () => postJson("/api/members/group", {}))
                  }
                >
                  {busy === "group" ? "Recording…" : "I have added them"}
                </Button>
              </div>
              {said["group"] && <Note>{said["group"]}</Note>}
            </>
          )}
        </div>
      </Section>

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
