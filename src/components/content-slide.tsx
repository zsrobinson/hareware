import type { ReactNode } from "react";

/** Children as article content */
export function ContentSlide({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative box-content flex aspect-square w-96 flex-col overflow-hidden bg-white font-news"
      id="content-slide"
    >
      <div className="absolute top-0 flex flex-col gap-2 p-4 text-hare-primary">
        {children}
      </div>

      <div className="pointer-events-none absolute top-0 aspect-square w-96 bg-gradient-to-b from-transparent from-40% to-white to-90%"></div>

      <p className="absolute bottom-3 w-full text-center font-bold text-hare-primary">
        Full Article in Bio
      </p>
    </div>
  );
}
