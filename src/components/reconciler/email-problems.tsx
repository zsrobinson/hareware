import type { Editing } from "~/components/member-edit-dialog";
import { MemberEntry } from "~/components/member-entry";
import { Section } from "./section";
import type { Faces } from "~/lib/faces";
import {
  emailProblem,
  emailProblems,
  identifiesNobody,
} from "~/lib/members/group";
import type { Person } from "~/lib/members/records";

/** the two email sections: no address at all, and not a university one */
export function EmailProblems({
  roster,
  faces,
  onEdit,
}: {
  roster: Person[];
  faces: Faces;
  onEdit: (editing: Editing) => void;
}) {
  const { missing, wrongDomain } = emailProblems(roster);

  return (
    <>
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
                onEdit={(field) => onEdit({ field, person })}
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
                onEdit={(field) => onEdit({ field, person })}
              />
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
