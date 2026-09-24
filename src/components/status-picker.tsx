import { useId } from "react";
import { Button } from "~/components/ui/button";

/** notion's Status options as a labelled row of toggles */
export function StatusPicker({
  statuses,
  value,
  onPick,
  label = "Status",
  hideLabel = false,
  disabled = false,
  size = "default",
}: {
  statuses: string[];
  value: string | null;
  onPick: (status: string) => void;
  label?: string;
  hideLabel?: boolean;
  disabled?: boolean;
  size?: "default" | "sm";
}) {
  const id = useId();

  return (
    <div className="space-y-1.5">
      {!hideLabel && (
        <div id={id} className="text-sm leading-none font-medium">
          {label}
        </div>
      )}
      <div
        role="group"
        {...(hideLabel ? { "aria-label": label } : { "aria-labelledby": id })}
        className="flex flex-wrap gap-2"
      >
        {statuses.map((status) => (
          <Button
            key={status}
            type="button"
            size={size}
            variant={value === status ? "secondary" : "outline"}
            aria-pressed={value === status}
            disabled={disabled}
            onClick={() => onPick(status)}
          >
            {status}
          </Button>
        ))}
      </div>
    </div>
  );
}
