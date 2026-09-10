/*
  everything the reconciler shows, re-read after a link, a merge or a status.

  the same shape `/reconciler` hands the island as `initialData`, from the same
  function. Refetching after each of those is the point: every one of them
  changes what the *other* sections should say — linking an application can
  resolve a duplicate, and merging two rows removes an entry from the list of
  members with no status — and a page that only crossed off the row just acted
  on was the reason an editor had to reload.
*/

import { env } from "cloudflare:workers";
import { rosterRead } from "~/lib/members/api";
import { reconcilerData } from "~/lib/members/views";

export const prerender = false;

export const GET = rosterRead(() => reconcilerData(env));
