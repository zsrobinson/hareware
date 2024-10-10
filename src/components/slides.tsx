import type { ReactNode } from "react";
import type { TextSize, Theme } from "~/lib/types";

export function TitleSlide({
  title,
  author,
  imageURI,
  theme,
  titleSize,
}: {
  title: string;
  author?: string;
  imageURI: string;
  theme: Theme;
  titleSize: TextSize;
}) {
  return (
    <div
      className={
        "box-content flex aspect-square w-96 flex-col items-center overflow-hidden font-news " +
        (theme === "white"
          ? "bg-white"
          : theme === "maroon"
            ? "bg-hare-primary"
            : "bg-hare-secondary")
      }
      id="title-slide"
    >
      <img src={"data:image/;base64," + imageURI} />

      <div className="flex grow flex-col items-center justify-around p-3 text-center leading-none">
        <p
          className={
            "text-balance font-semibold leading-tight " +
            (theme === "maroon" ? "text-white" : "text-hare-primary") +
            " " +
            (titleSize === "xl"
              ? "text-xl"
              : titleSize === "2xl"
                ? "text-2xl"
                : "text-3xl")
          }
          dangerouslySetInnerHTML={{ __html: title }}
        />

        <img src="/hare-logo.webp" className="h-12" />

        {author && (
          <p
            className={
              "text-sm leading-tight " +
              (theme === "maroon" ? "text-white" : "text-hare-primary")
            }
          >
            Article by {author}
          </p>
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
      <div className="text-hare-primary absolute top-0 flex flex-col gap-2 p-4">
        {children}
      </div>

      <div className="pointer-events-none absolute top-0 aspect-square w-96 bg-gradient-to-b from-transparent from-40% to-white to-90%"></div>

      <p className="text-hare-primary absolute bottom-3 w-full text-center font-bold">
        Full Article in Bio
      </p>
    </div>
  );
}
