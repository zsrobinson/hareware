import { useAutoAnimate } from "@formkit/auto-animate/react";
import { DownloadIcon, ExclamationTriangleIcon } from "@radix-ui/react-icons";
import download from "downloadjs";
import { toPng } from "html-to-image";
import { useEffect, useState, type ReactNode } from "react";
import { useLayoutState } from "~/lib/layout-state";
import { ContentSlide } from "./content-slide";
import { OptionsForm } from "./options-form";
import { TitleSlide } from "./title-slide";
import { Button } from "./ui/button";

export function GeneratePage({
  defaultTitle,
  defaultArticleByline,
  defaultImageByline,
  articleLink,
  imageURI,
  children,
}: {
  defaultTitle: string;
  defaultArticleByline: string;
  defaultImageByline: string;
  articleLink: string;
  imageURI: string;
  children: ReactNode;
}) {
  const state = useLayoutState();
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [animate] = useAutoAnimate();

  useEffect(() => {
    state.setTitle(defaultTitle);
    state.setArticleByline(defaultArticleByline);
    state.setImageByline(defaultImageByline);
  }, []);

  useEffect(() => {
    const titleSlide = document.getElementById("title-slide")!;
    setIsOverflowing(titleSlide.scrollHeight > titleSlide.clientHeight);
  }, [state]);

  return (
    <div className="flex flex-col items-start gap-8 md:flex-row">
      <OptionsForm articleLink={articleLink} />

      <div className="flex flex-wrap items-start gap-8">
        <div className="bg-secondary dark:bg-primary-foreground flex flex-col items-center gap-4 rounded-xl border p-4">
          <TitleSlide imageURI={imageURI} />
          <div className="flex w-full justify-around" ref={animate}>
            <Button
              variant="outline"
              id="title-slide-download"
              onClick={() => {
                toPng(document.getElementById("title-slide")!, {
                  canvasHeight: 1000,
                  canvasWidth: 1000,
                }).then((dataURI) => {
                  download(dataURI, "title-slide.png");
                });
              }}
            >
              <DownloadIcon className="mr-2" />
              Download
            </Button>

            {isOverflowing && (
              <div className="flex items-center gap-2 text-sm font-medium text-red-500">
                <ExclamationTriangleIcon className="mt-0.5" />
                <span>Content may be overflowing</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-secondary dark:bg-primary-foreground flex flex-col items-center gap-4 rounded-xl border p-4">
          <ContentSlide>{children}</ContentSlide>
          <Button
            variant="outline"
            id="content-slide-download"
            onClick={() => {
              toPng(document.getElementById("content-slide")!, {
                canvasHeight: 1000,
                canvasWidth: 1000,
              }).then((dataURI) => {
                download(dataURI, "content-slide.png");
              });
            }}
          >
            <DownloadIcon className="mr-2" />
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}
