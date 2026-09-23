import type { ReactNode } from "react";
import { ALUM_STATUS } from "~/lib/members/config";

/** something the page could not read or cannot vouch for, said above it */
export function Problem({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="border-destructive/50 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm"
    >
      {children}
    </p>
  );
}

/** the alum rule matches nobody once notion drops the option it tests */
export function AlumMissing({ options }: { options: string[] }) {
  return (
    <Problem>
      Notion's Status options no longer include "{ALUM_STATUS}", which is the
      value that keeps alumni out of a vote. Until an editor restores that
      option or the rule is changed in code, nobody is being excluded as an
      alum. Options Notion has: {options.join(", ")}.
    </Problem>
  );
}
