import { GhostIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import type { Faces } from "~/lib/faces";
import { initials } from "~/lib/members/kiosk";

/**
 * the discord picture beside a name, or the initials of that name.
 *
 * the ghost is left for the row there is no name to draw either — an actor id
 * the guild lookup could not resolve. A member of the roster always has a
 * name, so on the kiosk this is always initials, which read as a person where
 * a row of identical ghosts read as a fault
 */
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
