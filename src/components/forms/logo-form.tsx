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

const LOGO_MAX_SIZE = 48;
const LOGO_MIN_SIZE = 16;
const LOGO_MAX_OPACITY = 1;
const LOGO_MIN_OPACITY = 0;
const LOGO_MAX_OFFSET = 48;
const LOGO_MIN_OFFSET = 0;

export type LogoState = {
  variant: string;
  size: number;
  filter: string;
  opacity: number;
  position: string;
  xOffset: number;
  yOffset: number;
};

export type LogoMutableState = LogoState & {
  setVariant: (variant: string) => void;
  setSize: (size: number) => void;
  setFilter: (filter: string) => void;
  setOpacity: (opacity: number) => void;
  setPosition: (position: string) => void;
  setXOffset: (xOffset: number) => void;
  setYOffset: (yOffset: number) => void;
  setState: (state: Partial<LogoState>) => void;
};

export const useLogoState = create<LogoMutableState>()((set) => ({
  variant: "circle",
  size: 16,
  filter: "none",
  opacity: 100,
  position: "corner",
  xOffset: 12,
  yOffset: 12,

  setVariant: (variant) => set(() => ({ variant })),
  setSize: (size) => set(() => ({ size })),
  setFilter: (filter) => set(() => ({ filter })),
  setOpacity: (opacity) => set(() => ({ opacity })),
  setPosition: (position) => set(() => ({ position })),
  setXOffset: (xOffset) => set(() => ({ xOffset })),
  setYOffset: (yOffset) => set(() => ({ yOffset })),
  setState: (state) => set(() => state),
}));

export function LogoForm() {
  // prettier-ignore
  const { variant, size, filter, opacity, position, xOffset, yOffset,
    setVariant, setSize, setFilter, setOpacity, setPosition, setXOffset, setYOffset
  } = useLogoState();

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
          </FieldsetItem>
        </>
      )}
    </Fieldset>
  );
}
