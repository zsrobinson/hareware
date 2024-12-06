import type { ReactNode } from "react";
import { useLayoutState } from "~/lib/layout-state";

/** Children as article content */
export function ContentSlide({ children }: { children: ReactNode }) {
  const state = useLayoutState();

  return (
    <div
      className="relative box-content flex aspect-square w-96 flex-col overflow-hidden font-news"
      style={{ backgroundColor: state.bgColor }}
      id="content-slide"
    >
      <div
        className="absolute top-0 flex max-w-full list-inside flex-col gap-2 break-words p-6"
        style={{ color: state.textColor }}
      >
        {children}
      </div>

      <div
        className="pointer-events-none absolute top-0 aspect-square w-96 bg-gradient-to-b"
        style={{
          backgroundImage: `linear-gradient(rgba(0,0,0,0) 50%, ${state.bgColor} 90%)`,
        }}
      ></div>

      <p
        className="absolute bottom-4 w-full text-center font-semibold leading-none"
        style={{ color: state.textColor }}
      >
        Full Article in Bio
      </p>
    </div>
  );
}
