import type { APIRoute } from "astro";
import { viewer } from "~/lib/admin";
import {
  mutateProfile,
  type ProfileIntent,
} from "~/lib/members/profile-mutation";
import { readProfilePayload } from "~/lib/members/profile";
import {
  profileMutationDependencies,
  profileReadDependencies,
} from "~/lib/members/profile-runtime";
import { parseProfileLocation } from "~/lib/members/profile-query-keys";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });

export const GET: APIRoute = async ({ request }) => {
  const who = await viewer(request);
  if (!who?.profile)
    return json({ error: who ? who.denial : "signed-out" }, 401);
  try {
    const url = new URL(request.url);
    const parsed = parseProfileLocation(url.searchParams);
    if (!parsed.valid) return json({ error: "invalid date range" }, 400);
    if (parsed.location.member && !who.admin)
      return json({ error: "only editors may select a Member" }, 403);
    return json(
      await readProfilePayload(profileReadDependencies(), {
        actorDiscordId: who.session.discordUserId,
        actorDisplayName: who.profile.displayName,
        actorNickname: who.profile.discordNickname,
        editor: who.admin,
        selectedPageId: parsed.location.member,
        from: parsed.location.from,
        to: parsed.location.to,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const who = await viewer(request);
  if (!who?.profile)
    return json({ error: who ? who.denial : "signed-out" }, 401);
  try {
    const intent = parseIntent(await request.json());
    if ("selectedPageId" in intent && intent.selectedPageId && !who.admin)
      return json({ error: "only editors may select a Member" }, 403);
    return json({
      ok: true,
      ...(await mutateProfile(
        profileMutationDependencies(),
        {
          discordId: who.session.discordUserId,
          editor: who.admin,
        },
        intent,
      )),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, error instanceof BadIntent ? 400 : 500);
  }
};

class BadIntent extends Error {}

function required(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim())
    throw new BadIntent(`${field} is required`);
  return value.trim();
}

function parseIntent(input: unknown): ProfileIntent {
  if (!input || typeof input !== "object")
    throw new BadIntent("action is required");
  const body = input as Record<string, unknown>;
  const action = required(body, "action");
  if (action === "create") {
    const email = required(body, "email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new BadIntent("email is invalid");
    return {
      action,
      name: required(body, "name"),
      email,
      status: required(body, "status"),
    };
  }
  if (!["name", "email", "status", "nickname"].includes(action))
    throw new BadIntent("unknown profile action");
  const selectedPageId =
    typeof body.selectedPageId === "string" && body.selectedPageId
      ? body.selectedPageId
      : undefined;
  const value = required(body, "value");
  if (action === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    throw new BadIntent("email is invalid");
  return {
    action: action as "name" | "email" | "status" | "nickname",
    value,
    selectedPageId,
  };
}
