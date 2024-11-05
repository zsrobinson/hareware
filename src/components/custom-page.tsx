import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  DownloadIcon,
  ExclamationTriangleIcon,
  FileIcon,
} from "@radix-ui/react-icons";
import download from "downloadjs";
import { toPng } from "html-to-image";
import { useEffect, useState } from "react";
import { useLayoutState } from "~/lib/layout-state";
import { longLoremIpsum } from "~/lib/lorem";
import { ContentSlide } from "./content-slide";
import { FormItem, FormLabel, OptionsForm } from "./options-form";
import { TitleSlide } from "./title-slide";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result?.toString() ?? "");
    reader.onerror = reject;
  });
}

export function CustomPage() {
  const state = useLayoutState();
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [animate] = useAutoAnimate();

  const [content, setContent] = useState(longLoremIpsum);
  const [imageFile, setImageFile] = useState<File | undefined>();
  const [imageURI, setImageURI] = useState<string | undefined>();

  useEffect(() => {
    state.setTitleContent("Lorem Ipsum");
    state.setAuthorContent("Article by Lorem Ipsum");
  }, []);

  useEffect(() => {
    const titleSlide = document.getElementById("title-slide")!;
    setIsOverflowing(titleSlide.scrollHeight > titleSlide.clientHeight);
  }, [state]);

  useEffect(() => {
    if (!imageFile) return setImageURI("");
    fileToBase64(imageFile).then((uri) => setImageURI(uri));
  }, [imageFile]);

  return (
    <div className="flex flex-col items-start gap-8 md:flex-row">
      <OptionsForm />

      <div className="w-[416px] min-w-max shrink-0">
        <div className="flex flex-grow flex-col gap-2">
          <FormItem>
            <FileIcon className="size-5 min-w-max" />
            <FormLabel>Image Upload</FormLabel>
            <Input
              type="file"
              onChange={(e) => {
                if (e.target.files?.length !== 1) return;
                setImageFile(e.target.files[0]);
                console.log("new image file: " + e.target.files[0].name);
              }}
            />
          </FormItem>

          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Article Content"
            className="h-64 w-full"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-8">
        <div className="flex flex-col items-center gap-4 rounded-xl border bg-secondary p-4 dark:bg-primary-foreground">
          <TitleSlide imageURI={imageURI ?? ""} />
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

        <div className="flex flex-col items-center gap-4 rounded-xl border bg-secondary p-4 dark:bg-primary-foreground">
          <ContentSlide>
            {content.split("\n\n").map((para, i) => (
              <p dangerouslySetInnerHTML={{ __html: para }} key={i} />
            ))}
          </ContentSlide>

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
