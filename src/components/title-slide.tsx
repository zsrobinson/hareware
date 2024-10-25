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

      <div className="flex grow flex-col items-center justify-around p-2 text-center leading-none">
        <p
          dangerouslySetInnerHTML={{ __html: state.titleContent }}
          className="text-balance font-semibold leading-tight"
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
            className="leading-tight"
            style={{
              color: state.textColor,
              fontSize: state.authorSize + "px",
            }}
          />
        )}
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
