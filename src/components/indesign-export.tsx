/*
  InDesign Export, read in the browser (ADR 0012): a static page whose island
  reads `?article=`, asks WordPress for the article, and builds the tagged text
  here. The layout is the one the page had when the Worker rendered it.
*/

import { DownloadIcon } from "lucide-react";
import { getTaggedText } from "~/lib/get-tagged-text";
import { saveFile } from "~/lib/save-file";
import {
  PREVIEW_IMAGE_WIDTH,
  toOriginalImage,
  toSizedImage,
} from "~/lib/services/wordpress/image-url";
import type { scrapeArticle } from "~/lib/services/wordpress/scrape-article";
import { slugify } from "~/lib/utils";
import { CopyButton } from "./copy-button";
import { Reading } from "./read-state";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useArticleFromAddress } from "./use-article";

type Article = Awaited<ReturnType<typeof scrapeArticle>>;

export function InDesignExport() {
  const { typed, reading, article, error } = useArticleFromAddress();

  return (
    <div className="space-y-6">
      <form action="/magazine" className="flex gap-2">
        <Input
          /* remounted once the article is read, to show its full link */
          key={article?.link ?? "typed"}
          type="text"
          name="article"
          placeholder="Paste an article link"
          aria-label="Article link"
          defaultValue={article?.link ?? typed}
          aria-invalid={error ? true : undefined}
        />
        <Button type="submit">Open article</Button>
      </form>

      {error && <p className="text-destructive -mt-4 text-sm">{error}</p>}

      {reading && <Reading>Reading the article…</Reading>}

      {article && <Fields article={article} />}
    </div>
  );
}

function Fields({ article }: { article: Article }) {
  const { title, author, image, imageCredits, section, date, body } = article;
  const { output, unprocessed } = getTaggedText(body);
  const name = slugify(title);

  const downloadImage = (src: string) =>
    /* the image host allows a cross-origin fetch, so the file downloads under
       the article's name; if it does not, it opens to save by hand */
    fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`answered ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
        saveFile(blob, `${name}.${ext}`, blob.type);
      })
      .catch((thrown: unknown) => {
        console.error("could not download the image", thrown);
        window.open(src, "_blank", "noreferrer");
      });

  return (
    <div className="space-y-4">
      <Field label="Title" id="title" value={title} />
      <Field
        label="Section, byline and date"
        id="article-by"
        value={[
          section?.toUpperCase(),
          author ? `Article by ${author}\t${date}` : date,
        ]
          .filter(Boolean)
          .join(" | ")}
      />
      <Field
        label="Image byline"
        id="image-by"
        value={imageCredits ? `Image by ${imageCredits}` : ""}
        empty="No image credit on the article"
      />

      <div className="space-y-1.5">
        <span className="block text-sm font-medium">Image</span>
        {image ? (
          <>
            <img
              src={toSizedImage(image, PREVIEW_IMAGE_WIDTH)}
              alt=""
              className="bg-secondary max-h-56 w-auto max-w-full rounded-md object-contain"
            />
            <Button
              variant="outline"
              onClick={() => void downloadImage(toOriginalImage(image))}
            >
              <DownloadIcon />
              Download image
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">No featured image.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <span className="block text-sm font-medium">Text</span>
        <Button
          variant="outline"
          onClick={() => saveFile(output, `${name}.txt`, "text/plain")}
        >
          <DownloadIcon />
          Download text for InDesign
        </Button>
        <p className="text-muted-foreground text-sm">
          In InDesign, use File → Place with this file, then check the result
          against the article.
        </p>
        {unprocessed.size > 0 && (
          <p className="text-muted-foreground text-sm">
            Some formatting won't carry over (
            {[...unprocessed].map((tag) => tag.toLowerCase()).join(", ")});
            check those parts by hand.
          </p>
        )}
      </div>
    </div>
  );
}

/* a read-only value with its label above and a copy button beside it */
function Field({
  label,
  id,
  value,
  empty,
}: {
  label: string;
  id: string;
  value: string;
  /** said in the field when there is nothing to copy */
  empty?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <Input type="text" value={value} placeholder={empty} id={id} readOnly />
        {value && <CopyButton id={id} />}
      </div>
    </div>
  );
}
