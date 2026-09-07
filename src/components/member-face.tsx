import { GhostIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import type { Faces } from "~/lib/faces";

/* the ghost is a statement, not a placeholder: the row it marks is one nothing
   can link to an application, so it is the row a duplicate hides in */
export function GhostKey() {
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <GhostIcon className="size-3.5" />
      No Discord account linked
    </p>
  );
}

export function MemberFace({
  discordId,
  name,
  faces,
  size = "sm",
}: {
  discordId: string | null;
  name: string;
  faces: Faces;
  size?: "sm" | "default";
}) {
  const face = discordId ? faces[discordId] : undefined;

  if (!face) {
    return (
      <Avatar size={size}>
        <AvatarFallback aria-label={`${name} has no Discord account linked`}>
          <GhostIcon className="size-3.5" />
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <Avatar size={size}>
      <AvatarImage
        src={face.avatarUrl}
        alt={`${face.displayName} on Discord`}
      />
      <AvatarFallback aria-hidden>
        <GhostIcon className="size-3.5" />
      </AvatarFallback>
    </Avatar>
  );
}
