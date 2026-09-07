import {
  AtSignIcon,
  GraduationCapIcon,
  MailIcon,
  PenLineIcon,
} from "lucide-react";
import { MemberFace } from "~/components/member-face";
import { Badge } from "~/components/ui/badge";
import type { Faces } from "~/lib/faces";
import { discordHandle, shownName, type Candidate } from "~/lib/members/kiosk";
import { plural } from "~/lib/utils";

/*
  one person, drawn either as an offer to tap or as a row already signed in.

  the two halves of the kiosk want different amounts of them. The typeahead is
  a list somebody is scanning for their own name mid-queue, so it carries a
  face, that name and how much they have written, and nothing else. Every
  detail and every edit lives on the signed-in side, where the person has
  already tapped and is looking at their own row.

  `onEdit` is what says which of the two this is. A chip is only drawn for
  something the row *has*, with one exception: where the chip is the affordance
  to supply what is missing. Nothing here deletes anything to make a chip go
  away
*/

/** the properties a chip can open a modal for */
export type EditableField = "discord" | "email" | "status";

type Props = {
  candidate: Candidate;
  faces: Faces;
  /** absent in the typeahead, which shows a name and a count and no chips */
  onEdit?: (field: EditableField) => void;
};

export function MemberEntry({ candidate, faces, onEdit }: Props) {
  const { person, contributions } = candidate;

  const credits = contributions > 0 && (
    <Badge variant="secondary">
      <PenLineIcon />
      {plural(contributions, "contribution")}
    </Badge>
  );

  return (
    <div className="flex min-w-0 items-center gap-3">
      <MemberFace
        discordId={person.discordId}
        name={person.name}
        faces={faces}
        size="default"
      />

      <div className="min-w-0 space-y-1">
        <div className="truncate font-medium">{shownName(person)}</div>

        {onEdit ? (
          <div className="flex flex-wrap items-center gap-1">
            <Chip
              icon={AtSignIcon}
              /* the linked handle: the title above is their Notion name, and a
                 snowflake tells nobody which account this is */
              label={
                discordHandle(person, faces) ??
                (person.discordId ? "Discord" : null)
              }
              missing="Add Discord"
              onEdit={() => onEdit("discord")}
            />
            <Chip
              icon={MailIcon}
              label={person.email}
              missing="Add email"
              onEdit={() => onEdit("email")}
            />
            <Chip
              icon={GraduationCapIcon}
              label={person.status}
              missing="Set status"
              onEdit={() => onEdit("status")}
            />
            {credits}
          </div>
        ) : (
          credits && <div className="flex items-center gap-1">{credits}</div>
        )}
      </div>
    </div>
  );
}

/** one property, as a chip that opens its modal */
function Chip({
  icon: Icon,
  label,
  missing,
  onEdit,
}: {
  icon: typeof AtSignIcon;
  label: string | null;
  missing: string;
  onEdit: () => void;
}) {
  return (
    <Badge
      variant={label ? "outline" : "ghost"}
      className="hover:bg-muted cursor-pointer"
      render={<button type="button" onClick={onEdit} />}
    >
      <Icon />
      {label ?? missing}
    </Badge>
  );
}
