/*
  the four ways of not being allowed into the admin tools, and everything that
  differs between them, in one table.

  they were spread over three places for a while: the status map here, a copy
  map in the refusal component, and a cascade in the same file choosing which
  button to draw. three exhaustive lists is two too many — the cascade was the
  dangerous one, because a fifth denial added to the type would have fallen
  through it silently to whatever the last branch happened to be, while the
  other two would at least have failed to compile.

  a denial that needs a new field adds it here and the component reads it. a
  denial that needs a new *shape* of action adds a variant to `Action`, which
  is a value rather than a branch, so the component keeps rendering data.

  no runtime dependencies on purpose: `~/lib/admin-guard` is in the module
  graph of every route, and this is what it reads to set a status
*/

/**
 * why somebody may not see the admin tools.
 *
 * they are separate because a member acts on each differently: sign in, ask
 * for the role, join the server, or come back in a minute. collapsing them is
 * what made a discord outage tell a board member their page did not exist
 */
export type Denial =
  /** no session cookie, or one that has expired */
  | "signed-out"
  /** signed in, in the server, without @Editorial Board */
  | "no-role"
  /** signed in, but not a member of the guild at all */
  | "not-in-server"
  /** discord did not answer, so we do not know either way */
  | "unreachable";

/** the one thing this member can do about it, as data rather than a branch */
export type Action =
  /** start discord oauth, coming back to where they were */
  | "sign-in"
  /** reload what they asked for; nothing is wrong with them */
  | "retry"
  /** sign out, so they can sign in as somebody else */
  | "switch-account"
  /** nothing they can do from here, so point at what they can use */
  | "leave";

export type DenialCopy = {
  /** what a browser is told, and what `curl -i` shows */
  status: number;
  title: string;
  /** `you` is their handle, or "this account" when discord gave us no name */
  body: (you: string) => string;
  action: Action;
};

export const DENIALS: Record<Denial, DenialCopy> = {
  "signed-out": {
    status: 401,
    title: "Sign in to use this",
    body: () => "This tool is for the Editorial Board.",
    action: "sign-in",
  },

  "no-role": {
    status: 403,
    title: "You need the Editorial Board role",
    body: (you) =>
      `You are signed in as ${you}. Ask an editor to add the role — it works ` +
      "the moment they do.",
    action: "leave",
  },

  "not-in-server": {
    status: 403,
    title: "Wrong account",
    body: (you) => `${you} is not in The Hare's Discord.`,
    action: "switch-account",
  },

  unreachable: {
    /* not 500: nothing here is broken, and a retry is the right advice */
    status: 503,
    title: "Could not check your access",
    body: () => "Discord did not answer. Nothing is wrong with your account.",
    action: "retry",
  },
};
