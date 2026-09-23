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
import { discordHandle } from "~/lib/members/kiosk";
import type { Person } from "~/lib/members/records";
import { plural } from "~/lib/utils";

/** the properties a chip can open a modal for */
export type EditableField = "discord" | "email" | "status";

type Props = {
  person: Person;
  faces: Faces;
  /** makes each field a chip that opens its editor; absent, fields are plain */
  onEdit?: (field: EditableField) => void;
  /** a line under the name, for what the page knows about this row */
  note?: ReactNode;
  /** badges after the row's own */
  badges?: ReactNode;
  /** buttons belonging to this row, drawn opposite the name */
  children?: ReactNode;
};

/** one person, drawn the same way on every page that shows people */
export function MemberEntry({
  person,
  faces,
  onEdit,
  note,
  badges,
  children,
}: Props) {
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
        <div className="truncate font-medium">{person.name}</div>
        {note && <div className="text-muted-foreground text-sm">{note}</div>}

        {onEdit ? (
          <div className="flex flex-wrap items-center gap-1">
            <Chip
              icon={AtSignIcon}
              /* the handle, since a snowflake names nobody */
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
            {badges}
          </div>
        ) : (
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
            {badges}
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
