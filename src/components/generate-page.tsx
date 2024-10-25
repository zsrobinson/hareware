import { DownloadIcon } from "@radix-ui/react-icons";
import download from "downloadjs";
import { toPng } from "html-to-image";
import { useEffect, type ReactNode } from "react";
import { useLayoutState } from "~/lib/layout-state";
import { ContentSlide } from "./content-slide";
import { OptionsForm } from "./options-form";
import { TitleSlide } from "./title-slide";
import { Button } from "./ui/button";

export function GeneratePage({
  defaultTitleContent,
  defaultAuthorContent,
  imageURI,
  children,
}: {
  defaultTitleContent: string;
  defaultAuthorContent: string;
  imageURI: string;
  children: ReactNode;
}) {
  const state = useLayoutState();

  useEffect(() => {
    state.setTitleContent(defaultTitleContent);
    state.setAuthorContent(defaultAuthorContent);
  }, []);

  return (
    <div className="flex flex-col items-start gap-8 md:flex-row">
      <OptionsForm />

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
            <DownloadIcon className="mr-2" />
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
            <DownloadIcon className="mr-2" />
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}
