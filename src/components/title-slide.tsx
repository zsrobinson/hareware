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
    if (state.incTitleSize() > 30) return shrinkTitleSize();
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

      <div className="flex grow flex-col p-2 px-3">
        <div className="flex grow flex-col items-center justify-around gap-0.5">
          <p
            id="title-content"
            dangerouslySetInnerHTML={{ __html: state.titleContent }}
            className="font-display text-center leading-[1.1] font-semibold text-balance"
            style={{
              color: state.textColor,
              fontSize: state.titleSize + "px",
            }}
          />

          {state.logoPosition === "inline" && (
            <img
              src="/hare-logo.webp"
              style={{
                height: state.logoSize + "px",
                width: "auto",
              }}
            />
          )}

          {state.authorContent && (
            <p
              dangerouslySetInnerHTML={{ __html: state.authorContent }}
              className="text-center leading-[1.1] font-medium"
              style={{
                color: state.textColor,
                fontSize: state.authorSize + "px",
              }}
            />
          )}
        </div>
      </div>

      {state.logoPosition === "corner" && (
        <img
          src="/hare-logo.webp"
          style={{
            height: state.logoSize + "px",
            width: "auto",
            bottom: state.logoXOffset + "px",
            right: state.logoYOffset + "px",
          }}
          className="absolute"
        />
      )}
    </div>
  );
}
