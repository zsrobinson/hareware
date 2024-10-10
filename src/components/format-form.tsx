import download from "downloadjs";
import { toPng } from "html-to-image";
import { useEffect, useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  textSizeSchema,
  themeSchema,
  type TextSize,
  type Theme,
} from "~/lib/types";
import { ContentSlide, TitleSlide } from "./slides";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function FormatForm({
  title,
  author,
  imageURI,
  children,
}: {
  title: string;
  author?: string;
  imageURI: string;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>("white");
  const [titleSize, setTitleSize] = useState<TextSize>("2xl");

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
  }, [theme, titleSize]);

  return (
    <>
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Label>Title</Label>
          <Input value={title} className="w-full max-w-md" disabled />
        </div>

        <div className="flex items-center gap-2">
          <Label>Author</Label>
          <Input value={author} className="w-full max-w-md" disabled />
        </div>
      </div>

      <br />

      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Label>Theme</Label>
          <Select
            value={theme}
            onValueChange={(input) => {
              const { data } = themeSchema.safeParse(input);
              if (data) setTheme(data);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="white">White</SelectItem>
              <SelectItem value="maroon">Maroon</SelectItem>
              <SelectItem value="pink">Pink</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label>Title Size</Label>
          <Select
            value={titleSize}
            onValueChange={(input) => {
              const { data } = textSizeSchema.safeParse(input);
              if (data) setTitleSize(data);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="xl">Small</SelectItem>
              <SelectItem value="2xl">Regular</SelectItem>
              <SelectItem value="3xl">Large</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <br />

      <div className="flex min-w-max max-w-fit flex-col gap-4 lg:flex-row">
        <div className="flex flex-col items-center gap-4 rounded-xl bg-zinc-100 p-4">
          <TitleSlide
            title={title}
            author={author}
            imageURI={imageURI}
            theme={theme}
            titleSize={titleSize}
          />
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
    </>
  );
}
