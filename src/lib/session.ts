export type Session = {
  /* the key everything else hangs off, per CONTEXT.md's Member */
  discordUserId: string;
};

const DEV_COOKIE = "hw-dev-session";

/*
  the one place that answers "who is this". #19 fills it in with the discord
  oauth session; until then it says nobody, so the shell renders signed out.

  in dev, `document.cookie = "hw-dev-session=1"` reloads as a signed-in member,
  which is the only way to look at the editorial half of the sidebar before
  there is anything to sign in to
*/
export function getSession(request: Request): Session | null {
  if (import.meta.env.DEV) {
    const cookies = request.headers.get("cookie") ?? "";
    if (cookies.split(";").some((c) => c.trim().startsWith(`${DEV_COOKIE}=`))) {
      return { discordUserId: "dev" };
    }
  }

  return null;
}
