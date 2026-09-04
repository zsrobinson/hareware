/*
  vendored from https://github.com/samanmohamadi/use-debounced-effect — the
  package would not import cleanly under vite, so it lives here instead.

  the types are ours: upstream writes the cleanup as `Function` and the deps as
  `any[]`, which turns off checking for every caller of the hook. `() => void`
  says the same thing and is the shape react itself uses for a cleanup
*/

import { useEffect, useRef } from "react";

const DEFAULT_CONFIG = {
  timeout: 0,
  ignoreInitialCall: true,
};
export function useDebouncedEffect(
  callback: () => void | (() => void),
  config:
    | number
    | {
        timeout?: number;
        ignoreInitialCall?: boolean;
      },
  deps: unknown[],
) {
  let currentConfig;
  if (typeof config === "object") {
    currentConfig = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  } else {
    currentConfig = {
      ...DEFAULT_CONFIG,
      timeout: config,
    };
  }
  const { timeout, ignoreInitialCall } = currentConfig;
  const data = useRef<{
    firstTime: boolean;
    clearFunc?: void | (() => void);
  }>({ firstTime: true });
  useEffect(() => {
    const { firstTime, clearFunc } = data.current;

    if (firstTime && ignoreInitialCall) {
      data.current.firstTime = false;
      return;
    }

    const handler = setTimeout(() => {
      if (typeof clearFunc === "function") clearFunc();
      data.current.clearFunc = callback();
    }, timeout);

    return () => {
      clearTimeout(handler);
    };
    /*
      the caller's deps are spread in, which is the whole point of the hook and
      the one thing the rule cannot follow statically. `callback` is left out
      deliberately: including it would re-arm the timer on every render, which
      is exactly the debounce this exists to provide
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeout, ...deps]);
}

export default useDebouncedEffect;
