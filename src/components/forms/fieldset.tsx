import type { ReactNode } from "react";
import { Label } from "../ui/label";

export function Fieldset({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}

export function FieldsetTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-xl font-semibold">{children}</h3>;
}

export function FieldsetItem({ children }: { children: ReactNode }) {
  return <div className="flex h-9 items-center gap-2">{children}</div>;
}

export function FieldsetLabel({ children }: { children: ReactNode }) {
  return <Label className="min-w-24">{children}</Label>;
}
