import { useState } from "react";
import {
  CameraIcon,
  ChevronLeftIcon,
  HeadingIcon,
  ImageIcon,
  PenLineIcon,
  PilcrowIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { FieldActions, FieldNote, FieldRow, FieldRows } from "./field-row";
import { GeneratePage } from "./generate-page";
import { Button, buttonVariants } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    /* typed as possibly an ArrayBuffer, whose `toString()` is not an image */
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("the file did not read as a data url"));
    reader.onerror = reject;
  });
}

export function CustomPage() {
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [title, setTitle] = useState("");
  const [articleByline, setArticleByline] = useState("");
  const [imageByline, setImageByline] = useState("");

  const [content, setContent] = useState("");
  const [imageURI, setImageURI] = useState<string | undefined>();
  const [imageError, setImageError] = useState(false);

  if (hasSubmitted) {
    return (
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground -ml-2 w-fit"
          onClick={() => setHasSubmitted(false)}
        >
          <ChevronLeftIcon /> Back to the form
        </Button>
        <GeneratePage
          defaultTitle={title}
          defaultArticleByline={articleByline}
          defaultImageByline={imageByline}
          imageURI={imageURI ?? ""}
        >
          {content.split("\n\n").map((para, i) => (
            <p dangerouslySetInnerHTML={{ __html: para }} key={i} />
          ))}
        </GeneratePage>
      </div>
    );
  }

  return (
    <form
      className="max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        setHasSubmitted(true);
      }}
    >
      <FieldRows>
        <FieldRow icon={HeadingIcon} label="Title" htmlFor="title" top>
          <Textarea
            id="title"
            rows={2}
            className="min-h-0 resize-none"
            value={title}
            required
            placeholder="The article's title"
            onChange={(e) => setTitle(e.target.value)}
          />
        </FieldRow>
        <FieldRow
          icon={PenLineIcon}
          label="Article byline"
          htmlFor="article-byline"
        >
          <Input
            id="article-byline"
            value={articleByline}
            placeholder="Who wrote it"
            onChange={(e) => setArticleByline(e.target.value)}
          />
        </FieldRow>
        <FieldRow icon={CameraIcon} label="Image byline" htmlFor="image-byline">
          <Input
            id="image-byline"
            value={imageByline}
            placeholder="Who made the image"
            onChange={(e) => setImageByline(e.target.value)}
          />
        </FieldRow>
        <FieldNote>
          <code>&lt;br&gt;</code> breaks a line in the title or bylines.
        </FieldNote>

        <FieldRow icon={ImageIcon} label="Image" htmlFor="image">
          <div className="flex items-center gap-3">
            {/* the native chooser crowds a phone, so a button stands in for it */}
            <label
              className={cn(
                buttonVariants({ variant: "outline" }),
                "cursor-pointer has-[:focus-visible]:ring-3",
              )}
            >
              {imageURI ? "Change image" : "Choose image"}
              <input
                id="image"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  setImageError(false);
                  if (e.target.files?.length !== 1) return;
                  fileToBase64(e.target.files[0])
                    .then(setImageURI)
                    .catch((error: unknown) => {
                      console.error("could not read the image", error);
                      setImageURI(undefined);
                      setImageError(true);
                    });
                }}
              />
            </label>
            {imageURI && (
              <img
                src={imageURI}
                alt=""
                className="h-8 w-auto rounded-md border object-contain"
              />
            )}
          </div>
        </FieldRow>
        {imageError && (
          <FieldNote>
            <span className="text-destructive">
              That file couldn't be read as an image.
            </span>
          </FieldNote>
        )}

        <FieldRow icon={PilcrowIcon} label="Text" htmlFor="text" top>
          <Textarea
            id="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="The article's text. Leave a blank line between paragraphs."
            className="h-64 w-full"
          />
        </FieldRow>

        <FieldActions>
          <Button type="submit">Make slides</Button>
        </FieldActions>
      </FieldRows>
    </form>
  );
}
