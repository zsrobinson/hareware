import { AlertTriangleIcon } from "lucide-react";
import { useState } from "react";
import { MemberEntry } from "~/components/member-entry";
import { Note, Section, type Writes } from "./section";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import type { Faces } from "~/lib/faces";
import { SURE, WHY_ALIKE, type Duplicate } from "~/lib/members/match";
import type { Person } from "~/lib/members/records";
import { postJson } from "~/lib/post-json";

export function Duplicates({
  duplicates,
  faces,
  writes: { busy, said, act },
}: {
  duplicates: Duplicate[];
  faces: Faces;
  writes: Writes;
}) {
  const [merging, setMerging] = useState<{
    keep: Person;
    drop: Person;
  } | null>(null);

  return (
    <>
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
              name. <strong>{merging?.drop.name}</strong> (
              {merging?.drop.email ?? "no email"}) will have its articles,
              images and attendance moved across, along with any status, email
              or Discord account the survivor lacks, and will then be put in
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
    </>
  );
}
