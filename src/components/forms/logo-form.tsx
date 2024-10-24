import { create } from "zustand";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Slider } from "../ui/slider";
import {
  Fieldset,
  FieldsetItem,
  FieldsetLabel,
  FieldsetTitle,
} from "./fieldset";
import { useLayoutState } from "~/lib/layout-state";

const LOGO_MAX_SIZE = 48;
const LOGO_MIN_SIZE = 16;
const LOGO_MAX_OPACITY = 1;
const LOGO_MIN_OPACITY = 0;
const LOGO_MAX_OFFSET = 48;
const LOGO_MIN_OFFSET = 0;

export function LogoForm() {
  // prettier-ignore
  const { variant, size, filter, opacity, position, xOffset, yOffset,
    setVariant, setSize, setFilter, setOpacity, setPosition, setXOffset, setYOffset
  } = useLayoutState((state) => state.logo);

  return (
    <Fieldset>
      <FieldsetTitle>Hare Logo</FieldsetTitle>

      <FieldsetItem>
        <FieldsetLabel>Variant</FieldsetLabel>
        <Select value={variant} onValueChange={(value) => setVariant(value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="circle">Circle</SelectItem>
            <SelectItem value="horizontal-maroon">
              Horizontal (Maroon)
            </SelectItem>
            <SelectItem value="horizontal-white">Horizontal (White)</SelectItem>
          </SelectContent>
        </Select>
      </FieldsetItem>

      <FieldsetItem>
        <FieldsetLabel>Size</FieldsetLabel>
        <Slider
          value={[size]}
          onValueChange={(value) => setSize(value.at(0)!)}
          min={LOGO_MIN_SIZE}
          max={LOGO_MAX_SIZE}
          step={1}
        />
        <p className="font-mono text-sm">{size}px</p>
      </FieldsetItem>

      <FieldsetItem>
        <FieldsetLabel>Filter</FieldsetLabel>
        <Select value={filter} onValueChange={(value) => setFilter(value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="invert">Invert</SelectItem>
            <SelectItem value="grayscale">Grayscale</SelectItem>
            <SelectItem value="sepia">Sepia</SelectItem>
          </SelectContent>
        </Select>
      </FieldsetItem>

      <FieldsetItem>
        <FieldsetLabel>Opacity</FieldsetLabel>
        <Slider
          value={[opacity]}
          onValueChange={(value) => setOpacity(value.at(0)!)}
          min={LOGO_MIN_OPACITY}
          max={LOGO_MAX_OPACITY}
          step={0.01}
        />
        <p className="whitespace-pre font-mono text-sm">
          {String(Math.round(opacity * 100)).padStart(3)}%
        </p>
      </FieldsetItem>

      <FieldsetItem>
        <FieldsetLabel>Position</FieldsetLabel>
        <Select value={position} onValueChange={(value) => setPosition(value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inline">Inline</SelectItem>
            <SelectItem value="corner">Corner</SelectItem>
          </SelectContent>
        </Select>
      </FieldsetItem>

      {position === "corner" && (
        <>
          <FieldsetItem>
            <FieldsetLabel>X Offset</FieldsetLabel>
            <Slider
              value={[xOffset]}
              onValueChange={(value) => setXOffset(value.at(0)!)}
              min={LOGO_MIN_OFFSET}
              max={LOGO_MAX_OFFSET}
              step={1}
            />
            <p className="font-mono text-sm">{xOffset}px</p>
          </FieldsetItem>

          <FieldsetItem>
            <FieldsetLabel>Y Offset</FieldsetLabel>
            <Slider
              value={[yOffset]}
              onValueChange={(value) => setYOffset(value.at(0)!)}
              min={LOGO_MIN_OFFSET}
              max={LOGO_MAX_OFFSET}
              step={1}
            />
            <p className="font-mono text-sm">{yOffset}px</p>
          </FieldsetItem>
        </>
      )}
    </Fieldset>
  );
}
