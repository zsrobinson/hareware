import type { ReactNode } from "react";

/**
 * What heads every view, whatever its layout: its title, the question it
 * answers, and what it counts, so choosing another tab moves nothing under
 * the strip. A chart's or a pivot's is its figure's caption.
 */
export function ViewHeading({
  title,
  question,
  count,
  figure = false,
  children,
}: {
  title: ReactNode;
  question: string | null;
  count: ReactNode;
  figure?: boolean;
  /** what is said of the count under it, as that Jetpack may have left some out */
  children?: ReactNode;
}) {
  const Wrap = figure ? "figcaption" : "div";
  return (
    <Wrap className="w-full space-y-0.5">
      <div className="font-medium">{title}</div>
      {question && (
        <div className="text-muted-foreground text-sm">{question}</div>
      )}
      <div className="text-muted-foreground text-sm tabular-nums">{count}</div>
      {children}
    </Wrap>
  );
}
