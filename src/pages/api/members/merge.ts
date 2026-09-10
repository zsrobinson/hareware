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

import { env } from "cloudflare:workers";
import { BadRequest, requireText, rosterRoute } from "~/lib/members/api";
import { duplicates } from "~/lib/members/match";
import { people } from "~/lib/members/roster";
import { mergeMembers } from "~/lib/members/write";

export const prerender = false;

export const POST = rosterRoute(
  (body) => {
    const keepId = requireText(body, "keepId");
    const dropId = requireText(body, "dropId");

    /* `mergeMembers` returns quietly on this, which is right for a library and
       wrong for a button: an editor who managed to send it deserves to be told
       nothing happened rather than shown a success */
    if (keepId === dropId) {
      throw new BadRequest("a row cannot be merged into itself");
    }

    return { keepId, dropId, keepName: requireText(body, "keepName") };
  },
  async ({ keepId, dropId, keepName }) => {
    const pair = new Set([keepId, dropId]);
    const stillDuplicate = duplicates(await people(env.NOTION_TOKEN!)).some(
      (duplicate) =>
        [...pair].every((id) =>
          duplicate.people.some((person) => person.pageId === id),
        ),
    );

    if (!stillDuplicate) {
      throw new BadRequest(
        "those rows are no longer a detected duplicate pair; refresh the reconciler before merging",
      );
    }

    await mergeMembers(env, keepId, dropId);

    return {
      /* the name is carried in the body only so the log line can say who this
         was about — the page knows it, and re-reading notion to recover a
         string for a log entry would be a request spent on prose */
      summary: `merged a duplicate Members row into ${keepName}`,
      data: { keepId, dropId },
    };
  },
);
