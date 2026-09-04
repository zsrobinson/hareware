import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  channelLabel,
  hourLabel,
  type Automation,
  type AutomationId,
} from "~/lib/automations/registry";

type Report = Record<string, string>;
type Mode = "dry" | "silent" | "live";

/*
  the same endpoint a terminal uses, so an automation fired here takes exactly the
  path it takes in the morning. the three modes are the three ways it is safe,
  or not, to run one: report only, post without pinging, and the real thing
*/
async function run(id: AutomationId, mode: Mode): Promise<Report> {
  const query = new URLSearchParams({ only: id });
  if (mode === "dry") query.set("dry", "1");
  if (mode === "silent") query.set("silent", "1");

  const response = await fetch(`/api/automations/run?${query}`, {
    method: "POST",
    // astro refuses a cross-site POST that looks like a form submission, and
    // one carrying no content type counts as one
    headers: { "content-type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<Report>;
}

export function AutomationTriggers({
  automations,
}: {
  automations: Automation[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<Automation | null>(null);

  /* handles its own failure into `said`, so callers have nothing to catch —
     `void` at each call site is what says that out loud */
  async function fire(automation: Automation, mode: Mode) {
    setBusy(`${automation.id}:${mode}`);
    try {
      const report = await run(automation.id, mode);
      const line = Object.values(report).find((v) => v !== "not requested");
      setSaid((prev) => ({ ...prev, [automation.id]: line ?? "done" }));
    } catch (thrown) {
      setSaid((prev) => ({
        ...prev,
        [automation.id]:
          thrown instanceof Error ? thrown.message : String(thrown),
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="divide-y rounded-lg border">
        {automations.map((automation) => (
          <div
            key={automation.id}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium">{automation.name}</h2>
                <Badge variant="secondary">
                  {hourLabel(automation.hour)} Eastern
                </Badge>
                <Badge variant="outline">
                  {channelLabel(automation.channelId)}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">
                {automation.description}
              </p>
              {said[automation.id] && (
                <p className="text-foreground pt-1 text-sm">
                  {said[automation.id]}
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void fire(automation, "dry")}
              >
                {busy === `${automation.id}:dry` ? "Running…" : "Dry run"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void fire(automation, "silent")}
              >
                {busy === `${automation.id}:silent` ? "Running…" : "Pingless"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy !== null}
                onClick={() => setConfirming(automation)}
              >
                Run for real
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* the only button here that reaches the club, so it asks first */}
      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run the {confirming?.name} automation?</DialogTitle>
            <DialogDescription>
              This posts to{" "}
              <strong>
                {confirming && channelLabel(confirming.channelId)}
              </strong>{" "}
              and pings the role, exactly as it would in the morning. Everyone
              in the channel sees it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const automation = confirming!;
                setConfirming(null);
                void fire(automation, "live");
              }}
            >
              Post it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
