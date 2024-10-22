import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useAuthorState, type AuthorState } from "./author-form";
import { useBackgroundState, type BackgroundState } from "./background-form";
import { useLogoState, type LogoState } from "./logo-form";
import { useTitleState, type TitleState } from "./title-form";

type PartialValues<T> = { [K in keyof T]: Partial<T[K]> };

type State = {
  title: TitleState;
  author: AuthorState;
  logo: LogoState;
  background: BackgroundState;
};
export type Preset = PartialValues<State>;

// prettier-ignore
const whitePreset: Preset = {
  title: { color: "#5b2218", size: 24 },
  author: { color: "#5b2218", size: 14 },
  logo: { variant: "circle", size: 48, filter: "none", opacity: 100, position: "inline" },
  background: { padding: 12, color: "#ffffff" }
};

// prettier-ignore
const pinkPreset: Preset = {
  title: { color: "#5b2218", size: 24 },
  author: { color: "#5b2218", size: 14 },
  logo: { variant: "circle", size: 48, filter: "none", opacity: 100, position: "inline" },
  background: { padding: 12, color: "#ffd9d0" }
}

// prettier-ignore
const maroonPreset: Preset = {
  title: { color: "#ffffff", size: 24 },
  author: { color: "#ffffff", size: 14 },
  logo: { variant: "circle", size: 48, filter: "none", opacity: 100, position: "inline" },
  background: { padding: 12, color: "#5b2118" }
}

export const presets: Record<string, Preset> = {
  white: whitePreset,
  pink: pinkPreset,
  maroon: maroonPreset,
};

function isCurrentPreset(state: State, preset: Preset): boolean {
  return Object.entries(preset).every(([presetKey, presetValue]) =>
    Object.entries(presetValue).every(
      ([propKey, propValue]) =>
        // trust it works (hopefully)
        propValue === (state[presetKey as keyof State] as any)[propKey],
    ),
  );
}

export function PresetForm() {
  const title = useTitleState();
  const author = useAuthorState();
  const logo = useLogoState();
  const background = useBackgroundState();
  const state = { title, author, logo, background };

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
    <div>
      <Label>Preset</Label>
      <Select
        value={currentPreset}
        onValueChange={(value) => {
          if (presets[value]) {
            title.setState(presets[value].title);
            author.setState(presets[value].author);
            logo.setState(presets[value].logo);
            background.setState(presets[value].background);
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
    </div>
  );
}
