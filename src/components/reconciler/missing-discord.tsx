import type { Editing } from "~/components/member-edit-dialog";
import { MemberEntry } from "~/components/member-entry";
import { MemberFace } from "~/components/member-face";
import { Note, Section, type Writes } from "./section";
import { Button } from "~/components/ui/button";
import type { Faces } from "~/lib/faces";
import type { DiscordSuggestion } from "~/lib/members/match";
import type { Person } from "~/lib/members/records";
import { postJson } from "~/lib/post-json";

export function MissingDiscord({
  roster,
  discordSuggestions,
  faces,
  writes: { busy, said, act },
  onEdit,
}: {
  roster: Person[];
  discordSuggestions: DiscordSuggestion[];
  faces: Faces;
  writes: Writes;
  onEdit: (editing: Editing) => void;
}) {
  const unlinked = roster
    .filter((person) => !person.discordId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const suggestedFor = new Map(
    discordSuggestions.map((one) => [one.person.pageId, one.account]),
  );

  return (
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
                onEdit={(field) => onEdit({ field, person })}
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
  );
}
