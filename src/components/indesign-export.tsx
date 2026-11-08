/*
  InDesign Export, read in the browser (ADR 0012): a static page whose island
  reads `?article=`, asks WordPress for the article, and builds the tagged text
  here.
*/

import {
  CameraIcon,
  DownloadIcon,
  HeadingIcon,
  ImageIcon,
  PenLineIcon,
  PilcrowIcon,
  type LucideIcon,
} from "lucide-react";
import { getTaggedText } from "~/lib/get-tagged-text";
import { saveFile } from "~/lib/save-file";
import {
  PREVIEW_IMAGE_WIDTH,
  toOriginalImage,
  toSizedImage,
} from "~/lib/services/wordpress/image-url";
import type { scrapeArticle } from "~/lib/services/wordpress/scrape-article";
import { slugify } from "~/lib/utils";
import { ArticleLink } from "./article-link";
import { CopyButton } from "./copy-button";
import { FieldNote, FieldRow, FieldRows } from "./field-row";
import { Reading } from "./read-state";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { useArticleFromAddress } from "./use-article";

type Article = Awaited<ReturnType<typeof scrapeArticle>>;

export function InDesignExport() {
  const { typed, reading, article, error } = useArticleFromAddress();

  return (
    <div className="space-y-6">
      <ArticleLink
        action="/magazine"
        verb="Load article"
        typed={typed}
        link={article?.link}
        error={error}
      />

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
    <FieldRows>
      <Copyable
        icon={HeadingIcon}
        label="Title"
        id="title"
        value={title}
        long
      />
      <Copyable
        icon={PenLineIcon}
        label="Article byline"
        id="article-by"
        value={[
          section?.toUpperCase(),
          author ? `Article by ${author}\t${date}` : date,
        ]
          .filter(Boolean)
          .join(" | ")}
        long
      />
      <Copyable
        icon={CameraIcon}
        label="Image byline"
        id="image-by"
        value={imageCredits ? `Image by ${imageCredits}` : ""}
        empty="No image credit on the article"
      />

      <FieldRow icon={ImageIcon} label="Image" top>
        {image ? (
          <div className="flex flex-col items-start gap-2.5">
            <img
              src={toSizedImage(image, PREVIEW_IMAGE_WIDTH)}
              alt=""
              className="bg-secondary max-h-56 w-auto max-w-full rounded-lg object-contain sm:max-w-80"
            />
            <Button
              variant="outline"
              onClick={() => void downloadImage(toOriginalImage(image))}
            >
              <DownloadIcon />
              Download image
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm sm:pt-1.5">
            No featured image.
          </p>
        )}
      </FieldRow>

      <FieldRow icon={PilcrowIcon} label="Text">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => saveFile(output, `${name}.txt`, "text/plain")}
          >
            <DownloadIcon />
            Download text
          </Button>
          <span className="text-muted-foreground text-xs">
            Then File → Place
          </span>
        </div>
      </FieldRow>
      {unprocessed.size > 0 && (
        <FieldNote>
          Some formatting won't carry over (
          {[...unprocessed].map((tag) => tag.toLowerCase()).join(", ")}); check
          those parts by hand.
        </FieldNote>
      )}
    </FieldRows>
  );
}

/* a read-only value with a copy button beside it */
function Copyable({
  icon,
  label,
  id,
  value,
  empty,
  long = false,
}: {
  icon: LucideIcon;
  label: string;
  id: string;
  value: string;
  /** said in the field when there is nothing to copy */
  empty?: string;
  /** wraps rather than scrolling sideways or cutting off on a phone */
  long?: boolean;
}) {
  return (
    <FieldRow
      icon={icon}
      label={label}
      htmlFor={id}
      top={long}
      action={
        value ? (
          <CopyButton id={id} what={label.toLowerCase()} />
        ) : (
          /* holds the column, so this field ends where the others do */
          <span className="size-8" />
        )
      }
    >
      {long ? (
        <Textarea
          id={id}
          value={value}
          rows={2}
          className="min-h-0 resize-none"
          readOnly
        />
      ) : (
        <Input type="text" value={value} placeholder={empty} id={id} readOnly />
      )}
    </FieldRow>
  );
}
