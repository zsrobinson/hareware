import {
  OpacityIcon,
  SizeIcon,
  TextAlignCenterIcon,
} from "@radix-ui/react-icons";
import { useLayoutState } from "~/lib/layout-state";
import { Input } from "../ui/input";
import { Slider } from "../ui/slider";
import {
  Fieldset,
  FieldsetItem,
  FieldsetLabel,
  FieldsetTitle,
} from "./fieldset";

const TITLE_MAX_SIZE = 48;
const TITLE_MIN_SIZE = 16;

export function TitleForm() {
  const { content, size, color, setContent, setSize, setColor } =
    useLayoutState((state) => state.title);

  return (
    <Fieldset>
      <FieldsetTitle>Article Title</FieldsetTitle>

      <FieldsetItem>
        <TextAlignCenterIcon className="size-5 min-w-max" />
        <FieldsetLabel>Content</FieldsetLabel>
        <Input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </FieldsetItem>

      <FieldsetItem>
        <SizeIcon className="size-5 min-w-max" />
        <FieldsetLabel>Size</FieldsetLabel>
        <Slider
          value={[size]}
          onValueChange={(value) => setSize(value.at(0)!)}
          min={TITLE_MIN_SIZE}
          max={TITLE_MAX_SIZE}
          step={1}
        />
        <p className="font-mono text-sm">{size}px</p>
      </FieldsetItem>

      <FieldsetItem>
        <OpacityIcon className="size-5 min-w-max" />
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
