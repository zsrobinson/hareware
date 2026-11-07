import { useState } from "react";
import { FormItem, FormLabel } from "./options-form";
import {
  AlignCenterIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileIcon,
} from "lucide-react";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { GeneratePage } from "./generate-page";
import { Button } from "./ui/button";

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
          <ChevronLeftIcon /> Edit the text
        </Button>
        <GeneratePage
          defaultTitle={title}
          defaultArticleByline={articleByline}
          defaultImageByline={imageByline}
          articleLink={""}
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
      className="flex max-w-[416px] grow flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setHasSubmitted(true);
      }}
    >
      <FormItem>
        <AlignCenterIcon className="size-5 min-w-max" />
        <FormLabel>Title</FormLabel>
        <Input
          type="text"
          value={title}
          placeholder="The article's title"
          onChange={(e) => setTitle(e.target.value)}
        />
      </FormItem>

      <FormItem>
        <AlignCenterIcon className="size-5 min-w-max" />
        <FormLabel>Article byline</FormLabel>
        <Input
          type="text"
          value={articleByline}
          placeholder="Who wrote it"
          onChange={(e) => setArticleByline(e.target.value)}
        />
      </FormItem>

      <FormItem>
        <AlignCenterIcon className="size-5 min-w-max" />
        <FormLabel>Image byline</FormLabel>
        <Input
          type="text"
          value={imageByline}
          placeholder="Who made the image"
          onChange={(e) => setImageByline(e.target.value)}
        />
      </FormItem>

      <FormItem>
        <FileIcon className="size-5 min-w-max" />
        <FormLabel>Image</FormLabel>
        <Input
          type="file"
          accept="image/*"
          className="text-muted-foreground"
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
      </FormItem>
      {imageError && (
        <p className="text-destructive pl-7 text-sm">
          That file couldn't be read as an image.
        </p>
      )}
      {imageURI && (
        <img
          src={imageURI}
          alt=""
          className="ml-auto max-h-32 w-fit rounded-md border object-contain"
        />
      )}

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="The article's text. Leave a blank line between paragraphs."
        className="h-64 w-full"
      />

      <Button type="submit">
        Make the slides
        <ChevronRightIcon />
      </Button>
    </form>
  );
}
