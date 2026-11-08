import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

/** a labelled dropdown, the one control every archive picker uses */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
  width = "min-w-32",
}: {
  label: string;
  value: T;
  options: { id: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
  /** a fixed width, so a long option does not move what sits beside it */
  width?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={
          hideLabel ? "sr-only" : "text-muted-foreground text-xs font-medium"
        }
      >
        {label}
      </span>
      <Select
        value={value}
        items={options.map((option) => ({
          value: option.id,
          label: option.label,
        }))}
        onValueChange={(next) => onChange(next as T)}
      >
        <SelectTrigger aria-label={label} className={width}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.id}
              value={option.id}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
