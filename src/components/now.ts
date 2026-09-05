import { useSyncExternalStore } from "react";

/*
  the current time, as something react is allowed to read.

  the clock is an outside system: `Date.now()` in a render body is the impure
  call the compiler refuses, and setting it from an effect is the cascading
  render the lint rule refuses. subscribing to it is what is left, and it is
  also what it actually is

  the value is rounded down to the tick, so two renders inside the same half
  minute get the same number and the store is stable enough to subscribe to.
  on the server there is no clock worth reading — the html is built at one
  moment and read at another — so it hands back 0, which callers show as
  nothing rather than as a time that was true when the page was rendered
*/

const TICK = 30_000;

const subscribe = (changed: () => void) => {
  const timer = setInterval(changed, TICK);
  return () => clearInterval(timer);
};

const now = () => Math.floor(Date.now() / TICK) * TICK;
const never = () => 0;

/** milliseconds since the epoch, or 0 before the component has mounted */
export function useNow() {
  return useSyncExternalStore(subscribe, now, never);
}
