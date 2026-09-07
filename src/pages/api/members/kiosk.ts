/*
  the kiosk's own roster, re-read after somebody was created or corrected.

  the same shape `/attendance` hands the island as `initialData`, from the same
  function, so arriving at the page costs no second request and a refetch
  cannot disagree with what was server-rendered.

  `today` and `meeting` are carried as search params rather than recomputed
  here. The kiosk is a laptop left open through an evening, and a refetch that
  worked out "today" for itself would roll the meeting select forward past
  midnight, onto a meeting nobody in the room is at.
*/

import { env } from "cloudflare:workers";
import { rosterRead } from "~/lib/members/api";
import { kioskData } from "~/lib/members/views";
import { easternNow } from "~/lib/eastern";

export const prerender = false;

export const GET = rosterRead(async (request) => {
  const url = new URL(request.url);

  return kioskData(
    env,
    url.searchParams.get("today") || easternNow(new Date()).date,
    url.searchParams.get("meeting"),
  );
});
