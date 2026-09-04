import { useState } from "react";
import { Button } from "~/components/ui/button";

type Report = Record<string, string>;

/*
  the same endpoint a terminal uses, so a reminder fired from here takes exactly
  the path it takes at 8am. `dry` is on by default: this posts to the club's real
  channels, and the button that does that should be the deliberate one
*/
async function run(only: string | null, dry: boolean): Promise<Report> {
  const query = new URLSearchParams();
  if (only) query.set("only", only);
  if (dry) query.set("dry", "1");

  const response = await fetch(`/api/reminders/run?${query}`, {
    method: "POST",
    // astro refuses a cross-site POST that looks like a form submission, and
    // one with no content type counts as one
    headers: { "content-type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<Report>;
}

export function ReminderTriggers() {
  const [dry, setDry] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fire(only: string | null, label: string) {
    setBusy(label);
    setError(null);
    setReport(null);

    try {
      setReport(await run(only, dry));
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={dry}
          onChange={(event) => setDry(event.target.checked)}
          className="size-4"
        />
        <span>Dry run — report what would be posted, without posting it</span>
      </label>

      {!dry && (
        <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          This will post to <strong>#instagram-posting</strong> and{" "}
          <strong>#editorial-board</strong> and ping the roles.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => fire(null, "both")}
          disabled={busy !== null}
          variant={dry ? "default" : "destructive"}
        >
          {busy === "both" ? "Running…" : "Run both"}
        </Button>
        <Button
          onClick={() => fire("meeting", "meeting")}
          disabled={busy !== null}
          variant="outline"
        >
          {busy === "meeting" ? "Running…" : "Meeting reminder"}
        </Button>
        <Button
          onClick={() => fire("social", "social")}
          disabled={busy !== null}
          variant="outline"
        >
          {busy === "social" ? "Running…" : "Social ping"}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {report && (
        <dl className="divide-y rounded-lg border text-sm">
          {Object.entries(report).map(([name, said]) => (
            <div key={name} className="grid gap-1 px-3 py-2 sm:grid-cols-3">
              <dt className="font-medium">{name}</dt>
              <dd className="text-muted-foreground sm:col-span-2">{said}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
