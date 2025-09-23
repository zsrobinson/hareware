import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  ExclamationTriangleIcon,
  InfoCircledIcon,
} from "@radix-ui/react-icons";
import { domToPng } from "modern-screenshot";
import { useEffect, useState, type ReactNode } from "react";
import { useLayoutState } from "~/lib/layout-state";
import { useDebouncedEffect } from "../lib/use-debounced-effect";
import { ContentSlide } from "./content-slide";
import { LoaderCircle } from "./loader-circle";
import { OptionsForm } from "./options-form";
import { TitleSlide } from "./title-slide";

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
    const titleSlideImage = document.getElementById(
      "title-slide-image",
    ) as HTMLImageElement;
    titleSlideImage.src = "";
  }, [state]);

  useDebouncedEffect(
    () => {
      const titleSlideImage = document.getElementById(
        "title-slide-image",
      ) as HTMLImageElement;
      domToPng(document.getElementById("title-slide")!, {
        scale: 4,
      }).then((dataURI) => {
        titleSlideImage.src = dataURI;
      });
    },
    300,
    [state],
  );

  useEffect(() => {
    const contentSlideImage = document.getElementById(
      "content-slide-image",
    ) as HTMLImageElement;
    contentSlideImage.src = "";
  }, [state.bgColor, state.textColor, state.paragraphShift]);

  useDebouncedEffect(
    () => {
      const contentSlideImage = document.getElementById(
        "content-slide-image",
      ) as HTMLImageElement;

      domToPng(document.getElementById("content-slide")!, {
        scale: 4,
      }).then((dataURI) => {
        contentSlideImage.src = dataURI;
      });
    },
    300,
    [state.bgColor, state.textColor, state.paragraphShift],
  );

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
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Options</h2>
        <OptionsForm articleLink={articleLink} />
      </div>

      <div className="flex flex-wrap items-start gap-8">
        <div className="mr-4 flex w-96 flex-col gap-4">
          <div className="flex justify-between" ref={animate}>
            <h2 className="text-xl font-semibold">Title Slide</h2>
            {isOverflowing && (
              <div className="flex items-center gap-2 text-sm font-medium text-red-500">
                <ExclamationTriangleIcon className="mt-0.5" />
                <span>Content may be overflowing</span>
              </div>
            )}
          </div>

          <div className="relative">
            <TitleSlide imageURI={imageURI} />
            <div className="absolute top-0 left-0 z-10 flex h-full w-full items-center justify-center gap-2 bg-black/50 text-white">
              <LoaderCircle className="animate-spin" />
              Rendering
            </div>
            <img
              id="title-slide-image"
              className="absolute top-0 left-0 z-20 w-full"
            />
          </div>

          <div className="text-muted-foreground flex items-center justify-center gap-2 text-sm leading-[1.1]">
            <InfoCircledIcon className="size-5 min-w-max" />
            <p>Hold or right click on the image to save.</p>
          </div>
        </div>

        <div className="flex w-96 flex-col gap-4">
          <h2 className="text-xl font-semibold">Content Slide</h2>

          <div className="relative">
            <ContentSlide>{children}</ContentSlide>
            <div className="absolute top-0 left-0 z-10 flex h-full w-full items-center justify-center gap-2 bg-black/50 text-white">
              <LoaderCircle className="animate-spin" />
              Rendering
            </div>
            <img
              id="content-slide-image"
              className="absolute top-0 left-0 z-20 w-full"
            />
          </div>

          <div className="text-muted-foreground flex items-center justify-center gap-2 text-sm leading-[1.1]">
            <InfoCircledIcon className="size-5 min-w-max" />
            <p>Hold or right click on the image to save.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
