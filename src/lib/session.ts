/*
  a stateless session: the member's discord id, signed, in a cookie.

  nothing is stored server-side, which is deliberate — there is no session table
  to keep, migrate or clean up, and no read on every request. the cost is that a
  session cannot be revoked before it expires, which is bearable here because
  the thing worth revoking is not the session but the @Editorial Board role, and
  that is checked live against discord on every admin request. see ~/lib/admin
*/

import { requestCookie } from "./request-cookie";
import { seal, unseal } from "./sealed-value";

export type Session = {
  /* the key everything else hangs off, per CONTEXT.md's Member */
  discordUserId: string;
  /*
    what to call them on screen: discord's display name, falling back to the
    username. captured at sign-in rather than looked up, so every page can draw
    the member without a request to discord — the cost is that it goes stale
    until the next sign-in, which is a wrong label at worst and never a wrong
    permission, because the role is still checked live. see ~/lib/admin
  */
  displayName?: string;
  /* the @handle under it, for telling two people with one display name apart */
  username?: string;
  /* discord's avatar hash, or null for an account that has never set one */
  avatar?: string | null;
};

/** what is actually signed: the session plus when it stops being valid */
type SealedSession = Session & { expiresAt: number };

export const SESSION_COOKIE = "__Host-hareware-session";

/**
 * how long a sign-in lasts.
 *
 * a signed cookie cannot be withdrawn once issued, so its lifetime is the only
 * bound on a stolen one. a week is short enough to matter and long enough that
 * nobody signs in twice in a meeting
 */
export const SESSION_DAYS = 7;

const LIFETIME_SECONDS = SESSION_DAYS * 24 * 60 * 60;

export async function createSessionCookie(session: Session, secret: string) {
  const payload: SealedSession = {
    ...session,
    expiresAt: Date.now() + LIFETIME_SECONDS * 1000,
  };

  const value = await seal(JSON.stringify(payload), secret);

  /*
    Max-Age makes the browser drop it, and `expiresAt` inside the signature is
    what actually enforces it — a cookie the browser kept anyway is still dead
  */
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${LIFETIME_SECONDS}`;
}

export async function getSession(
  request: Request,
  secret: string,
): Promise<Session | null> {
  const value = requestCookie(request, SESSION_COOKIE);
  if (!value || !secret) return null;

  try {
    const payload = await unseal(value, secret);
    if (!payload) return null;

    const session = JSON.parse(payload) as Partial<SealedSession>;

    if (typeof session.discordUserId !== "string" || !session.discordUserId) {
      return null;
    }

    // an unexpiring session would be one signed before expiry existed
    if (
      typeof session.expiresAt !== "number" ||
      session.expiresAt < Date.now()
    ) {
      return null;
    }

    /*
      a cookie signed before these existed is still a valid session — it just
      has nobody's name in it, and the ui falls back to the id
    */
    return {
      discordUserId: session.discordUserId,
      displayName: text(session.displayName),
      username: text(session.username),
      avatar: text(session.avatar) ?? null,
    };
  } catch {
    return null;
  }
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** a string field from a cookie that may predate it, or may be junk */
function text(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

/**
 * where to fetch a member's avatar, at the size the sidebar draws it.
 *
 * an account with no avatar gets one of discord's defaults, chosen from the id
 * the way discord chooses it, so the fallback still differs person to person
 */
export function avatarUrl(session: Session, size = 64) {
  if (!session.avatar) {
    const index = Number((BigInt(session.discordUserId) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }

  // animated avatars are the ones whose hash is prefixed, and only as gif
  const extension = session.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${session.discordUserId}/${session.avatar}.${extension}?size=${size}`;
}
