/*
  A neutral change treatment on a control or a chip
  whose value differs from the view as saved, and on nothing else. Never on
  data: charts, tables and pivots keep their own colours (ADR 0015).
*/

/** a quiet neutral tint, edge and text for an unsaved change */
export const EDITED =
  "bg-edited/8 border-edited/30 text-edited hover:bg-edited/12 dark:bg-edited/10 dark:hover:bg-edited/15";

/** the solid monochrome action: Save for everyone, while there is something to save */
export const SAVE =
  "bg-edited-solid text-edited-solid-foreground hover:bg-edited-solid/90";
