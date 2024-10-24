import download from "downloadjs";
import { toPng } from "html-to-image";
import { useEffect, type ReactNode } from "react";
import { ContentSlide } from "./content-slide";
import { AuthorForm, useAuthorState } from "./forms/author-form";
import { BackgroundForm, useBackgroundState } from "./forms/background-form";
import { LogoForm, useLogoState } from "./forms/logo-form";
import { PresetForm, presets } from "./forms/preset-form";
import { TitleForm, useTitleState } from "./forms/title-form";
import { TitleSlide } from "./title-slide";
import { Button } from "./ui/button";

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

  return (
    <div className="flex flex-col items-start gap-8 md:flex-row">
      <div className="flex min-w-max max-w-sm flex-col gap-8">
        <PresetForm />
        <TitleForm />
        <AuthorForm />
        <LogoForm />
        <BackgroundForm />
      </div>

      <div className="flex flex-wrap items-start gap-8">
        <div className="flex flex-col items-center gap-4 rounded-xl bg-zinc-100 p-4">
          <TitleSlide imageURI={imageURI} />
          <Button
            variant="outline"
            id="title-slide-download"
            onClick={() => {
              const titleSlide = document.getElementById("title-slide")!;
              new Promise((res) => setTimeout(res, 500)).then(() =>
                toPng(titleSlide, {
                  canvasHeight: 1000,
                  canvasWidth: 1000,
                }).then((dataURI) => {
                  download(dataURI, "title-slide.png");
                }),
              );
            }}
          >
            Download
          </Button>
        </div>

        <div className="flex flex-col items-center gap-4 rounded-xl bg-zinc-100 p-4">
          <ContentSlide>{children}</ContentSlide>
          <Button
            variant="outline"
            id="content-slide-download"
            onClick={() => {
              const contentSlide = document.getElementById("content-slide")!;
              new Promise((res) => setTimeout(res, 500)).then(() =>
                toPng(contentSlide, {
                  canvasHeight: 1000,
                  canvasWidth: 1000,
                }).then((dataURI) => {
                  download(dataURI, "content-slide.png");
                }),
              );
            }}
          >
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}
