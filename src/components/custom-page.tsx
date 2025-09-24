import { useState } from "react";
import { useLayoutState } from "~/lib/layout-state";
import { FormItem, FormLabel } from "./options-form";
import {
  ChevronRightIcon,
  FileIcon,
  TextAlignCenterIcon,
} from "@radix-ui/react-icons";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { GeneratePage } from "./generate-page";
import { Button } from "./ui/button";

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result?.toString() ?? "");
    reader.onerror = reject;
  });
}

export function CustomPage() {
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [title, setTitle] = useState("Lorem Ipsum");
  const [articleByline, setArticleByline] = useState("Lorem Ipsum");
  const [imageByline, setImageByline] = useState("Lorem Ipsum");

  const [content, setContent] = useState("Lorem Ipsum");
  const [imageURI, setImageURI] = useState<string | undefined>();

  if (hasSubmitted) {
    return (
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
    );
  } else {
    return (
      <form
        className="flex max-w-[416px] grow flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setHasSubmitted(true);
        }}
      >
        <h2 className="text-xl font-semibold">Custom Article</h2>

        <FormItem>
          <TextAlignCenterIcon className="size-5 min-w-max" />
          <FormLabel>Title Content</FormLabel>
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </FormItem>

        <FormItem>
          <TextAlignCenterIcon className="size-5 min-w-max" />
          <FormLabel>Article Byline</FormLabel>
          <Input
            type="text"
            value={articleByline}
            onChange={(e) => setArticleByline(e.target.value)}
          />
        </FormItem>

        <FormItem>
          <TextAlignCenterIcon className="size-5 min-w-max" />
          <FormLabel>Image Byline</FormLabel>
          <Input
            type="text"
            value={imageByline}
            onChange={(e) => setImageByline(e.target.value)}
          />
        </FormItem>

        <FormItem>
          <FileIcon className="size-5 min-w-max" />
          <FormLabel>Image Upload</FormLabel>
          <Input
            type="file"
            onChange={(e) => {
              if (e.target.files?.length !== 1) return;
              fileToBase64(e.target.files[0]).then((uri) => setImageURI(uri));
            }}
          />
        </FormItem>

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Article Content"
          className="h-64 w-full"
        />

        <Button type="submit">
          Next Step
          <ChevronRightIcon />
        </Button>
      </form>
    );
  }
}
