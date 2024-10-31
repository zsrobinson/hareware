import { useEffect } from "react";
import { useLayoutState } from "~/lib/layout-state";

const LEADING = 1.1;

export function TitleSlide({ imageURI }: { imageURI: string }) {
  const state = useLayoutState();

  function isOverflowing() {
    const titleSlide = document.getElementById("title-slide")!;
    return titleSlide.scrollHeight > titleSlide.clientHeight;
  }

  async function adjustTitleSize() {
    await new Promise((res) => setTimeout(res, 100));
    if (isOverflowing()) return shrinkTitleSize();
    if (state.incTitleSize() > 30) {
      return shrinkTitleSize();
    }
    await adjustTitleSize();
  }

  async function shrinkTitleSize() {
    const size = state.decTitleSize();
    await new Promise((res) => setTimeout(res, 100));
    if (isOverflowing()) return shrinkTitleSize();

    const title = document.getElementById("title-content")!;

    // if (Math.round(title.clientHeight / (size * LEADING)) < 3) {
    //   console.log(Math.floor(title.clientHeight / (size * LEADING)));
    //   const logoFlex = document.getElementById("logo-flex")!;
    //   logoFlex.style.setProperty("gap", "0.625rem", "important");
    // }
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
      <img src={"data:image/;base64," + imageURI} />

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
