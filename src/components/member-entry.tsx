import {
  AtSignIcon,
  GraduationCapIcon,
  MailIcon,
  PenLineIcon,
  PencilIcon,
} from "lucide-react";
import { MemberFace } from "~/components/member-face";
import { Badge } from "~/components/ui/badge";
import type { Faces } from "~/lib/faces";
import type { Candidate } from "~/lib/members/kiosk";
import { plural } from "~/lib/utils";

/*
  one person, drawn the same way on both halves of the kiosk.

  the left column edits and the right column does not, and that is the only
  difference — a second component for the signed-in list is how the two drifted
  the last time, with an "add email" affordance on one side and nothing on the
  other for the same missing field.

  a chip is only drawn for something the row *has*, with one exception: where
  the chip is the affordance to supply what is missing, which exists only on
  the editable side. Nothing here deletes anything to make a chip go away
*/

/** the properties a chip can open a modal for */
export type EditableField = "discord" | "email" | "status";

type Props = {
  candidate: Candidate;
  faces: Faces;
  /** absent on the read-only side, where the same chips are plain labels */
  onEdit?: (field: EditableField) => void;
};

export function MemberEntry({ candidate, faces, onEdit }: Props) {
  const { person, contributions } = candidate;
  const face = person.discordId ? faces[person.discordId] : undefined;
  const domain = person.email?.split("@")[1];

  return (
    <div className="flex min-w-0 items-center gap-3">
      <MemberFace
        discordId={person.discordId}
        name={person.name}
        faces={faces}
        size="default"
      />

      <div className="min-w-0 space-y-1">
        <div className="truncate font-medium">{person.name}</div>

        <div className="flex flex-wrap items-center gap-1">
          <Chip
            icon={AtSignIcon}
            /* the server nickname where we have it: it is what the room calls
               each other, and a snowflake tells nobody anything */
            label={face?.displayName ?? (person.discordId ? "Discord" : null)}
            missing="Add Discord"
            onEdit={onEdit && (() => onEdit("discord"))}
          />
          <Chip
            icon={MailIcon}
            /* the domain and not the address: this screen faces a room, and
               the terpmail/gmail split is the whole of what it has to separate */
            label={domain ? `@${domain}` : null}
            missing="Add email"
            onEdit={onEdit && (() => onEdit("email"))}
          />
          <Chip
            icon={GraduationCapIcon}
            label={person.status}
            missing="Set status"
            onEdit={onEdit && (() => onEdit("status"))}
          />
          {contributions > 0 && (
            <Badge variant="secondary">
              <PenLineIcon />
              {plural(contributions, "contribution")}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * one property, as a chip.
 *
 * a value nobody may edit and no value at all render as nothing: a row of
 * chips reading "no email on file · no status" is noise on a screen a queue is
 * standing in front of, and the reconciler is where absences get worked
 */
function Chip({
  icon: Icon,
  label,
  missing,
  onEdit,
}: {
  icon: typeof AtSignIcon;
  label: string | null;
  missing: string;
  onEdit?: () => void;
}) {
  if (!onEdit) {
    return label ? (
      <Badge variant="outline">
        <Icon />
        {label}
      </Badge>
    ) : null;
  }

  return (
    <Badge
      variant={label ? "outline" : "ghost"}
      className="hover:bg-muted cursor-pointer"
      render={
        <button
          type="button"
          onClick={(event) => {
            /* the whole row signs somebody in, so a chip has to stop the click
               before it reaches the row it is sitting in */
            event.stopPropagation();
            onEdit();
          }}
        />
      }
    >
      <Icon />
      {label ?? missing}
      <PencilIcon className="opacity-60" />
    </Badge>
  );
}
