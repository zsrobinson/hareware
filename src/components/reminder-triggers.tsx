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
  hourLabel,
  type ReminderDefinition,
  type ReminderId,
} from "~/lib/reminders/registry";

type Report = Record<string, string>;
type Mode = "dry" | "silent" | "live";

/*
  the same endpoint a terminal uses, so a reminder fired here takes exactly the
  path it takes in the morning. the three modes are the three ways it is safe,
  or not, to run one: report only, post without pinging, and the real thing
*/
async function run(id: ReminderId, mode: Mode): Promise<Report> {
  const query = new URLSearchParams({ only: id });
  if (mode === "dry") query.set("dry", "1");
  if (mode === "silent") query.set("silent", "1");

  const response = await fetch(`/api/reminders/run?${query}`, {
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

export function ReminderTriggers({
  reminders,
}: {
  reminders: ReminderDefinition[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<ReminderDefinition | null>(null);

  async function fire(reminder: ReminderDefinition, mode: Mode) {
    setBusy(`${reminder.id}:${mode}`);
    try {
      const report = await run(reminder.id, mode);
      const line = Object.values(report).find((v) => v !== "not requested");
      setSaid((prev) => ({ ...prev, [reminder.id]: line ?? "done" }));
    } catch (thrown) {
      setSaid((prev) => ({
        ...prev,
        [reminder.id]:
          thrown instanceof Error ? thrown.message : String(thrown),
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="divide-y rounded-lg border">
        {reminders.map((reminder) => (
          <div
            key={reminder.id}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium">{reminder.name}</h2>
                <Badge variant="secondary">
                  {hourLabel(reminder.hour)} Eastern
                </Badge>
                <Badge variant="outline">{reminder.channel}</Badge>
              </div>
              <p className="text-muted-foreground text-sm">
                {reminder.description}
              </p>
              {said[reminder.id] && (
                <p className="text-foreground pt-1 text-sm">
                  {said[reminder.id]}
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => fire(reminder, "dry")}
              >
                {busy === `${reminder.id}:dry` ? "Running…" : "Dry run"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => fire(reminder, "silent")}
              >
                {busy === `${reminder.id}:silent` ? "Running…" : "Pingless"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy !== null}
                onClick={() => setConfirming(reminder)}
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
            <DialogTitle>Run the {confirming?.name} reminder?</DialogTitle>
            <DialogDescription>
              This posts to <strong>{confirming?.channel}</strong> and pings the
              role, exactly as it would in the morning. Everyone in the channel
              sees it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const reminder = confirming!;
                setConfirming(null);
                void fire(reminder, "live");
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
