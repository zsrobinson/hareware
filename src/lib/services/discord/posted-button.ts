import type { Component } from "./message";

const BUTTON = 2;
const SUCCESS_STYLE = 3;
const DANGER_STYLE = 4;
const MAX_LABEL = 80;

export const POSTED_PREFIX = "posted:";

/** Discord requires a unique custom id no longer than 100 characters. */
export function postedId(slug: string) {
  return `${POSTED_PREFIX}${slug}`.slice(0, 100);
}

/** Toggle one posted marker while preserving every valid interactive id. */
export function togglePosted(
  components: Component[],
  id: string,
  name: string,
): Component[] {
  return components.map((component) => {
    if (!component.components) return component;

    return {
      ...component,
      components: component.components.map((child) => {
        if (child.type !== BUTTON || child.custom_id !== id) return child;

        return child.style === SUCCESS_STYLE
          ? { ...child, style: DANGER_STYLE, label: "Not posted" }
          : {
              ...child,
              style: SUCCESS_STYLE,
              label: `Posted by ${name}`.slice(0, MAX_LABEL),
            };
      }),
    };
  });
}
