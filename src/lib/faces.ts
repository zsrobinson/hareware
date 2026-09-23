/*
  discord profiles for a page's ids, from one guild read. An id that does not
  resolve, for whatever reason, has no entry and is drawn without a picture.
*/

import { guildMembers, type Profile } from "./member";

/** profiles keyed by discord user id; the url is discord's cdn, never proxied */
export type Faces = Record<string, Profile>;

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
    if (profile) found[id] = profile;
  }

  return found;
}
