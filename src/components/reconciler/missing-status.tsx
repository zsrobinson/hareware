import { MemberEntry } from "~/components/member-entry";
import { Note, Section, type Writes } from "./section";
import { StatusPicker } from "~/components/status-picker";
import type { Faces } from "~/lib/faces";
import type { Person } from "~/lib/members/records";
import { postJson } from "~/lib/post-json";

export function MissingStatus({
  unknownStatus,
  statuses,
  faces,
  writes: { busy, said, act },
}: {
  unknownStatus: Person[];
  statuses: string[];
  faces: Faces;
  writes: Writes;
}) {
  return (
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
  );
}
