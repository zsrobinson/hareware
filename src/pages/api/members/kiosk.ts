/* `today` and `meeting` come from the page, so a refetch after midnight does
   not move the kiosk onto another meeting. */

import { env } from "cloudflare:workers";
import { BadRequest, rosterRead } from "~/lib/members/api";
import { kioskData } from "~/lib/members/views";
import { easternNow } from "~/lib/eastern";

export const prerender = false;

export const GET = rosterRead(async (request) => {
  const url = new URL(request.url);
  const today = url.searchParams.get("today") || easternNow(new Date()).date;

  if (!isDay(today)) throw new BadRequest(`${today} is not a YYYY-MM-DD day`);

  return kioskData(env, today, url.searchParams.get("meeting"));
});

/* a real calendar day: `2026-02-30` is refused, not rolled over */
function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const at = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().startsWith(value);
}
