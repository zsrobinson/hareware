import type { ReactNode } from "react";
import { Label } from "../ui/label";

export function Fieldset({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-4 shadow">
      {children}
    </div>
  );
}

export function FieldsetTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-md font-semibold leading-tight">{children}</h3>;
}

export function FieldsetItem({ children }: { children: ReactNode }) {
  return <div className="flex h-9 items-center gap-2">{children}</div>;
}

export function FieldsetLabel({ children }: { children: ReactNode }) {
  return <Label className="min-w-20">{children}</Label>;
}
