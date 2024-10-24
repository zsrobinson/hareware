import { useLayoutState } from "~/lib/layout-state";
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

export function AuthorForm() {
  const { content, size, color, setContent, setSize, setColor } =
    useLayoutState((state) => state.author);

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
