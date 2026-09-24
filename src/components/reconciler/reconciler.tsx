import { useState } from "react";
import {
  MemberEditDialog,
  type Editing,
} from "~/components/member-edit-dialog";
import { AlumMissing, Problem } from "~/components/problem";
import { usePatch, useRefresh, useRosterQuery } from "~/lib/members/queries";
import { rosterKeys } from "~/lib/members/query-keys";
import type { Person } from "~/lib/members/records";
import { RosterQueries } from "~/lib/members/roster-queries";
import type { ReconcilerData } from "~/lib/members/views";
import { Applicants } from "./applicants";
import { Duplicates } from "./duplicates";
import { EmailProblems } from "./email-problems";
import { GoogleGroup } from "./google-group";
import { MissingDiscord } from "./missing-discord";
import { MissingStatus } from "./missing-status";
import { useWrites } from "./section";

/*
  every roster decision the unattended sync declined to make, for a person to
  make before a vote. Nothing here acts on a guess; ADR 0010 has why.
*/

type Props = {
  /** the page's server-side read; `/api/members/reconciler` answers the same */
  initial: ReconcilerData;
};

export function Reconciler({ initial }: Props) {
  return (
    <RosterQueries>
      <Sections initial={initial} />
    </RosterQueries>
  );
}

function Sections({ initial }: Props) {
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
    faces,
  } = useRosterQuery(
    rosterKeys.reconciler(),
    "/api/members/reconciler",
    initial,
  ).data;

  /* every write re-reads the whole page: a link or a merge changes what the
     other sections say */
  const refresh = useRefresh(rosterKeys.reconciler());
  const writes = useWrites(refresh);

  /* an edited row is patched in at once, then re-read with the rest */
  const patch = usePatch<ReconcilerData>(rosterKeys.reconciler());
  const [editing, setEditing] = useState<Editing | null>(null);

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

      <Applicants
        resolutions={resolutions}
        statuses={statuses}
        faces={faces}
        writes={writes}
      />
      <Duplicates duplicates={duplicates} faces={faces} writes={writes} />
      <MissingStatus
        unknownStatus={unknownStatus}
        statuses={statuses}
        faces={faces}
        writes={writes}
      />
      <MissingDiscord
        roster={roster}
        discordSuggestions={discordSuggestions}
        faces={faces}
        writes={writes}
        onEdit={setEditing}
      />
      <EmailProblems roster={roster} faces={faces} onEdit={setEditing} />
      <GoogleGroup roster={roster} faces={faces} />

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
    </div>
  );
}
