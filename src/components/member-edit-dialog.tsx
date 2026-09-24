import { useMemo, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import type { EditableField } from "~/components/member-entry";
import { StatusPicker } from "~/components/status-picker";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { normaliseName } from "~/lib/members/match";
import type { Person } from "~/lib/members/records";
import { postJson } from "~/lib/post-json";
import { errorMessage } from "~/lib/utils";

/* a Members row's Discord, email or status, edited where it is seen. Each
   route re-validates what it is sent */

/** a guild member as the autocomplete offers them */
export type GuildOption = {
  id: string;
  username: string;
  displayName: string;
};

export type Editing = { field: EditableField; person: Person };

type Props = {
  editing: Editing | null;
  onClose: () => void;
  /** the row as it now is */
  onSaved: (person: Person) => void;
  guild: GuildOption[];
  statuses: string[];
};

export function MemberEditDialog({
  editing,
  onClose,
  onSaved,
  guild,
  statuses,
}: Props) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {editing && (
          <Body
            key={`${editing.field}:${editing.person.pageId}`}
            editing={editing}
            onClose={onClose}
            onSaved={onSaved}
            guild={guild}
            statuses={statuses}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  editing,
  onClose,
  onSaved,
  guild,
  statuses,
}: Props & { editing: Editing }) {
  const { field, person } = editing;
  const called = person.name;
  const [busy, setBusy] = useState(false);
  const [discordId, setDiscordId] = useState(person.discordId ?? "");
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState(person.email ?? "");

  const found = useMemo(() => {
    const needle = normaliseName(query);
    if (!needle) return guild.slice(0, 8);

    return guild
      .filter(
        (one) =>
          normaliseName(one.displayName).includes(needle) ||
          normaliseName(one.username).includes(needle),
      )
      .slice(0, 8);
  }, [guild, query]);

  /* `said` rather than the route's summary, which is written for the log */
  async function save(
    path: string,
    body: Record<string, string>,
    next: Person,
    said: string,
  ) {
    setBusy(true);

    try {
      await postJson(path, { pageId: person.pageId, ...body });

      onSaved(next);
      toast.success(said);
      onClose();
    } catch (thrown) {
      toast.error(errorMessage(thrown));
    } finally {
      setBusy(false);
    }
  }

  if (field === "status") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{called}'s status</DialogTitle>
          <DialogDescription>Alumni do not vote.</DialogDescription>
        </DialogHeader>
        <StatusPicker
          statuses={statuses}
          value={person.status}
          hideLabel
          disabled={busy}
          onPick={(status) =>
            void save(
              "/api/members/status",
              { status },
              { ...person, status },
              `Status set to ${status}`,
            )
          }
        />
      </>
    );
  }

  if (field === "email") {
    const next = email.trim();
    const ready = !busy && Boolean(next) && next !== person.email;
    const submit = () => {
      if (ready) {
        void save(
          "/api/members/email",
          { email: next },
          { ...person, email: next },
          "Email saved",
        );
      }
    };

    return (
      <>
        <DialogHeader>
          <DialogTitle>{called}'s email</DialogTitle>
          <DialogDescription>
            Use your @terpmail.umd.edu or @umd.edu address.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="edit-email">Email</Label>
          <Input
            id="edit-email"
            type="email"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={onEnter(submit)}
            placeholder="you@terpmail.umd.edu"
            className="h-12 text-base"
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ready} onClick={submit}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </>
    );
  }

  const chosen = guild.find((one) => one.id === discordId) ?? null;
  const ready = !busy && chosen !== null && chosen.id !== person.discordId;
  const link = () => {
    if (ready) {
      void save(
        "/api/members/discord",
        { discordId },
        { ...person, discordId },
        chosen ? `Discord linked to @${chosen.username}` : "Discord linked",
      );
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{called}'s Discord</DialogTitle>
        <DialogDescription>
          Search the server and pick yourself.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="edit-discord">Name in the server</Label>
        <Input
          id="edit-discord"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onEnter(link)}
          placeholder="Start typing…"
          className="h-12 text-base"
          autoComplete="off"
        />

        {found.length > 0 ? (
          <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
            {found.map((one) => (
              <li key={one.id}>
                <button
                  type="button"
                  onClick={() => setDiscordId(one.id)}
                  className={`hover:bg-muted flex w-full items-center justify-between gap-2 p-3 text-left ${
                    one.id === discordId ? "bg-muted" : ""
                  }`}
                >
                  <span className="truncate">{one.displayName}</span>
                  <span className="text-muted-foreground shrink-0 text-sm">
                    @{one.username}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            Nobody in the server by that name. If you have not joined yet, ask
            an editor for an invite link.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!ready} onClick={link}>
          {busy ? "Linking…" : chosen ? `Link ${chosen.username}` : "Link"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Enter presses save; these fields are not in a `<form>` */
function onEnter(submit: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submit();
  };
}
