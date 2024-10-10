import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import type { TextSize, Theme } from "~/lib/types";

export function FormatForm({
  article,
  theme,
  titleSize,
}: {
  article: string;
  theme: Theme;
  titleSize: TextSize;
}) {
  return (
    <form className="flex max-w-fit flex-col flex-wrap items-end gap-4 md:flex-row">
      <input type="hidden" name="article" value={article} />

      <div className="flex items-center gap-2">
        <Label>Theme</Label>
        <Select name="theme" defaultValue={theme}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="white">White</SelectItem>
            <SelectItem value="maroon">Maroon</SelectItem>
            <SelectItem value="pink">Pink</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Label>Title Size</Label>
        <Select name="title-size" defaultValue={titleSize}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="xl">Small</SelectItem>
            <SelectItem value="2xl">Regular</SelectItem>
            <SelectItem value="3xl">Large</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button>Change Format</Button>
    </form>
  );
}
