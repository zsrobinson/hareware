import {
  ALargeSmallIcon,
  BaselineIcon,
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HeadingIcon,
  ImagesIcon,
  ListStartIcon,
  PaintBucketIcon,
  PaletteIcon,
  PenLineIcon,
  RatioIcon,
  SwatchBookIcon,
} from "lucide-react";
import { presets } from "~/lib/color-presets";
import { useLayoutState } from "~/lib/layout-state";
import { FieldActions, FieldNote, FieldRow, FieldRows } from "./field-row";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
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
import { Textarea } from "./ui/textarea";

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

export function OptionsForm({
  paragraphs,
  titleOverflow = false,
}: {
  /** how many blocks the content slide has to start from */
  paragraphs: number;
  /** the title runs past its slide, said here too since the slide may be off-screen */
  titleOverflow?: boolean;
}) {
  const state = useLayoutState();
  const [currentPreset] = Object.entries(presets).find(
    ([_, preset]) =>
      state.textColor === preset.textColor && state.bgColor === preset.bgColor,
  ) ?? ["custom"];
  const start = state.paragraphShift + 1;

  return (
    <div className="flex flex-col gap-6">
      <FieldRows>
        <FieldRow icon={SwatchBookIcon} label="Preset" inline>
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
            <SelectTrigger className="w-full" aria-label="Preset">
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
        </FieldRow>

        <FieldRow
          icon={PaletteIcon}
          label="Text color"
          htmlFor="text-color"
          inline
        >
          <ColorField
            id="text-color"
            value={state.textColor}
            onChange={state.setTextColor}
          />
        </FieldRow>

        <FieldRow
          icon={PaintBucketIcon}
          label="Background"
          htmlFor="background-color"
          inline
        >
          <ColorField
            id="background-color"
            value={state.bgColor}
            onChange={state.setBgColor}
          />
        </FieldRow>

        <FieldRow icon={RatioIcon} label="Aspect ratio" inline>
          <Select
            value={state.ratio}
            items={RATIOS}
            onValueChange={(value) => value && state.setRatio(value)}
          >
            <SelectTrigger className="w-full" aria-label="Aspect ratio">
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
        </FieldRow>

        <FieldRow icon={ALargeSmallIcon} label="Title size" inline>
          <SizeSlider
            label="Title size"
            value={state.titleSize}
            onChange={state.setTitleSize}
            min={16}
            max={48}
          />
        </FieldRow>
        {titleOverflow && (
          <FieldNote>
            <span className="text-destructive">
              The title may not fit; try a smaller size or a shorter title.
            </span>
          </FieldNote>
        )}

        <FieldRow icon={BaselineIcon} label="Byline size" inline>
          <SizeSlider
            label="Byline size"
            value={state.bylineSize}
            onChange={state.setBylineSize}
            min={12}
            max={24}
          />
        </FieldRow>
      </FieldRows>

      <hr />

      <FieldRows>
        <FieldRow icon={HeadingIcon} label="Title" htmlFor="title" top>
          <Textarea
            id="title"
            rows={2}
            className="min-h-0 resize-none"
            value={state.title}
            onChange={(e) => state.setTitle(e.target.value)}
          />
        </FieldRow>

        <FieldRow
          icon={PenLineIcon}
          label="Article byline"
          htmlFor="article-byline"
        >
          <Input
            id="article-byline"
            type="text"
            value={state.articleByline}
            onChange={(e) => state.setArticleByline(e.target.value)}
          />
        </FieldRow>

        <FieldRow icon={CameraIcon} label="Image byline" htmlFor="image-byline">
          <Input
            id="image-byline"
            type="text"
            value={state.imageByline}
            onChange={(e) => state.setImageByline(e.target.value)}
          />
        </FieldRow>
        <FieldNote>
          <code>&lt;br&gt;</code> breaks a line in the title or bylines.
        </FieldNote>
      </FieldRows>

      <hr />

      <FieldRows>
        <FieldRow icon={ListStartIcon} label="Start at paragraph" inline>
          <div
            className="flex items-center gap-1 max-sm:justify-end"
            role="group"
            aria-label="Start at paragraph"
          >
            <Button
              variant="outline"
              size="icon"
              aria-label="Earlier paragraph"
              disabled={start <= 1}
              onClick={() => state.setParagraphShift(state.paragraphShift - 1)}
            >
              <ChevronLeftIcon />
            </Button>
            <output
              aria-live="polite"
              className="min-w-8 text-center text-sm tabular-nums"
            >
              {start}
            </output>
            <Button
              variant="outline"
              size="icon"
              aria-label="Later paragraph"
              disabled={start >= paragraphs}
              onClick={() => state.setParagraphShift(state.paragraphShift + 1)}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </FieldRow>

        <FieldRow
          icon={ImagesIcon}
          label="Slides as images"
          htmlFor="slides-as-images"
          inline
        >
          <div className="flex max-sm:justify-end">
            <Switch
              id="slides-as-images"
              checked={state.renderImages}
              onCheckedChange={(checked) => state.setRenderImages(checked)}
            />
          </div>
        </FieldRow>

        <FieldActions>
          <Button variant="outline" onClick={() => state.reset()}>
            Reset style
          </Button>
        </FieldActions>
      </FieldRows>
    </div>
  );
}

/** a swatch that opens the picker, with the colour written beside it */
function ColorField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="border-input focus-within:border-ring focus-within:ring-ring/50 relative flex h-8 w-full items-center gap-2 rounded-lg border px-2.5 text-sm focus-within:ring-3">
      <input
        id={id}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        /* the whole field opens the picker; the swatch is what shows */
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
      <span
        className="size-4 shrink-0 rounded border"
        style={{ backgroundColor: value }}
        aria-hidden="true"
      />
      <span className="font-mono text-[13px] uppercase" aria-hidden="true">
        {value}
      </span>
    </div>
  );
}

function SizeSlider({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex h-8 items-center gap-3">
      <Slider
        aria-label={label}
        value={[value]}
        onValueChange={(next) => onChange(toSingle(next))}
        min={min}
        max={max}
        step={1}
      />
      <span className="text-muted-foreground w-9 shrink-0 text-right text-sm tabular-nums">
        {value}px
      </span>
    </div>
  );
}
