import { env } from "cloudflare:workers";
import { rosterRead } from "~/lib/members/api";
import { reconcilerData } from "~/lib/members/views";

export const prerender = false;

export const GET = rosterRead(() => reconcilerData(env));
