/*
  the discord users behind the log's `actor` column.

  the column stores an id, because an id is the only thing about a member this
  app keeps — ADR 0008. a page that shows the id has recorded who did something
  and told nobody: reading a log is recognising the people in it, and
  `472…931` is not a person. so the names and avatars are resolved live, from
  the same lookup the admin check makes, and nothing is written down
*/

import { guildMember, type Profile } from "./member";

/** discord ids to profiles, holding only the ids that resolved */
export type Directory = Record<string, Profile>;

/*
  one request per distinct actor, and a page of 500 rows is a handful of them.
  the cap is there so a log that somehow names hundreds cannot turn one page
  view into hundreds of calls to discord — past it the ui falls back to the id,
  which is what it does for somebody who has left the server anyway
*/
const MOST = 25;

/** profiles for the actors named in these rows, in one pass */
export async function directory(actors: (string | null)[]): Promise<Directory> {
  const ids = [...new Set(actors.filter((id): id is string => !!id))].slice(
    0,
    MOST,
  );

  const found = await Promise.all(
    ids.map(async (id) => [id, (await guildMember(id))?.profile] as const),
  );

  return Object.fromEntries(
    found.filter((entry): entry is [string, Profile] => !!entry[1]),
  );
}
