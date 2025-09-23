import type { ReactNode } from "react";
import { useLayoutState } from "~/lib/layout-state";

/** Children as article content */
export function ContentSlide({ children }: { children: ReactNode }) {
  const state = useLayoutState();

  return (
    <div
      className="relative box-content flex aspect-square w-96 flex-col overflow-hidden font-serif"
      style={{ backgroundColor: state.bgColor }}
      id="content-slide"
    >
      <div
        className="[&_h2]:font-display absolute top-0 flex max-w-full list-inside flex-col gap-2 p-6 break-words [&_*]:my-[0.00001px]! [&_h2]:pt-1 [&_h2]:text-xl [&_h2]:font-semibold"
        style={{ color: state.textColor }}
      >
        {children}
      </div>

      <div
        className="pointer-events-none absolute top-0 aspect-square w-96 bg-linear-to-b"
        style={{
          backgroundImage: `linear-gradient(rgba(0,0,0,0) 50%, ${state.bgColor} 90%)`,
        }}
      ></div>

      <span
        className="absolute bottom-4 w-full text-center leading-none font-semibold"
        style={{ color: state.textColor }}
      >
        Full Article in Bio
      </span>
    </div>
  );
}
