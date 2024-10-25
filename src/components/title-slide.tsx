import { useLayoutState } from "~/lib/layout-state";

export function TitleSlide({ imageURI }: { imageURI: string }) {
  const title = useLayoutState((state) => state.title);
  const author = useLayoutState((state) => state.author);
  const logo = useLayoutState((state) => state.logo);
  const background = useLayoutState((state) => state.background);

  return (
    <div
      className="relative box-content flex aspect-square w-96 flex-col items-center overflow-hidden font-news"
      style={{ backgroundColor: background.color }}
      id="title-slide"
    >
      <img src={"data:image/;base64," + imageURI} />

      <div
        className="flex grow flex-col items-center justify-around text-center leading-none"
        style={{ padding: background.padding + "px" }}
      >
        <p
          dangerouslySetInnerHTML={{ __html: title.content }}
          className="text-balance font-semibold leading-tight"
          style={{
            color: title.color,
            fontSize: title.size + "px",
          }}
        />

        {logo.position === "inline" && (
          <img
            src={
              logo.variant === "circle"
                ? "/hare-logo.webp"
                : logo.variant === "horizontal-maroon"
                  ? "/hare-banner.png"
                  : logo.variant === "horizontal-white"
                    ? "/hare-banner-white.png"
                    : ""
            }
            style={{
              height: logo.size + "px",
              width: "auto",
              opacity: logo.opacity,
            }}
            className={
              "h-12 " +
              (logo.filter === "invert"
                ? "invert"
                : logo.filter === "grayscale"
                  ? "grayscale"
                  : logo.filter === "sepia"
                    ? "sepia"
                    : "")
            }
          />
        )}

        {author && (
          <p
            dangerouslySetInnerHTML={{ __html: author.content }}
            className="leading-tight"
            style={{ color: author.color, fontSize: author.size + "px" }}
          />
        )}
      </div>

      {logo.position === "corner" && (
        <img
          src={
            logo.variant === "circle"
              ? "/hare-logo.webp"
              : logo.variant === "horizontal-maroon"
                ? "/hare-banner.png"
                : logo.variant === "horizontal-white"
                  ? "/hare-banner-white.png"
                  : ""
          }
          style={{
            height: logo.size + "px",
            width: "auto",
            opacity: logo.opacity,
            bottom: logo.yOffset + "px",
            right: logo.xOffset + "px",
          }}
          className={
            "absolute h-12 " +
            (logo.filter === "invert"
              ? "invert"
              : logo.filter === "grayscale"
                ? "grayscale"
                : logo.filter === "sepia"
                  ? "sepia"
                  : "")
          }
        />
      )}
    </div>
  );
}
