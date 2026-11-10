import { useMemo, useRef, useState, type Ref } from "react";
import { Input } from "~/components/ui/input";
import type { Archive } from "~/lib/credits/archive";
import { peopleOf } from "~/lib/credits/person";
import { searchable } from "~/lib/credits/stats";
import type { FilterState } from "./filters";

/** An article search can become an exact person filter before it mixes in coauthors. */
export function ArchiveSearch({
  archive,
  state,
  setState,
  inputRef,
  placeholder,
  suggest,
}: {
  archive: Archive;
  state: FilterState;
  setState: (state: FilterState) => void;
  inputRef: Ref<HTMLInputElement>;
  placeholder: string;
  suggest: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const typed = searchable(state.search.trim());
  const names = useMemo(
    () =>
      !suggest || typed.length < 2
        ? []
        : [...peopleOf(archive.articles).values()]
            .filter(
              (person) =>
                !state.people.includes(person.name) &&
                [person.name, ...person.penNames.map((p) => p.byline)].some(
                  (name) => searchable(name).includes(typed),
                ),
            )
            .sort(
              (a, b) =>
                Number(searchable(b.name) === typed) -
                  Number(searchable(a.name) === typed) ||
                a.name.localeCompare(b.name),
            )
            .slice(0, 5)
            .map((person) => person.name),
    [archive, typed, state.people, suggest],
  );
  const open = focused && names.length > 0;
  return (
    <div
      ref={box}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <Input
        ref={inputRef}
        type="search"
        aria-label="Search"
        placeholder={placeholder}
        className="bg-background pl-8"
        value={state.search}
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          setFocused(true);
          setState({ ...state, search: event.target.value });
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && open) {
            event.preventDefault();
            box.current?.querySelector<HTMLButtonElement>("button")?.focus();
          } else if (event.key === "Escape" && open) {
            event.stopPropagation();
            setFocused(false);
          }
        }}
      />
      {open && (
        <div
          aria-label="People matching search"
          role="group"
          className="bg-popover text-popover-foreground absolute inset-x-0 top-full z-20 mt-1 rounded-md border p-1 shadow-md"
        >
          {names.map((name) => (
            <button
              key={name}
              type="button"
              className="hover:bg-accent focus-visible:bg-accent block w-full rounded-sm px-2 py-2 text-left text-sm outline-none"
              onClick={() => {
                setState({
                  ...state,
                  people: [...state.people, name],
                  search: "",
                });
                setFocused(false);
              }}
            >
              Only {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
