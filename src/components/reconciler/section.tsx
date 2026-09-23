import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { errorMessage } from "~/lib/utils";

/** what the last write for a row answered */
export type Said = { ok: boolean; text: string };

/** the page's writes: which row is busy, what each row was told, and how to write */
export type Writes = {
  busy: string | null;
  said: Record<string, Said>;
  act: (key: string, run: () => Promise<{ summary?: string }>) => Promise<void>;
};

/**
 * each row's last answer. A success locks the row until `refresh` removes it;
 * a failure leaves it open to retry
 */
export function useWrites(refresh: () => Promise<unknown>): Writes {
  const [said, setSaid] = useState<Record<string, Said>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, run: () => Promise<{ summary?: string }>) {
    setBusy(key);
    try {
      const { summary } = await run();
      const text = summary ?? "Done.";
      setSaid((prev) => ({ ...prev, [key]: { ok: true, text } }));
      /* a toast, because the re-read removes the row and its note */
      toast.success(text);
      await refresh();
    } catch (thrown) {
      setSaid((prev) => ({
        ...prev,
        [key]: { ok: false, text: errorMessage(thrown) },
      }));
    } finally {
      setBusy(null);
    }
  }

  return { busy, said, act };
}

export function Section({
  title,
  how,
  count,
  clear,
  children,
}: {
  title: string;
  how?: string;
  /** null while there is nothing to count yet, which is not the same as none */
  count: number | null;
  /** shown instead of an empty list; absent where the body is not a list */
  clear?: string;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen render={<section />}>
      <h2 className="text-lg font-medium">
        <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
          {/* base-ui marks the trigger, not the icon, as open */}
          <ChevronDownIcon className="text-muted-foreground size-4 transition-transform duration-200 group-data-[panel-open]:rotate-180" />
          {title}
          {count !== null && (
            <Badge variant={count > 0 ? "default" : "outline"}>{count}</Badge>
          )}
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent className="space-y-2 pt-2">
        {how && <p className="text-muted-foreground text-sm">{how}</p>}
        {clear && count === 0 ? <Cleared>{clear}</Cleared> : children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function Cleared({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 rounded-lg border p-4 text-sm">
      <CheckIcon className="size-4" />
      {children}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm">{children}</p>;
}
