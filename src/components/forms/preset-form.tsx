import { useLayoutState } from "~/lib/layout-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { FieldsetItem, FieldsetLabel } from "./fieldset";
import { isCurrentPreset, presets } from "~/lib/layout-presets";

export function PresetForm() {
  const state = useLayoutState();

  let currentPreset = "none";
  Object.entries(presets).some(([presetKey, presetValue]) => {
    if (isCurrentPreset(state, presetValue)) {
      currentPreset = presetKey;
      return true;
    } else {
      return false;
    }
  });

  return (
    <FieldsetItem>
      <FieldsetLabel>Preset</FieldsetLabel>
      <Select
        value={currentPreset}
        onValueChange={(value) => {
          if (presets[value]) {
            state.setState(presets[value]);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="white">White</SelectItem>
          <SelectItem value="maroon">Maroon</SelectItem>
          <SelectItem value="pink">Pink</SelectItem>
          <SelectItem value="none">Custom</SelectItem>
        </SelectContent>
      </Select>
    </FieldsetItem>
  );
}
