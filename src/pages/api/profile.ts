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

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });

function date(value: string | null): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("invalid date range");
  }
  return value;
}

export const GET: APIRoute = async ({ request }) => {
  const who = await viewer(request);
  if (!who?.profile)
    return json({ error: who ? who.denial : "signed-out" }, 401);
  try {
    const url = new URL(request.url);
    const from = date(url.searchParams.get("from"));
    const to = date(url.searchParams.get("to"));
    if (from && to && from > to)
      return json({ error: "invalid date range" }, 400);
    return json(
      await readProfilePayload(profileReadDependencies(), {
        actorDiscordId: who.session.discordUserId,
        actorDisplayName: who.profile.displayName,
        actorNickname: who.profile.discordNickname,
        editor: who.admin,
        selectedPageId: url.searchParams.get("member") ?? undefined,
        from,
        to,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(
      { error: message },
      message === "invalid date range" ? 400 : 500,
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  const who = await viewer(request);
  if (!who?.profile)
    return json({ error: who ? who.denial : "signed-out" }, 401);
  try {
    const intent = parseIntent(await request.json());
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
