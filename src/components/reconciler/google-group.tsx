import { AlertTriangleIcon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "~/components/copy-button";
import { MemberEntry } from "~/components/member-entry";
import { Cleared, Section } from "./section";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import type { Faces } from "~/lib/faces";
import {
  compareToGroup,
  emailsInExport,
  GROUP_MEMBERS_URL,
  isExternalAddress,
} from "~/lib/members/group";
import type { Person } from "~/lib/members/records";
import { errorMessage, plural } from "~/lib/utils";

/** the roster against an export of the Google Group's members */
export function GoogleGroup({
  roster,
  faces,
}: {
  roster: Person[];
  faces: Faces;
}) {
  /* the Google Group export. It is every member's address, so it never
     leaves the browser */
  const [inGroup, setInGroup] = useState<Set<string> | null>(null);
  const [exportName, setExportName] = useState<string | null>(null);

  const diff = inGroup ? compareToGroup(roster, inGroup) : null;
  const emails = (diff?.missing ?? [])
    .map((person) => person.email)
    .filter((email): email is string => Boolean(email));
  /* the group's bulk-add field takes commas */
  const blob = emails.join(", ");
  /* google does not auto-add these, so they are flagged */
  const external = emails.filter((email) => isExternalAddress(email));

  return (
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
            {diff.unreachable.length === 1 ? "has" : "have"} no address at all,
            so nothing below can reach them and no paste will fix it. They are
            listed under Missing email field.
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
            {plural(diff.strangers.length, "address", "addresses")} in the group
            match nobody on the roster. Alumni, mostly, though a typo in a
            Notion email looks the same from here.
          </p>
        )}
      </div>
    </Section>
  );
}
