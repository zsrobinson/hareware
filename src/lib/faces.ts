/*
  the discord picture beside a name.

  one request for the whole guild, then a lookup per id, so a page of avatars
  costs the same as a page with one. an id that does not come back is drawn as
  a ghost, and a member who left, a bot token that expired and a row with no
  discord id are all that same ghost: none of them has a picture, and none of
  them may take the page down.
*/

import { guildMembers, type Profile } from "./member";

/** what a face needs to draw. the url is discord's cdn, never proxied here */
export type Face = { avatarUrl: string; displayName: string };

/** ids to faces, keyed by discord user id */
export type Faces = Record<string, Face>;

export async function faces(
  userIds: (string | null | undefined)[],
  load: () => Promise<Map<string, Profile>> = guildMembers,
): Promise<Faces> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return {};

  const guild = await load();
  const found: Faces = {};

  for (const id of ids) {
    const profile = guild.get(id);
    if (profile) {
      found[id] = {
        avatarUrl: profile.avatarUrl,
        displayName: profile.displayName,
      };
    }
  }

  return found;
}
