/*
  folding one duplicate Members row into another.

  the only destructive write in the feature, and the only one that cannot be
  undone from the interface: the losing row goes to notion's trash and its
  relations are carried across first. `mergeMembers` re-reads both rows before
  it writes for exactly that reason, so nothing here passes it anything it
  read from the browser except the two ids.

  the confirmation is the page's job, not this route's, and it is not a
  formality — ADR 0010 asks the person to say which row survives, because the
  survivor keeps its own name and status and gains only what the other had that
  it lacked.
*/

import { BadRequest, requirePageId, rosterRoute } from "~/lib/members/api";
import { duplicates } from "~/lib/members/match";
import { people } from "~/lib/members/roster";
import { mergeMembers } from "~/lib/members/write";

export const prerender = false;

export const POST = rosterRoute(
  (body) => {
    const keepId = requirePageId(body, "keepId");
    const dropId = requirePageId(body, "dropId");

    /* `mergeMembers` returns quietly on this, which is right for a library and
       wrong for a button: an editor who managed to send it deserves to be told
       nothing happened rather than shown a success */
    if (keepId === dropId) {
      throw new BadRequest("a row cannot be merged into itself");
    }

    return { keepId, dropId };
  },
  async ({ keepId, dropId }, tokens) => {
    const roster = await people(tokens.notion);
    const pair = duplicates(roster).find((duplicate) =>
      [keepId, dropId].every((id) =>
        duplicate.people.some((person) => person.pageId === id),
      ),
    );

    if (!pair) {
      throw new BadRequest(
        "those rows are no longer a detected duplicate pair; refresh the reconciler before merging",
      );
    }

    const name = (id: string) =>
      pair.people.find((person) => person.pageId === id)!.name;

    await mergeMembers(tokens.notion, keepId, dropId);

    return {
      summary: `merged ${name(dropId)}'s duplicate Members row into ${name(keepId)}`,
      data: { keepId, dropId },
    };
  },
);
