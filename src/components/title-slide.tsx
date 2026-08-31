import { useLayoutEffect, useRef, type RefObject } from "react";
import { useLayoutState } from "~/lib/layout-state";

/* the range the slider offers, which is what we search within */
const MIN_AUTO_TITLE_SIZE = 16;
const MAX_AUTO_TITLE_SIZE = 36;

export function TitleSlide({
  imageURI,
  ref,
}: {
  imageURI?: string;
  ref: RefObject<HTMLDivElement | null>;
}) {
  const state = useLayoutState();
  const titleRef = useRef<HTMLSpanElement>(null);
  const autoSized = useRef<number | null>(null);

  /**
   * fit the title to the slide, once, as soon as there is a title to fit.
   *
   * reading scrollHeight forces a synchronous reflow, so a binary search over
   * the slider's range settles inside a single frame — the old version stepped
   * one pixel at a time behind a 100ms timer, which took upwards of a second
   * and restarted the debounced png render on every step along the way.
   *
   * the title arrives from a parent effect a beat after mount, so this keys off
   * the title rather than mount; past that first fit the size belongs to
   * whoever is dragging the slider.
   */
  useLayoutEffect(() => {
    if (autoSized.current !== null || !state.title) return;

    const measure = () => {
      const slide = ref.current;
      const title = titleRef.current;
      if (!slide || !title) return;

      const fits = (size: number) => {
        title.style.fontSize = `${size}px`;
        return slide.scrollHeight <= slide.clientHeight;
      };

      let low = MIN_AUTO_TITLE_SIZE;
      let high = MAX_AUTO_TITLE_SIZE;
      let best = MIN_AUTO_TITLE_SIZE;

      while (low <= high) {
        const size = Math.floor((low + high) / 2);
        if (fits(size)) {
          best = size;
          low = size + 1;
        } else {
          high = size - 1;
        }
      }

      fits(best); // hold the winning size until the re-render catches up
      autoSized.current = best;
      state.setTitleSize(best);
    };

    measure();

    // the serif loads with font-display: swap, so a measurement taken against
    // fallback metrics can come out wrong. redo it after the swap, unless the
    // slider has been touched in the meantime
    document.fonts?.ready.then(() => {
      if (autoSized.current === useLayoutState.getState().titleSize) measure();
    });
  }, [state.title]);

  return (
    <div
      className="relative box-content flex w-96 flex-col items-center overflow-hidden font-serif"
      style={{
        backgroundColor: state.bgColor,
        aspectRatio: state.ratio,
      }}
      ref={ref}
    >
      {imageURI ? (
        <img
          src={imageURI}
          // photon answers with access-control-allow-origin: *, so asking for
          // the image as cors leaves the cached copy reusable when the png
          // renderer inlines it, rather than making it fetch the image a second
          // time on every re-render. uploads arrive as data uris, which have
          // nothing to negotiate
          crossOrigin={imageURI.startsWith("data:") ? undefined : "anonymous"}
          className="bg-secondary aspect-video w-full"
        />
      ) : (
        <div className="bg-secondary aspect-video w-full" />
      )}

      <div className="flex w-full grow flex-col p-2 px-3">
        <div className="flex grow flex-col items-center justify-evenly gap-2">
          <span
            ref={titleRef}
            dangerouslySetInnerHTML={{ __html: state.title }}
            className="font-display text-center leading-[1.1] font-[600] text-balance"
            style={{
              color: state.textColor,
              fontSize: state.titleSize + "px",
            }}
          />

          <div className="flex w-full items-center gap-2">
            {state.articleByline && (
              <div
                className="flex basis-1/2 flex-col text-center leading-[1.15]"
                style={{
                  color: state.textColor,
                  fontSize: state.bylineSize + "px",
                }}
              >
                <span>Article by</span>
                <span
                  dangerouslySetInnerHTML={{ __html: state.articleByline }}
                />
              </div>
            )}

            <img src="/hare-logo.webp" className="h-14 w-14" />

            {state.imageByline && (
              <div
                className="flex basis-1/2 flex-col text-center leading-[1.15]"
                style={{
                  color: state.textColor,
                  fontSize: state.bylineSize + "px",
                }}
              >
                <span>Image by</span>
                <span dangerouslySetInnerHTML={{ __html: state.imageByline }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
