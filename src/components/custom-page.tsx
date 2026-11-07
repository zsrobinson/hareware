import { useState } from "react";
import { ChevronLeftIcon, ImageIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { GeneratePage } from "./generate-page";
import { Button, buttonVariants } from "./ui/button";

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

  const field = (
    label: string,
    value: string,
    set: (value: string) => void,
    placeholder: string,
  ) => (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Input
        value={value}
        required={label === "Title"}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );

  return (
    <form
      className="max-w-2xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setHasSubmitted(true);
      }}
    >
      {field("Title", title, setTitle, "The article's title")}
      {field("Article byline", articleByline, setArticleByline, "Who wrote it")}
      {field("Image byline", imageByline, setImageByline, "Who made the image")}

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Image</span>
        <div className="flex items-center gap-3">
          {/* the native chooser crowds a phone, so a button stands in for it */}
          <label
            className={cn(
              buttonVariants({ variant: "outline" }),
              "cursor-pointer has-[:focus-visible]:ring-2",
            )}
          >
            <ImageIcon />
            {imageURI ? "Change image" : "Choose image"}
            <input
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
              className="h-12 w-auto rounded-md border object-contain"
            />
          )}
        </div>
        {imageError && (
          <p className="text-destructive text-sm">
            That file couldn't be read as an image.
          </p>
        )}
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Text</span>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="The article's text. Leave a blank line between paragraphs."
          className="h-64 w-full"
        />
      </label>

      <Button type="submit">Make slides</Button>
    </form>
  );
}
