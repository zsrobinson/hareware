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
    discordUserId: session.discordUserId,
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

    return { discordUserId: session.discordUserId };
  } catch {
    return null;
  }
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
