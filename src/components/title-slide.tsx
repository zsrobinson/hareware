import { useLayoutState } from "~/lib/layout-state";

export function TitleSlide({ imageURI }: { imageURI: string }) {
  const state = useLayoutState();

  return (
    <div
      className="relative box-content flex aspect-square w-96 flex-col items-center overflow-hidden font-news"
      style={{ backgroundColor: state.bgColor }}
      id="title-slide"
    >
      <img src={"data:image/;base64," + imageURI} />

      <div className="flex grow flex-col gap-1 p-2">
        <div className="flex grow flex-col items-center justify-around">
          <p
            dangerouslySetInnerHTML={{ __html: state.titleContent }}
            className="text-balance text-center font-semibold leading-[1.1]"
            style={{
              color: state.textColor,
              fontSize: state.titleSize + "px",
            }}
          />
        </div>

        <div className="flex flex-col items-center gap-1">
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
