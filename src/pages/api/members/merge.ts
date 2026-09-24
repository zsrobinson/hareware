/* folds one duplicate row into another, only while the fresh roster still
   groups the pair. The page confirms which row survives. */

import { BadRequest, requirePageId, rosterRoute } from "~/lib/members/api";
import { duplicates } from "~/lib/members/match";
import { people } from "~/lib/members/roster";
import { mergeMembers } from "~/lib/members/write";

export const prerender = false;

export const POST = rosterRoute(
  (body) => {
    const keepId = requirePageId(body, "keepId");
    const dropId = requirePageId(body, "dropId");

    /* `mergeMembers` returns quietly on this; a button should say so */
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
