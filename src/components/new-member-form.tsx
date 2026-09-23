import { useState, type ReactNode } from "react";
import { StatusPicker } from "~/components/status-picker";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { defaultStatus } from "~/lib/members/config";
import { cn } from "~/lib/utils";

export type NewMember = { name: string; email: string; status: string | null };

/**
 * the fields a new Members row is created from; a given `name` is not asked
 * for again. The status starts at `defaultStatus`, never notion's first option,
 * which is Alum
 */
export function NewMemberForm({
  id,
  name,
  initialName = "",
  initialEmail = "",
  statuses,
  busy,
  large = false,
  submit,
  onAdd,
}: {
  /** prefix for the fields' ids, unique on the page */
  id: string;
  name?: string;
  initialName?: string;
  initialEmail?: string;
  statuses: string[];
  busy: boolean;
  /** sized for a laptop a queue of people is typing at */
  large?: boolean;
  submit: ReactNode;
  onAdd: (member: NewMember) => void;
}) {
  const [typedName, setTypedName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState(() => defaultStatus(statuses));

  const member = {
    name: (name ?? typedName).trim(),
    email: email.trim(),
    status,
  };
  const field = cn(large && "h-12 text-base");

  return (
    <div className="space-y-3">
      {name === undefined && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input
            id={`${id}-name`}
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            className={field}
            autoComplete="off"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-email`}>Email</Label>
        <Input
          id={`${id}-email`}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={field}
          autoComplete="off"
          placeholder="you@terpmail.umd.edu"
          aria-describedby={`${id}-email-why`}
        />
        <p id={`${id}-email-why`} className="text-muted-foreground text-sm">
          Use a @terpmail.umd.edu or @umd.edu address.
        </p>
      </div>

      <StatusPicker
        statuses={statuses}
        value={status}
        onPick={setStatus}
        size={large ? "default" : "sm"}
      />

      <Button
        className={cn(large && "h-12")}
        disabled={busy || !member.name || !member.email}
        onClick={() => onAdd(member)}
      >
        {submit}
      </Button>
    </div>
  );
}
