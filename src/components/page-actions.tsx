/*
  What acts on the whole page (Reload, Download CSV) sits in the layout's title
  row, beside the h1. The h1 is static html, so an island reaches the row
  through a portal into the layout's #page-actions.
*/

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSlot } from "./panel";

export function PageActions({ children }: { children: ReactNode }) {
  const slot = useSlot("page-actions");
  return slot ? createPortal(children, slot) : null;
}
