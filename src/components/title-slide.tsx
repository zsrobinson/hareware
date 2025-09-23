import { useEffect } from "react";
import { useLayoutState } from "~/lib/layout-state";

export function TitleSlide({ imageURI }: { imageURI: string }) {
  const state = useLayoutState();

  function isOverflowing() {
    const titleSlide = document.getElementById("title-slide")!;
    return titleSlide.scrollHeight > titleSlide.clientHeight;
  }

  async function adjustTitleSize() {
    await new Promise((res) => setTimeout(res, 100));
    if (isOverflowing()) return shrinkTitleSize();
    if (state.incTitleSize() > 32) return shrinkTitleSize();
    await adjustTitleSize();
  }

  async function shrinkTitleSize() {
    state.decTitleSize();
    await new Promise((res) => setTimeout(res, 100));
    if (isOverflowing()) return shrinkTitleSize();
  }

  useEffect(() => {
    adjustTitleSize();
  }, []);

  return (
    <div
      className="relative box-content flex aspect-square w-96 flex-col items-center overflow-hidden font-serif"
      style={{ backgroundColor: state.bgColor }}
      id="title-slide"
    >
      {imageURI ? (
        <img src={imageURI} className="bg-secondary aspect-video w-full" />
      ) : (
        <div className="bg-secondary aspect-video w-full" />
      )}

      <div className="flex w-full grow flex-col p-2 px-3">
        <div className="flex grow flex-col items-center justify-around gap-2">
          <span
            id="title-content"
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

            <img src="/hare-logo.webp" className="h-12" />

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
