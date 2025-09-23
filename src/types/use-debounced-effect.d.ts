declare module "use-debounced-effect" {
  import * as React from "react";

  export function useDebouncedEffect(
    callback: () => void | (() => void),
    config:
      | number
      | {
          timeout?: number;
          ignoreInitialCall?: boolean;
        },
    dependencies?: any[],
  ): void;

  export default useDebouncedEffect;
}
