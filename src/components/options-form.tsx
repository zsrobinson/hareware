import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  ExternalLinkIcon,
  HeightIcon,
  InfoCircledIcon,
  MoveIcon,
  OpacityIcon,
  ReloadIcon,
  SizeIcon,
  StackIcon,
  TextAlignCenterIcon,
  TrackNextIcon,
  WidthIcon,
} from "@radix-ui/react-icons";
import type { ReactNode } from "react";
import { presets } from "~/lib/color-presets";
import { useLayoutState } from "~/lib/layout-state";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Slider } from "./ui/slider";

export function FormItem({ children }: { children: ReactNode }) {
  return <div className="flex h-9 items-center gap-2">{children}</div>;
}

export function FormLabel({ children }: { children: ReactNode }) {
  return <Label className="min-w-36">{children}</Label>;
}

export function OptionsForm({ articleLink }: { articleLink?: string }) {
  const state = useLayoutState();
  const [animate] = useAutoAnimate();
  const [currentPreset] = Object.entries(presets).find(
    ([_, preset]) =>
      state.textColor === preset.textColor && state.bgColor === preset.bgColor,
  ) ?? ["custom"];

  return (
    <div className="max-w-[416px] grow">
      <div className="flex grow flex-col gap-2">
        <FormItem>
          <StackIcon className="size-5 min-w-max" />
          <FormLabel>Preset</FormLabel>
          <Select
            value={currentPreset}
            onValueChange={(value) => {
              if (Object.keys(presets).includes(value)) {
                const preset = presets[value as keyof typeof presets];
                state.setTextColor(preset.textColor);
                state.setBgColor(preset.bgColor);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="maroon">Maroon</SelectItem>
              <SelectItem value="pink">Pink</SelectItem>
              <SelectItem value="white">White</SelectItem>
              <SelectItem value="custom" disabled>
                Custom
              </SelectItem>
            </SelectContent>
          </Select>
        </FormItem>

        <FormItem>
          <OpacityIcon className="size-5 min-w-max" />
          <FormLabel>Text Color</FormLabel>
          <Input
            type="color"
            value={state.textColor}
            onChange={(e) => state.setTextColor(e.target.value)}
          />
        </FormItem>

        <FormItem>
          <OpacityIcon className="size-5 min-w-max" />
          <FormLabel>Background Color</FormLabel>
          <Input
            type="color"
            value={state.bgColor}
            onChange={(e) => state.setBgColor(e.target.value)}
          />
        </FormItem>
      </div>

      <hr className="my-4" />

      <div className="flex flex-col gap-2">
        <FormItem>
          <TextAlignCenterIcon className="size-5 min-w-max" />
          <FormLabel>Title Content</FormLabel>
          <Input
            type="text"
            value={state.title}
            onChange={(e) => state.setTitle(e.target.value)}
          />
        </FormItem>

        <FormItem>
          <SizeIcon className="size-5 min-w-max" />
          <FormLabel>Title Size</FormLabel>
          <Slider
            value={[state.titleSize]}
            onValueChange={(value) => state.setTitleSize(value.at(0)!)}
            min={16}
            max={48}
            step={1}
          />
          <p className="font-mono text-sm">{state.titleSize}px</p>
        </FormItem>
      </div>

      <hr className="my-4" />

      <div className="flex flex-col gap-2">
        <FormItem>
          <TextAlignCenterIcon className="size-5 min-w-max" />
          <FormLabel>Article Byline</FormLabel>
          <Input
            type="text"
            value={state.articleByline}
            onChange={(e) => state.setArticleByline(e.target.value)}
          />
        </FormItem>

        <FormItem>
          <TextAlignCenterIcon className="size-5 min-w-max" />
          <FormLabel>Image Byline</FormLabel>
          <Input
            type="text"
            value={state.imageByline}
            onChange={(e) => state.setImageByline(e.target.value)}
          />
        </FormItem>

        <FormItem>
          <SizeIcon className="size-5 min-w-max" />
          <FormLabel>Byline Size</FormLabel>
          <Slider
            value={[state.bylineSize]}
            onValueChange={(value) => state.setBylineSize(value.at(0)!)}
            min={12}
            max={24}
            step={1}
          />
          <p className="font-mono text-sm">{state.bylineSize}px</p>
        </FormItem>
      </div>

      <hr className="my-4" />

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => state.reset()}
          >
            <ReloadIcon className="mr-2" />
            Reset Options
          </Button>

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              const slot = document.querySelector("#content-slide astro-slot")!;
              if (!slot.firstChild) return;
              slot.removeChild(slot.firstChild);
            }}
          >
            <TrackNextIcon className="mr-2" />
            Shift Paragraph
          </Button>
        </div>

        {articleLink && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => state.reset()}
              asChild
            >
              <a href={articleLink} target="_blank">
                <ExternalLinkIcon className="mr-2" />
                View Original Article
              </a>
            </Button>
          </div>
        )}
      </div>
      <div className="text-muted-foreground my-4 flex items-center gap-2 text-sm leading-[1.1]">
        <InfoCircledIcon className="size-5 min-w-max" />
        <p>
          HTML tags are supported in the Title Content and Byline fields. If
          needed, try adding a "&lt;br&gt;" tag to manually trigger a line
          break.
        </p>
      </div>
    </div>
  );
}
