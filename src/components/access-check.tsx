/* what /access-denied draws: the refusal /api/access.json names, or, for a
   member it admits, the way back in */
import { useEffect, useState } from "react";
import type { RefusalBody } from "~/lib/admin-api";
import { fetchGated, Refused } from "~/lib/gated";
import { DenialMessage } from "./gated";
import { buttonVariants } from "./ui/button";

export function AccessCheck() {
  const [answer, setAnswer] = useState<RefusalBody | "allowed" | "unknown">();

  useEffect(() => {
    fetchGated<null>("/api/access.json")
      .then(() => setAnswer("allowed"))
      .catch((error: unknown) =>
        setAnswer(error instanceof Refused ? error.body : "unknown"),
      );
  }, []);

  if (answer === undefined) return null;
  if (answer === "allowed")
    return (
      <section className="max-w-md space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            You have access
          </h1>
          <p className="text-muted-foreground text-sm">
            This account can use the Editorial Board's tools.
          </p>
        </div>
        <a href="/articles" className={buttonVariants()}>
          Open Articles
        </a>
      </section>
    );
  if (answer === "unknown")
    return (
      <section className="max-w-md space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Could not check your access
        </h1>
        <p className="text-muted-foreground text-sm">
          HareWare couldn't check your access just now. Try again in a minute.
        </p>
      </section>
    );
  return <DenialMessage refusal={answer} level="page" />;
}
