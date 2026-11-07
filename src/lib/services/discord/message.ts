/* What Discord sends back about a message it shows: the shape the posted button edits. */

/** One recursive representation for every component Discord sends or receives. */
export type Component = {
  type: number;
  custom_id?: string;
  components?: Component[];
  [key: string]: unknown;
};

export const IS_COMPONENTS_V2 = 1 << 15;
