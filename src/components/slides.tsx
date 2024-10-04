import type { ReactNode } from "react";

export function TitleSlide({
  title,
  author,
  imageURI,
  variant,
  titleSize,
}: {
  title: string;
  author?: string;
  imageURI: string;
  variant: "white" | "maroon" | "gray";
  titleSize: "xl" | "2xl" | "3xl";
}) {
  return (
    <div
      className={`box-content flex aspect-square w-96 flex-col items-center overflow-hidden font-news ${variant === "white" ? "bg-white" : variant === "maroon" ? "bg-hare-dark" : "bg-zinc-300"}`}
      id="title-slide"
    >
      <img src={"data:image/;base64," + imageURI} />

      <div className="flex grow flex-col items-center justify-around p-3 text-center leading-none">
        <div>
          <p
            className={`text-balance pb-1 font-semibold leading-tight ${variant === "maroon" ? "text-white" : "text-black"} ${titleSize === "xl" ? "text-xl" : titleSize === "2xl" ? "text-2xl" : "text-3xl"}`}
            dangerouslySetInnerHTML={{ __html: title }}
          />

          {author && (
            <p
              className={`opacity-50 ${variant === "maroon" ? "text-white" : "text-black"}`}
            >
              Article by: {author}
            </p>
          )}
        </div>

        {variant === "white" ? (
          <img src="/hare-banner.png" className="h-8" />
        ) : variant === "maroon" ? (
          <img src="/hare-banner-white.png" className="h-8" />
        ) : (
          <img src="/hare-banner-white.png" className="h-8 invert" />
        )}
      </div>
    </div>
  );
}

/** Children as article content */
export function ContentSlide({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative box-content flex aspect-square w-96 flex-col overflow-hidden bg-white font-news"
      id="content-slide"
    >
      <div className="absolute top-0 flex flex-col gap-2 p-4">{children}</div>

      <div className="pointer-events-none absolute top-0 aspect-square w-96 bg-gradient-to-b from-transparent from-40% to-white to-90%"></div>

      <p className="absolute bottom-3 w-full text-center font-bold">
        Full Article in Bio
      </p>
    </div>
  );
}
