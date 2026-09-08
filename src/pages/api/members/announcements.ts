/*
  recording that somebody does not want the announcements.

  the group comparison works by diffing an export against the roster, and that
  cannot see an intention: a person who left the group on purpose looks exactly
  like a person who was never added, so every comparison would offer to add
  them back and one paste would do it. Undoing somebody's decision about their
  own inbox, quietly, once a semester.

  so the roster carries the answer. This route is the button beside their name
  on the reconciler, pressed by the editor who noticed — usually because the
  person said so, or because they keep reappearing in the list.

  reversible on purpose. The same button unticks it, because somebody who asks
  to be added back is the other half of the same conversation.
*/

import { env } from "cloudflare:workers";
import { requireFlag, requireText, rosterRoute } from "~/lib/members/api";
import { updateMember } from "~/lib/members/write";

export const prerender = false;

export const POST = rosterRoute(
  (body) => ({
    pageId: requireText(body, "pageId"),
    name: requireText(body, "name"),
    /* required rather than defaulted: false is the answer that puts somebody
       back on a mailing list, and it should never be reached by omission */
    noAnnouncements: requireFlag(body, "noAnnouncements"),
  }),
  async ({ pageId, name, noAnnouncements }) => {
    await updateMember(env, pageId, { noAnnouncements });

    return {
      summary: noAnnouncements
        ? `${name} will not be offered for the announcements group again`
        : `${name} can be added to the announcements group again`,
      data: { pageId, noAnnouncements },
    };
  },
);
