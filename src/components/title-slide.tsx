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

      <div className="flex h-full flex-col items-center p-3 pt-1 text-center">
        <div className="flex h-full max-h-fit flex-col justify-around overflow-clip">
          <p
            dangerouslySetInnerHTML={{ __html: state.title }}
            className="text-balance font-semibold leading-[1.15]"
            style={{
              color: state.textColor,
              fontSize: state.titleSize + "px",
            }}
          />
        </div>

        <img src="/hare-logo.webp" className="w-12" />
      </div>

      <div className="absolute bottom-0 flex w-full items-end justify-between px-4 py-3 opacity-70">
        <span
          dangerouslySetInnerHTML={{ __html: state.authorByline }}
          className="w-1/2 text-left text-sm leading-[1.15]"
          style={{ color: state.textColor }}
        />

        <span
          dangerouslySetInnerHTML={{ __html: state.imageByline }}
          className="w-1/2 text-right text-sm leading-[1.15]"
          style={{ color: state.textColor }}
        />
      </div>
    </div>
  );
}
