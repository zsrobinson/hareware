import {
  AtSignIcon,
  GraduationCapIcon,
  MailIcon,
  PenLineIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { MemberFace } from "~/components/member-face";
import { Badge } from "~/components/ui/badge";
import type { Faces } from "~/lib/faces";
import { discordHandle, shownName } from "~/lib/members/kiosk";
import type { Person } from "~/lib/members/records";
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
  person: Person;
  faces: Faces;
  /** absent in the typeahead, which shows a name and a count and no chips */
  onEdit?: (field: EditableField) => void;
  /**
   * a line under the name, where the caller has something to say about *this*
   * row that the row itself does not carry — which account it looks like, why
   * it is being offered. Chips are what the row knows; this is what the page
   * knows about it
   */
  note?: ReactNode;
  /** buttons belonging to this row, drawn opposite the name */
  children?: ReactNode;
};

/**
 * one person, drawn the same way wherever people are drawn.
 *
 * three pages show people, and each had grown its own spelling of it: the
 * kiosk with a face and chips, the reconciler with a bold name and a
 * middle-dot line of fields, the standing table with a name in one column and
 * an email in another. Three answers to "who is this" that a reader has to
 * learn separately, and only one of them showed a face
 */
export function MemberEntry({ person, faces, onEdit, note, children }: Props) {
  const credits = person.contributions > 0 && (
    <Badge variant="secondary">
      <PenLineIcon />
      {plural(person.contributions, "contribution")}
    </Badge>
  );

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <MemberFace
        discordId={person.discordId}
        name={person.name}
        faces={faces}
        size="default"
      />

      <div className="min-w-0 flex-1 space-y-1">
        <div className="truncate font-medium">{shownName(person)}</div>
        {note && <div className="text-muted-foreground text-sm">{note}</div>}

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
          /* no `onEdit` means a list somebody is scanning rather than a row
             they have arrived at: their own fields, but nothing to press */
          <div className="flex flex-wrap items-center gap-1">
            {person.email && (
              <Badge variant="outline">
                <MailIcon />
                {person.email}
              </Badge>
            )}
            {person.status && (
              <Badge variant="outline">
                <GraduationCapIcon />
                {person.status}
              </Badge>
            )}
            {credits}
          </div>
        )}
      </div>

      {children && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
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
