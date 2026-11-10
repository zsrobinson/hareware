import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Shows something laid out at a fixed width scaled down to fit a narrower
 * column, as a slide on a phone. Only the display shrinks: the child keeps its
 * own width, so whatever renders it to an image renders it full size.
 */
export function FitWidth({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>();

  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const natural = inner.current.offsetWidth;
      const next = natural
        ? Math.min(1, outer.current.clientWidth / natural)
        : 1;
      setScale(next);
      setHeight(inner.current.offsetHeight * next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (outer.current) observer.observe(outer.current);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outer} className="w-full" style={{ height }}>
      <div
        ref={inner}
        style={{
          width: "max-content",
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
