import { GhostIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import type { Faces } from "~/lib/faces";
import { initials } from "~/lib/members/kiosk";

/** the discord picture, else initials, else a ghost when there is no name */
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
  const letters = initials(name);

  const fallback = letters ? (
    <AvatarFallback>{letters}</AvatarFallback>
  ) : (
    <AvatarFallback aria-label="nobody this could be drawn as">
      <GhostIcon className="size-3.5" />
    </AvatarFallback>
  );

  if (!face) return <Avatar size={size}>{fallback}</Avatar>;

  return (
    <Avatar size={size}>
      <AvatarImage
        src={face.avatarUrl}
        alt={`${face.displayName} on Discord`}
      />
      {fallback}
    </Avatar>
  );
}
