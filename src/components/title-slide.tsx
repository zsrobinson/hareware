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
      className="relative box-content flex aspect-square w-96 flex-col items-center overflow-hidden font-news"
      style={{ backgroundColor: state.bgColor }}
      id="title-slide"
    >
      {imageURI ? (
        <img src={imageURI} className="aspect-video w-full bg-secondary" />
      ) : (
        <div className="aspect-video w-full bg-secondary" />
      )}

      <div className="flex grow flex-col p-2 px-3 pt-3">
        <div className="flex grow flex-col items-center justify-between gap-0.5">
          <p
            id="title-content"
            dangerouslySetInnerHTML={{ __html: state.titleContent }}
            className="text-balance text-center font-semibold leading-[1.1]"
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
              className="leading-[1.1]"
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
