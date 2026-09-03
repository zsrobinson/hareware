import { useEffect, useState } from "react";

/*
  who is signed in, shared by the two islands that care: the editorial nav at
  the top of the sidebar and the account panel at the bottom. they would
  otherwise each ask /api/session.json and could disagree, and the mock sign-in
  below would only move one of them.

  #19 replaces the fetch with the real discord session and mockSignIn with an
  oauth redirect. everything else here stays.
*/
let signedIn: boolean | null = null;
let asked = false;

const listeners = new Set<(value: boolean) => void>();

function announce() {
  for (const listener of listeners) listener(signedIn === true);
}

/* stands in for the oauth round trip, so the signed-in shell can be walked
   through before there is anything to sign in to */
export function mockSignIn(value: boolean) {
  signedIn = value;
  announce();
}

function ask() {
  if (asked) return;
  asked = true;

  fetch("/api/session.json")
    .then((r) => (r.ok ? r.json() : { signedIn: false }))
    .then((d) => mockSignIn(Boolean(d.signedIn)))
    .catch(() => mockSignIn(false));
}

export function useSignedIn(knownByServer = false) {
  const [value, setValue] = useState(knownByServer || signedIn === true);

  useEffect(() => {
    /* a page the cdn does not cache already rendered the answer, so there is
       nothing to ask for */
    if (knownByServer) {
      signedIn = true;
      asked = true;
    }

    const listener = (next: boolean) => setValue(next);
    listeners.add(listener);

    if (signedIn === null) ask();
    else setValue(signedIn);

    return () => {
      listeners.delete(listener);
    };
  }, [knownByServer]);

  return value;
}
