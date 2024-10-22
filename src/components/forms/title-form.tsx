import { create } from "zustand";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";

const TITLE_MAX_SIZE = 48;
const TITLE_MIN_SIZE = 16;

export type TitleState = {
  content: string;
  size: number;
  color: string;
};

export type TitleMutableState = TitleState & {
  setContent: (content: string) => void;
  setSize: (size: number) => void;
  setColor: (color: string) => void;
  setState: (state: Partial<TitleState>) => void;
};

export const useTitleState = create<TitleMutableState>()((set) => ({
  content: "",
  size: 12,
  color: "#000000",

  setContent: (content) => set(() => ({ content })),
  setSize: (size) => set(() => ({ size })),
  setColor: (color) => set(() => ({ color })),
  setState: (state) => set(() => state),
}));

export function TitleForm() {
  const { content, size, color, setContent, setSize, setColor } =
    useTitleState();

  return (
    <div>
      <h3>Article Title</h3>

      <Label>Content</Label>
      <Input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      <Label>Size</Label>
      <Slider
        value={[size]}
        onValueChange={(value) => setSize(value.at(0)!)}
        min={TITLE_MIN_SIZE}
        max={TITLE_MAX_SIZE}
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
