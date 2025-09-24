// https://github.com/samanmohamadi/use-debounced-effect
// had problems installing and importing, something weird with vite

import { useEffect, useRef } from "react";

const DEFAULT_CONFIG = {
  timeout: 0,
  ignoreInitialCall: true,
};
export function useDebouncedEffect(
  callback: () => void | Function,
  config:
    | number
    | {
        timeout?: number;
        ignoreInitialCall?: boolean;
      },
  deps: any[],
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
    clearFunc?: void | Function;
  }>({ firstTime: true });
  useEffect(() => {
    const { firstTime, clearFunc } = data.current;

    if (firstTime && ignoreInitialCall) {
      data.current.firstTime = false;
      return;
    }

    const handler = setTimeout(() => {
      if (clearFunc && typeof clearFunc === "function") {
        clearFunc();
      }
      data.current.clearFunc = callback();
    }, timeout);

    return () => {
      clearTimeout(handler);
    };
  }, [timeout, ...deps]);
}

export default useDebouncedEffect;
