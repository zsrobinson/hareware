import { create } from "zustand";
import { Input } from "../ui/input";
import { Slider } from "../ui/slider";
import {
  Fieldset,
  FieldsetItem,
  FieldsetLabel,
  FieldsetTitle,
} from "./fieldset";

const BACKGROUND_MAX_PADDING = 48;
const BACKGROUND_MIN_PADDING = 0;

export type BackgroundState = {
  padding: number;
  color: string;
};

export type BackgroundMutableState = BackgroundState & {
  setPadding: (padding: number) => void;
  setColor: (color: string) => void;
  setState: (state: Partial<BackgroundState>) => void;
};

export const useBackgroundState = create<BackgroundMutableState>()((set) => ({
  padding: 12,
  color: "#000000",

  setPadding: (padding) => set(() => ({ padding })),
  setColor: (color) => set(() => ({ color })),
  setState: (state) => set(() => state),
}));

export function BackgroundForm() {
  const { padding, color, setPadding, setColor } = useBackgroundState();

  return (
    <Fieldset>
      <FieldsetTitle>Background</FieldsetTitle>

      <FieldsetItem>
        <FieldsetLabel>Padding</FieldsetLabel>
        <Slider
          value={[padding]}
          onValueChange={(value) => setPadding(value.at(0)!)}
          min={BACKGROUND_MIN_PADDING}
          max={BACKGROUND_MAX_PADDING}
          step={1}
        />
      </FieldsetItem>

      <FieldsetItem>
        <FieldsetLabel>Color</FieldsetLabel>
        <Input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
      </FieldsetItem>
    </Fieldset>
  );
}
