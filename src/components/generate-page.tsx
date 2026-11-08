import {
  Children,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useLayoutState } from "~/lib/layout-state";
import { useDebouncedEffect } from "~/lib/use-debounced-effect";
import { ContentSlide } from "./content-slide";
import { FitWidth } from "./fit-width";
import { LoaderCircle } from "./loader-circle";
import { OptionsForm } from "./options-form";
import { TitleSlide } from "./title-slide";

/*
  The form beside the slides it shapes. A phone (or any narrow column) puts the
  slides first, as a row to swipe, since they are what the form is for; a wide
  one keeps the form at the left and the slides in view beside it.
*/
export function GeneratePage({
  defaultTitle,
  defaultArticleByline,
  defaultImageByline,
  imageURI,
  linkBar,
  children,
}: {
  defaultTitle: string;
  defaultArticleByline: string;
  defaultImageByline: string;
  imageURI?: string;
  /** the article's link and the button to read another, above the form */
  linkBar?: ReactNode;
  children: ReactNode;
}) {
  const state = useLayoutState();
  const [isOverflowing, setIsOverflowing] = useState(false);
  /* a render that fails would otherwise leave "Rendering" up for good */
  const [renderFailed, setRenderFailed] = useState(false);

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
      setRenderFailed(false);

      void (async () => {
        const { domToPng } = await import("modern-screenshot");
        if (cancelled) return;

        const titleNode = titleSlideRef.current;
        const contentNode = contentSlideRef.current;
        if (!titleNode || !contentNode) return; // unmounted while importing

        /* the slide's own size, not its size on screen: a phone shows it
           scaled down, and the saved image must not shrink with it */
        const render = (node: HTMLElement) =>
          domToPng(node, {
            scale: 4,
            width: node.offsetWidth,
            height: node.offsetHeight,
          });
        const [titleURI, contentURI] = await Promise.all([
          render(titleNode),
          render(contentNode),
        ]);
        if (cancelled) return;

        // unmounting mid-render nulls these without setting `cancelled`
        if (titleSlideImgRef.current) titleSlideImgRef.current.src = titleURI;
        if (contentSlideImgRef.current)
          contentSlideImgRef.current.src = contentURI;
      })().catch((error: unknown) => {
        console.error("could not render the slides", error);
        if (!cancelled) setRenderFailed(true);
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
    <div className="@container">
      <div className="grid grid-cols-1 items-start gap-6 @4xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] @4xl:grid-rows-[auto_1fr] @4xl:gap-x-10">
        {linkBar}

        <section
          aria-label="Slides"
          className="space-y-2 @4xl:col-start-2 @4xl:row-span-2 @4xl:row-start-1"
        >
          <div className="flex gap-4 @max-md:-mx-4 @max-md:snap-x @max-md:snap-mandatory @max-md:scroll-px-4 @max-md:overflow-x-auto @max-md:px-4">
            <Slide
              label="Title slide"
              imgRef={titleSlideImgRef}
              rendering={state.renderImages}
              failed={renderFailed}
            >
              <TitleSlide imageURI={imageURI} ref={titleSlideRef} />
            </Slide>
            <Slide
              label="Content slide"
              imgRef={contentSlideImgRef}
              rendering={state.renderImages}
              failed={renderFailed}
            >
              <ContentSlide ref={contentSlideRef}>{children}</ContentSlide>
            </Slide>
          </div>

          <p className="text-muted-foreground text-sm">
            {state.renderImages ? (
              <>
                <span className="pointer-coarse:hidden">
                  Right-click a slide to save it.
                </span>
                <span className="pointer-fine:hidden">
                  Press and hold a slide to save it.
                </span>
              </>
            ) : (
              "Take a screenshot of each slide to save it."
            )}
          </p>
        </section>

        <OptionsForm
          paragraphs={Children.count(children)}
          titleOverflow={isOverflowing}
        />
      </div>
    </div>
  );
}

/** one slide, shown to fit its column, with its saved image laid over it */
function Slide({
  label,
  imgRef,
  rendering,
  failed,
  children,
}: {
  label: string;
  imgRef: RefObject<HTMLImageElement | null>;
  rendering: boolean;
  failed: boolean;
  children: ReactNode;
}) {
  return (
    <figure
      aria-label={label}
      className="min-w-0 shrink-0 @max-md:w-[85%] @max-md:snap-start @md:max-w-96 @md:flex-1"
    >
      <FitWidth>
        <div className="relative">
          {children}
          {rendering && (
            <>
              <div className="absolute top-0 left-0 z-10 flex h-full w-full items-center justify-center gap-2 bg-black/50 text-white">
                {failed ? (
                  <span className="px-6 text-center text-sm">
                    Couldn't make the image. Turn off Slides as images and take
                    a screenshot instead.
                  </span>
                ) : (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Rendering
                  </>
                )}
              </div>
              <img className="absolute top-0 left-0 z-20 w-full" ref={imgRef} />
            </>
          )}
        </div>
      </FitWidth>
    </figure>
  );
}
