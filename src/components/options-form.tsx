import {
  ProportionsIcon,
  ExternalLinkIcon,
  ImageIcon,
  InfoIcon,
  BlendIcon,
  RefreshCwIcon,
  ScalingIcon,
  LayersIcon,
  AlignCenterIcon,
  SkipForwardIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { presets } from "~/lib/color-presets";
import { useLayoutState } from "~/lib/layout-state";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";

/* base ui's slider may answer a tuple; every slider here has one thumb */
function toSingle(value: number | readonly number[]) {
  return typeof value === "number" ? value : value[0];
}

/* what the closed selects show, matching their menus */
const PRESETS = [
  { value: "maroon", label: "Maroon" },
  { value: "pink", label: "Pink" },
  { value: "pinkOld", label: "Pink (old)" },
  { value: "white", label: "White" },
  { value: "custom", label: "Custom" },
];
const RATIOS = ["1/1", "4/5", "3/4", "9/16"].map((value) => ({
  value,
  label: value.replace("/", ":"),
}));

export function FormItem({ children }: { children: ReactNode }) {
  return <div className="flex h-9 items-center gap-2">{children}</div>;
}

export function FormLabel({ children }: { children: ReactNode }) {
  return <Label className="min-w-36">{children}</Label>;
}

export function OptionsForm({
  articleLink,
  titleOverflow = false,
}: {
  articleLink?: string;
  /** the title runs past its slide, said here too since the slide may be off-screen */
  titleOverflow?: boolean;
}) {
  const state = useLayoutState();
  const [currentPreset] = Object.entries(presets).find(
    ([_, preset]) =>
      state.textColor === preset.textColor && state.bgColor === preset.bgColor,
  ) ?? ["custom"];

  return (
    <div className="max-w-[416px] grow">
      <div className="flex grow flex-col gap-2">
        <FormItem>
          <LayersIcon className="size-5 min-w-max" />
          <FormLabel>Preset</FormLabel>
          <Select
            value={currentPreset}
            items={PRESETS}
            onValueChange={(value) => {
              if (
                typeof value === "string" &&
                Object.keys(presets).includes(value)
              ) {
                const preset = presets[value as keyof typeof presets];
                state.setTextColor(preset.textColor);
                state.setBgColor(preset.bgColor);
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="maroon">Maroon</SelectItem>
                <SelectItem value="pink">Pink</SelectItem>
                <SelectItem value="pinkOld">Pink (old)</SelectItem>
                <SelectItem value="white">White</SelectItem>
                <SelectItem value="custom" disabled>
                  Custom
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </FormItem>

        <FormItem>
          <BlendIcon className="size-5 min-w-max" />
          <FormLabel>Text color</FormLabel>
          <Input
            type="color"
            value={state.textColor}
            onChange={(e) => state.setTextColor(e.target.value)}
          />
        </FormItem>

        <FormItem>
          <BlendIcon className="size-5 min-w-max" />
          <FormLabel>Background color</FormLabel>
          <Input
            type="color"
            value={state.bgColor}
            onChange={(e) => state.setBgColor(e.target.value)}
          />
        </FormItem>

        <FormItem>
          <ProportionsIcon className="size-5 min-w-max" />
          <FormLabel>Aspect ratio</FormLabel>
          <Select
            value={state.ratio}
            items={RATIOS}
            onValueChange={(value) => value && state.setRatio(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="1/1">1:1</SelectItem>
                <SelectItem value="4/5">4:5</SelectItem>
                <SelectItem value="3/4">3:4</SelectItem>
                <SelectItem value="9/16">9:16</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </FormItem>
      </div>

      <hr className="my-4" />

      <div className="flex flex-col gap-2">
        <FormItem>
          <AlignCenterIcon className="size-5 min-w-max" />
          <FormLabel>Title</FormLabel>
          <Input
            type="text"
            value={state.title}
            onChange={(e) => state.setTitle(e.target.value)}
          />
        </FormItem>

        <FormItem>
          <ScalingIcon className="size-5 min-w-max" />
          <FormLabel>Title size</FormLabel>
          <Slider
            value={[state.titleSize]}
            onValueChange={(value) => state.setTitleSize(toSingle(value))}
            min={16}
            max={48}
            step={1}
          />
          <p className="font-mono text-sm">{state.titleSize}px</p>
        </FormItem>
        {titleOverflow && (
          <p className="text-destructive pl-7 text-sm">
            The title may not fit; try a smaller size or a shorter title.
          </p>
        )}
      </div>

      <hr className="my-4" />

      <div className="flex flex-col gap-2">
        <FormItem>
          <AlignCenterIcon className="size-5 min-w-max" />
          <FormLabel>Article byline</FormLabel>
          <Input
            type="text"
            value={state.articleByline}
            onChange={(e) => state.setArticleByline(e.target.value)}
          />
        </FormItem>

        <FormItem>
          <AlignCenterIcon className="size-5 min-w-max" />
          <FormLabel>Image byline</FormLabel>
          <Input
            type="text"
            value={state.imageByline}
            onChange={(e) => state.setImageByline(e.target.value)}
          />
        </FormItem>

        <FormItem>
          <ScalingIcon className="size-5 min-w-max" />
          <FormLabel>Byline size</FormLabel>
          <Slider
            value={[state.bylineSize]}
            onValueChange={(value) => state.setBylineSize(toSingle(value))}
            min={12}
            max={24}
            step={1}
          />
          <p className="font-mono text-sm">{state.bylineSize}px</p>
        </FormItem>
      </div>

      <hr className="my-4" />

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => state.reset()}
          >
            <RefreshCwIcon className="mr-2" />
            Reset options
          </Button>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => state.incParagraphShift()}
          >
            <SkipForwardIcon className="mr-2" />
            Shift paragraph
          </Button>
        </div>

        {articleLink && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="w-full"
              render={<a href={articleLink} target="_blank" />}
            >
              <ExternalLinkIcon className="mr-2" />
              View original article
            </Button>
          </div>
        )}
      </div>

      <div className="text-muted-foreground my-4 flex items-center gap-2 text-sm leading-[1.1]">
        <InfoIcon className="size-5 min-w-max" />
        <p>The title and bylines take HTML: &lt;br&gt; breaks a line.</p>
      </div>

      <hr className="my-4" />

      <FormItem>
        <ImageIcon className="size-5 min-w-max" />
        <FormLabel>Save as images</FormLabel>
        <Switch
          checked={state.renderImages}
          onCheckedChange={(checked) => state.setRenderImages(checked)}
        />
      </FormItem>

      <div className="text-muted-foreground flex items-center gap-2 pl-7 text-sm leading-[1.1]">
        <p>Turn off only if the slides look wrong; then take a screenshot.</p>
      </div>
    </div>
  );
}
