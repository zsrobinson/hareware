import download from "downloadjs";
import { toPng } from "html-to-image";
import { useEffect, type ReactNode } from "react";
import { ContentSlide } from "./content-slide";
import { AuthorForm, useAuthorState } from "./forms/author-form";
import { BackgroundForm, useBackgroundState } from "./forms/background-form";
import { LogoForm, useLogoState } from "./forms/logo-form";
import { TitleForm, useTitleState } from "./forms/title-form";
import { TitleSlide } from "./title-slide";
import { Button } from "./ui/button";
import { PresetForm, presets } from "./forms/preset-form";

export function GeneratePage({
  defaultTitleContent,
  defaultAuthorContent,
  imageURI,
  children,
}: {
  defaultTitleContent: string;
  defaultAuthorContent?: string;
  imageURI: string;
  children: ReactNode;
}) {
  const title = useTitleState();
  const author = useAuthorState();
  const logo = useLogoState();
  const background = useBackgroundState();
  const state = { title, author, logo, background };

  useEffect(() => {
    title.setContent(defaultTitleContent);
    author.setContent(defaultAuthorContent ?? "");

    // set default preset
    title.setState(presets["maroon"].title);
    author.setState(presets["maroon"].author);
    logo.setState(presets["maroon"].logo);
    background.setState(presets["maroon"].background);
  }, []);

  useEffect(() => {
    /* get element refs for html-to-image to use */
    const titleSlide = document.getElementById("title-slide")!;
    const contentSlide = document.getElementById("content-slide")!;
    const titleSlideDownload = document.getElementById(
      "title-slide-download",
    ) as HTMLButtonElement;
    const contentSlideDownload = document.getElementById(
      "content-slide-download",
    ) as HTMLButtonElement;

    /* default loading state (yes i could be using react state but no) */
    titleSlideDownload.innerText = "Loading...";
    titleSlideDownload.disabled = true;
    contentSlideDownload.innerText = "Loading...";
    contentSlideDownload.disabled = true;

    /* get title slide image after timeout (thanks safari) */
    new Promise((res) => setTimeout(res, 300)).then(() =>
      toPng(titleSlide, {
        canvasHeight: 1000,
        canvasWidth: 1000,
      }).then((dataURI) => {
        titleSlideDownload.innerText = "Download Title Slide";
        titleSlideDownload.onclick = () => download(dataURI, "title-slide.png");
        titleSlideDownload.disabled = false;
      }),
    );

    /* get content slide image after timeout (thanks safari) */
    new Promise((res) => setTimeout(res, 300)).then(() =>
      toPng(contentSlide, { canvasHeight: 1000, canvasWidth: 1000 }).then(
        (dataURI) => {
          contentSlideDownload.innerText = "Download Content Slide";
          contentSlideDownload.onclick = () =>
            download(dataURI, "content-slide.png");
          contentSlideDownload.disabled = false;
        },
      ),
    );
  }, [state]);

  return (
    <>
      <PresetForm />
      <br />
      <TitleForm />
      <br />
      <AuthorForm />
      <br />
      <LogoForm />
      <br />
      <BackgroundForm />
      <br />

      <div className="flex min-w-max max-w-fit flex-col gap-4 lg:flex-row">
        <div className="flex flex-col items-center gap-4 rounded-xl bg-zinc-100 p-4">
          <TitleSlide imageURI={imageURI} />
          <Button variant="outline" id="title-slide-download" disabled={true}>
            Loading...
          </Button>
        </div>

        <div className="flex flex-col items-center gap-4 rounded-xl bg-zinc-100 p-4">
          <ContentSlide>{children}</ContentSlide>
          <Button variant="outline" id="content-slide-download" disabled={true}>
            Loading...
          </Button>
        </div>
      </div>

      <pre>
        <code>{JSON.stringify(state, null, 2)}</code>
      </pre>
    </>
  );
}
