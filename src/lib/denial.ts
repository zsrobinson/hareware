/*
  The four refusals and everything that differs between them, in one table, so
  a denial added to the type cannot fall through a branch somewhere and pick up
  another's button. Imports nothing: the guard reads it to set a status.
*/

/**
 * Why somebody may not see the admin tools. Separate because a member acts on
 * each differently, and because a Discord outage must not read as a refusal.
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

/** The one thing this member can do about it. */
export type Action =
  | "sign-in"
  | "retry"
  | "switch-account"
  /** nothing they can do from here, so point at what they can use */
  | "leave";

export type DenialCopy = {
  status: number;
  title: string;
  /** `you` is their handle, or "This account" when Discord gave us no name */
  body: (you: string) => string;
  action: Action;
};

export const DENIALS: Record<Denial, DenialCopy> = {
  "signed-out": {
    status: 401,
    title: "Sign in to continue",
    body: () => "This tool is for the Editorial Board.",
    action: "sign-in",
  },

  "no-role": {
    /* it does not say how to get the role: the board is the board, and
       offering a way to ask reads as though it were a favour */
    status: 403,
    title: "This tool is for the Editorial Board",
    body: (you) => `You are signed in as ${you}, who is not on the board.`,
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
    body: () => "Discord did not answer. Try again in a moment.",
    action: "retry",
  },
};
