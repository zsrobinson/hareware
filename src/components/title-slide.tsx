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

      <div className="flex grow flex-col items-center justify-around p-2 text-center">
        <p
          dangerouslySetInnerHTML={{ __html: state.title }}
          className="text-balance font-semibold leading-tight"
          style={{
            color: state.textColor,
            fontSize: state.titleSize + "px",
          }}
        />

        <div className="flex w-full items-center">
          <p
            dangerouslySetInnerHTML={{ __html: state.authorByline }}
            className="w-1/2 text-sm leading-tight opacity-60"
            style={{ color: state.textColor }}
          />

          <img src="/hare-logo.webp" className="w-12" />

          <p
            dangerouslySetInnerHTML={{ __html: state.imageByline }}
            className="w-1/2 text-sm leading-tight opacity-60"
            style={{ color: state.textColor }}
          />
        </div>
      </div>
    </div>
  );
}
