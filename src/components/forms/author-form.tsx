import { create } from "zustand";
import { Input } from "../ui/input";
import { Slider } from "../ui/slider";
import {
  Fieldset,
  FieldsetItem,
  FieldsetLabel,
  FieldsetTitle,
} from "./fieldset";

const AUTHOR_MAX_SIZE = 24;
const AUTHOR_MIN_SIZE = 12;

export type AuthorState = {
  content: string;
  size: number;
  color: string;
};

export type AuthorMutableState = AuthorState & {
  setContent: (content: string) => void;
  setSize: (size: number) => void;
  setColor: (color: string) => void;
  setState: (state: Partial<AuthorState>) => void;
};

export const useAuthorState = create<AuthorMutableState>()((set) => ({
  content: "",
  size: 12,
  color: "#000000",

  setContent: (content) => set(() => ({ content })),
  setSize: (size) => set(() => ({ size })),
  setColor: (color) => set(() => ({ color })),
  setState: (state) => set(() => state),
}));

export function AuthorForm() {
  const { content, size, color, setContent, setSize, setColor } =
    useAuthorState();

  return (
    <Fieldset>
      <FieldsetTitle>Article Author</FieldsetTitle>

      <FieldsetItem>
        <FieldsetLabel>Content</FieldsetLabel>
        <Input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </FieldsetItem>

      <FieldsetItem>
        <FieldsetLabel>Size</FieldsetLabel>
        <Slider
          value={[size]}
          onValueChange={(value) => setSize(value.at(0)!)}
          min={AUTHOR_MIN_SIZE}
          max={AUTHOR_MAX_SIZE}
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
