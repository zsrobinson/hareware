/* The member's Discord id, signed, in a cookie. Nothing is stored (ADR 0008). */

import { requestCookie } from "./request-cookie";
import { seal, unseal } from "./sealed-value";

export type Session = {
  discordUserId: string;
};

type SealedSession = Session & { expiresAt: number };

export const SESSION_COOKIE = "__Host-hareware-session";

/**
 * a signed cookie cannot be revoked, so this is the only bound on a stolen one
 */
const SESSION_DAYS = 7;

const LIFETIME_SECONDS = SESSION_DAYS * 24 * 60 * 60;

export async function createSessionCookie(session: Session, secret: string) {
  const payload: SealedSession = {
    discordUserId: session.discordUserId,
    expiresAt: Date.now() + LIFETIME_SECONDS * 1000,
  };

  const value = await seal(JSON.stringify(payload), secret, "session");

  /* `expiresAt`, inside the signature, is what enforces it */
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${LIFETIME_SECONDS}`;
}

export async function getSession(
  request: Request,
  secret: string,
): Promise<Session | null> {
  const value = requestCookie(request, SESSION_COOKIE);
  if (!value || !secret) return null;

  try {
    const payload = await unseal(value, secret, "session");
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
