import { useAutoAnimate } from "@formkit/auto-animate/react";
import { TriangleAlertIcon, InfoIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLayoutState } from "~/lib/layout-state";
import { useDebouncedEffect } from "~/lib/use-debounced-effect";
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
  imageURI?: string;
  children: ReactNode;
}) {
  const state = useLayoutState();
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [animate] = useAutoAnimate();

  const titleSlideRef = useRef<HTMLDivElement>(null);
  const contentSlideRef = useRef<HTMLDivElement>(null);
  const titleSlideImgRef = useRef<HTMLImageElement>(null);
  const contentSlideImgRef = useRef<HTMLImageElement>(null);

  // on layout change, clear previous images
  useEffect(() => {
    if (state.renderImages) {
      titleSlideImgRef.current!.src = "";
      contentSlideImgRef.current!.src = "";
    }
  }, [state]);

  // on layout change, generate new images. the renderer is imported here so
  // it does not delay hydration
  useDebouncedEffect(
    () => {
      if (!state.renderImages) return;

      let cancelled = false;

      void (async () => {
        const { domToPng } = await import("modern-screenshot");
        if (cancelled) return;

        const titleNode = titleSlideRef.current;
        const contentNode = contentSlideRef.current;
        if (!titleNode || !contentNode) return; // unmounted while importing

        const [titleURI, contentURI] = await Promise.all([
          domToPng(titleNode, { scale: 4 }),
          domToPng(contentNode, { scale: 4 }),
        ]);
        if (cancelled) return;

        // unmounting mid-render nulls these without setting `cancelled`
        if (titleSlideImgRef.current) titleSlideImgRef.current.src = titleURI;
        if (contentSlideImgRef.current)
          contentSlideImgRef.current.src = contentURI;
      })().catch((error: unknown) => {
        console.error("could not render the slides", error);
      });

      // a newer layout supersedes whatever this run was about to paint
      return () => {
        cancelled = true;
      };
    },
    300,
    [state],
  );

  // set the title and bylines on mount and clear them on unmount: the store
  // outlives this island across client-side navigation
  useEffect(() => {
    state.setTitle(defaultTitle);
    state.setArticleByline(defaultArticleByline);
    state.setImageByline(defaultImageByline);

    return () => useLayoutState.getState().clearArticle();
    /* mount only: after that the store holds the member's edits */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // on layout change, check if title slide is overflowing
  useEffect(() => {
    const slide = titleSlideRef.current!;
    setIsOverflowing(slide.scrollHeight > slide.clientHeight);
  }, [state]);

  return (
    <div className="flex flex-col items-start gap-8 md:flex-row">
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Layout Options</h2>
        <OptionsForm articleLink={articleLink} />
      </div>

      <div className="flex flex-wrap items-start gap-8">
        <div className="mr-4 flex w-96 flex-col gap-4">
          <div className="flex justify-between" ref={animate}>
            <h2 className="text-xl font-semibold">Title Slide</h2>
            {isOverflowing && (
              <div className="flex items-center gap-2 text-sm font-medium text-red-500">
                <TriangleAlertIcon className="mt-0.5" />
                <span>Content may be overflowing</span>
              </div>
            )}
          </div>

          <div className="relative">
            <TitleSlide imageURI={imageURI} ref={titleSlideRef} />
            {state.renderImages && (
              <>
                <div className="absolute top-0 left-0 z-10 flex h-full w-full items-center justify-center gap-2 bg-black/50 text-white">
                  <LoaderCircle className="animate-spin" />
                  Rendering
                </div>
                <img
                  className="absolute top-0 left-0 z-20 w-full"
                  ref={titleSlideImgRef}
                />
              </>
            )}
          </div>

          <div className="text-muted-foreground flex items-center justify-center gap-2 text-sm leading-[1.1]">
            <InfoIcon className="size-5 min-w-max" />
            {state.renderImages ? (
              <p>Hold or right click the image to save.</p>
            ) : (
              <p>Screenshot the image to save.</p>
            )}
          </div>
        </div>

        <div className="flex w-96 flex-col gap-4">
          <h2 className="text-xl font-semibold">Content Slide</h2>

          <div className="relative">
            <ContentSlide ref={contentSlideRef}>{children}</ContentSlide>
            {state.renderImages && (
              <>
                <div className="absolute top-0 left-0 z-10 flex h-full w-full items-center justify-center gap-2 bg-black/50 text-white">
                  <LoaderCircle className="animate-spin" />
                  Rendering
                </div>
                <img
                  className="absolute top-0 left-0 z-20 w-full"
                  ref={contentSlideImgRef}
                />
              </>
            )}
          </div>

          <div className="text-muted-foreground flex items-center justify-center gap-2 text-sm leading-[1.1]">
            <InfoIcon className="size-5 min-w-max" />
            {state.renderImages ? (
              <p>Hold or right click the image to save.</p>
            ) : (
              <p>Screenshot the image to save.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
