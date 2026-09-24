import { AtSignIcon, GraduationCapIcon, MailIcon } from "lucide-react";
import { MemberEntry } from "~/components/member-entry";
import { NewMemberForm, type NewMember } from "~/components/new-member-form";
import { Note, Section, type Said, type Writes } from "./section";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import type { Faces } from "~/lib/faces";
import type { Application } from "~/lib/members/applications";
import { WHY_UNDECIDED, type Resolution } from "~/lib/members/match";
import type { Person } from "~/lib/members/records";
import { postJson } from "~/lib/post-json";

export function Applicants({
  resolutions,
  statuses,
  faces,
  writes: { busy, said, act },
}: {
  resolutions: Resolution[];
  statuses: string[];
  faces: Faces;
  writes: Writes;
}) {
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

  return (
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
