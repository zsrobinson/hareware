import { useEffect, type ReactNode, type RefObject } from "react";
import { useLayoutState } from "~/lib/layout-state";

/** Children as article content */
export function ContentSlide({
  children,
  ref,
}: {
  children: ReactNode;
  ref: RefObject<HTMLDivElement | null>;
}) {
  const state = useLayoutState();

  useEffect(() => {
    // must query manually since the astro-slot element isn't exposed to React
    const slotRef = document.querySelector("#content-slide astro-slot");

    const children = [...(slotRef?.children ?? [])] as HTMLElement[];
    for (let i = 0; i < state.paragraphShift; i++) {
      children[i].style.display = "none";
    }
    for (let i = state.paragraphShift; i < children.length; i++) {
      children[i].style.display = "block";
    }
  }, [state.paragraphShift]);

  return (
    <div
      className="relative box-content flex aspect-square w-96 flex-col overflow-hidden font-serif"
      style={{ backgroundColor: state.bgColor }}
      id="content-slide" // must keep, see lines 14-15
      ref={ref}
    >
      <div
        className="[&_h2]:font-display absolute top-0 flex max-w-full list-inside flex-col gap-2 p-6 break-words [&_*]:my-[0.00001px]! [&_h2]:pt-1 [&_h2]:text-xl [&_h2]:font-semibold"
        // must keep my-[0.00001px] for bug with modern-screenshot and firefox
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
