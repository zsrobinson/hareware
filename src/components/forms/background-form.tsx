import { create } from "zustand";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";

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
    <div>
      <h3>Background</h3>

      <Label>Padding</Label>
      <Slider
        value={[padding]}
        onValueChange={(value) => setPadding(value.at(0)!)}
        min={BACKGROUND_MIN_PADDING}
        max={BACKGROUND_MAX_PADDING}
        step={1}
      />

      <Label>Color</Label>
      <Input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
      />
    </div>
  );
}
