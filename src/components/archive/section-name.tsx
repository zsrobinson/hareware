import { cn } from "~/lib/utils";
import { seriesColor } from "./colors";

/** the section's chart colour, so a section reads the same on every page */
export function SectionDot({
  section,
  className,
}: {
  section: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", className)}
      style={{ background: seriesColor(section, [], "section") }}
    />
  );
}

/** a section's name behind its dot, inline in a line of text */
export function SectionName({ section }: { section: string }) {
  return (
    /* top-aligned, the box is one line tall, so its text sits on the line's
       baseline as plain text would */
    <span className="inline-flex items-center gap-1.5 align-top">
      <SectionDot section={section} />
      {section}
    </span>
  );
}
