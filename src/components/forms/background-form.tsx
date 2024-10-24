import { useLayoutState } from "~/lib/layout-state";
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

export function BackgroundForm() {
  const { padding, color, setPadding, setColor } = useLayoutState(
    (state) => state.background,
  );

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
        <p className="font-mono text-sm">{padding}px</p>
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
