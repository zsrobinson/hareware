import { requestCookie } from "./request-cookie";
import { seal, unseal } from "./sealed-value";

export type Session = {
  /* the key everything else hangs off, per CONTEXT.md's Member */
  discordUserId: string;
};

export const SESSION_COOKIE = "__Host-hareware-session";

export async function createSessionCookie(session: Session, secret: string) {
  const value = await seal(JSON.stringify(session), secret);
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax`;
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

    const session = JSON.parse(payload) as Partial<Session>;

    return typeof session.discordUserId === "string" && session.discordUserId
      ? { discordUserId: session.discordUserId }
      : null;
  } catch {
    return null;
  }
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
