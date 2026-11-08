/*
  The forms' one grammar: icon | label | control | action, on fixed columns, so
  every control on every form starts at the same edge. On a phone a row stacks:
  icon and label on one line, the control full width under them, unless the
  control is short (a select, a slider, a switch) and stays beside its label.
*/

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

/** the label column: wide on a page, narrower in a side panel */
type Width = "page" | "panel";

/* the action's column only where there is an action: an empty track still
   takes its gap, and stops the control short of the edge that tables and the
   buttons beside it end at */
const COLUMNS: Record<Width, { plain: string; action: string }> = {
  page: {
    plain: "sm:grid-cols-[1rem_8rem_minmax(0,1fr)]",
    action: "sm:grid-cols-[1rem_8rem_minmax(0,1fr)_auto]",
  },
  panel: {
    plain: "sm:grid-cols-[1rem_5.5rem_minmax(0,1fr)]",
    action: "sm:grid-cols-[1rem_5.5rem_minmax(0,1fr)_auto]",
  },
};

/** a stack of rows with one rhythm */
export function FieldRows({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-col gap-3", className)}>{children}</div>;
}

export function FieldRow({
  icon: Icon,
  label,
  htmlFor,
  children,
  action,
  inline = false,
  top = false,
  width = "page",
}: {
  icon?: LucideIcon;
  label: ReactNode;
  /** the control's id, so the label focuses it */
  htmlFor?: string;
  children: ReactNode;
  /** a trailing button that acts on this field (Copy, Download) */
  action?: ReactNode;
  /** a short control that stays beside its label on a phone */
  inline?: boolean;
  /** for a tall control (a textarea, an image): label at its top */
  top?: boolean;
  width?: Width;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1.5",
        COLUMNS[width][action ? "action" : "plain"],
        top ? "items-start" : "items-center",
      )}
    >
      <span
        className={cn(
          "text-muted-foreground flex [&_svg]:size-4",
          top && "sm:pt-2",
        )}
        aria-hidden="true"
      >
        {Icon && <Icon />}
      </span>
      <label
        htmlFor={htmlFor}
        className={cn("text-sm font-medium", top && "sm:pt-1.5")}
      >
        {label}
      </label>
      <div
        className={cn(
          "min-w-0",
          /* a phone puts the control on its own line, under the label */
          inline
            ? "max-sm:w-40 max-sm:justify-self-end"
            : "max-sm:col-span-full max-sm:row-start-2",
        )}
      >
        {children}
      </div>
      {action && (
        <div
          className={cn(
            "flex justify-end",
            /* on a phone the action sits on the label's line */
            "max-sm:col-start-3 max-sm:row-start-1",
            inline && "max-sm:hidden",
          )}
        >
          {action}
        </div>
      )}
    </div>
  );
}

/** a line under a control, starting at the control's edge */
export function FieldNote({
  children,
  width = "page",
}: {
  children: ReactNode;
  width?: Width;
}) {
  return (
    <p
      className={cn(
        "text-muted-foreground -mt-1.5 text-xs",
        width === "page"
          ? "sm:pl-[calc(1rem+8rem+1.5rem)]"
          : "sm:pl-[calc(1rem+5.5rem+1.5rem)]",
      )}
    >
      {children}
    </p>
  );
}

/** a row of buttons that starts at the controls' edge (Count words, Add) */
export function FieldActions({
  children,
  width = "page",
}: {
  children: ReactNode;
  width?: Width;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        width === "page"
          ? "sm:pl-[calc(1rem+8rem+1.5rem)]"
          : "sm:pl-[calc(1rem+5.5rem+1.5rem)]",
      )}
    >
      {children}
    </div>
  );
}
