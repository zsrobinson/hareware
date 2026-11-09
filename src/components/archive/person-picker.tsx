/*
  "Counts as": who a printed name is, picked from everyone credited, or typed
  when they have not been credited yet. It looks like a select, so it reads as
  a choice already made ("Themselves") rather than a box still to fill. Every
  "Counts as" is one of these, or a few for a byline two people share.
*/

import { Combobox } from "@base-ui/react/combobox";
import {
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { same } from "~/lib/credits/sheet";
import { searchable } from "~/lib/credits/stats";
import { cn } from "~/lib/utils";

/* the credit editor's actions: quiet, their icon on the rows' icon column */
export const QUIET = "text-muted-foreground hover:text-foreground -ml-2.5";

/* enough to find someone by typing; the full list is hundreds long */
const SHOWN = 60;

export function PersonPicker({
  id,
  value,
  onChange,
  people,
  none,
  placeholder = "Choose a person",
}: {
  /** for the row's label */
  id?: string;
  /** the person, or "" for nobody chosen */
  value: string;
  onChange: (name: string) => void;
  people: string[];
  /** what nobody chosen means, offered first ("Themselves"); without it the
      placeholder shows until someone is chosen */
  none?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const typed = query.trim();

  const items = useMemo(() => {
    const wanted = searchable(typed);
    const matches = people
      .filter((name) => !wanted || searchable(name).includes(wanted))
      .slice(0, SHOWN);
    const known = people.some((name) => same(name, typed));
    return [
      ...(none !== undefined && !typed ? [""] : []),
      ...matches,
      /* someone not credited yet, as typed */
      ...(typed && !known ? [typed] : []),
    ];
  }, [people, typed, none]);

  const label = (name: string) => (name === "" ? (none ?? "") : name);

  return (
    <Combobox.Root<string>
      items={items}
      filter={null}
      autoHighlight
      value={value === "" && none === undefined ? null : value}
      onValueChange={(next) => onChange(next ?? "")}
      inputValue={query}
      onInputValueChange={setQuery}
      onOpenChange={(open) => !open && setQuery("")}
      itemToStringLabel={label}
    >
      {/* SelectTrigger's look, as beside a Role select */}
      <Combobox.Trigger
        id={id}
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 flex h-8 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Combobox.Value placeholder={placeholder}>
          {(name: string | null) => (
            <span className="truncate">
              {name === null ? placeholder : label(name)}
            </span>
          )}
        </Combobox.Value>
        <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          align="start"
          sideOffset={4}
          className="isolate z-50"
        >
          <Combobox.Popup
            aria-label="People"
            className="bg-popover text-popover-foreground ring-foreground/10 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 flex max-h-[min(20rem,var(--available-height))] w-72 max-w-(--available-width) min-w-(--anchor-width) origin-(--transform-origin) flex-col overflow-hidden rounded-lg shadow-md ring-1 duration-100"
          >
            <label className="relative flex shrink-0 items-center border-b">
              <span className="sr-only">Search people</span>
              <SearchIcon className="text-muted-foreground pointer-events-none absolute left-2.5 size-4" />
              <Combobox.Input
                placeholder="Search or type a name"
                className="placeholder:text-muted-foreground h-9 w-full bg-transparent pr-2.5 pl-8 text-base outline-none md:text-sm"
              />
            </label>
            <Combobox.Empty className="text-muted-foreground px-2.5 py-2 text-sm empty:hidden">
              Nobody by that name.
            </Combobox.Empty>
            <Combobox.List className="min-h-0 overflow-y-auto overscroll-contain p-1 empty:hidden">
              {(name: string) => (
                <Combobox.Item
                  key={name === "" ? "\u0000none" : name}
                  value={name}
                  className="data-highlighted:bg-accent data-highlighted:text-accent-foreground relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none"
                >
                  <span
                    className={cn(
                      "truncate",
                      name === "" && "text-muted-foreground",
                    )}
                  >
                    {label(name)}
                    {name !== "" && !people.includes(name) && (
                      <span className="text-muted-foreground">
                        {" "}
                        · not credited yet
                      </span>
                    )}
                  </span>
                  <Combobox.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                    <CheckIcon className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

/**
 * Several people, as a byline two people write under: a picker each, and
 * "Add another person". Nobody is `none`, as a single picker shows it.
 */
export function PeoplePicker({
  id,
  value,
  onChange,
  people,
  none,
  label,
}: {
  /** for the row's label, on the first picker */
  id?: string;
  value: string[];
  onChange: (names: string[]) => void;
  people: string[];
  none: string;
  /** what the pickers choose, for a screen reader, where no label says it */
  label?: string;
}) {
  /* a picker just added starts on nobody, which `value` cannot hold */
  const [adding, setAdding] = useState(false);
  /* the row to focus once drawn: the button that was pressed is gone */
  const focusRow = useRef<number | null>(null);
  const list = adding ? [...value, ""] : value.length > 0 ? value : [""];
  const change = (next: string[]) => {
    setAdding(false);
    onChange(next.filter(Boolean));
  };

  return (
    <div
      className="space-y-2"
      role={label ? "group" : undefined}
      aria-label={label}
    >
      {list.map((name, index) => (
        <div
          key={index}
          className="flex items-center gap-1"
          ref={(row) => {
            if (row && focusRow.current === index) {
              focusRow.current = null;
              row.querySelector("button")?.focus();
            }
          }}
        >
          <div className="min-w-0 flex-1">
            <PersonPicker
              id={index === 0 ? id : undefined}
              value={name}
              onChange={(next) =>
                change(list.map((n, i) => (i === index ? next : n)))
              }
              /* someone chosen in another picker is not offered twice */
              people={people.filter(
                (person) =>
                  same(person, name) || !list.some((n) => same(n, person)),
              )}
              none={list.length === 1 ? none : undefined}
            />
          </div>
          {list.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              aria-label={name ? `Remove ${name}` : "Remove this person"}
              onClick={() => {
                focusRow.current = Math.max(0, index - 1);
                change(list.filter((_, i) => i !== index));
              }}
            >
              <XIcon />
            </Button>
          )}
        </div>
      ))}
      {value.length > 0 && !adding && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={QUIET}
          onClick={() => {
            focusRow.current = list.length;
            setAdding(true);
          }}
        >
          <PlusIcon /> Add another person
        </Button>
      )}
    </div>
  );
}
