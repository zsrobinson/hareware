import { useMemo, useState, type KeyboardEvent } from "react";
import type { EditableField } from "~/components/member-entry";
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
import { normaliseName } from "~/lib/articles/member";
import type { Faces } from "~/lib/faces";
import { shownName } from "~/lib/members/kiosk";
import { notify } from "~/lib/notify";
import type { Person } from "~/lib/members/records";
import { postJson } from "~/lib/post-json";

/*
  the Members database, edited by the person it is about, at the meeting.

  ADR 0010 leaves Status to a human and leaves the reconciler to chase the rest,
  which puts every correction on an editor weeks after the person who knew the
  answer was standing at the laptop. These three modals are the other end of
  that: the row is in front of its owner exactly once a week.

  none of the three trusts this file. Each route re-reads what it needs — the
  guild for a snowflake, the schema for a status — because a page rendered
  minutes ago is a stale claim about somebody's identity.
*/

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
  /** the row as it now is, so the roster on the page re-renders without a reload */
  onSaved: (person: Person) => void;
  guild: GuildOption[];
  /** notion's own Status options, read from the schema on every page load */
  statuses: string[];
  /** discord profiles, so a linked row is titled by the handle the room knows */
  faces: Faces;
};

export function MemberEditDialog({
  editing,
  onClose,
  onSaved,
  guild,
  statuses,
  faces,
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
            faces={faces}
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
  faces,
}: Props & { editing: Editing }) {
  const { field, person } = editing;
  const called = shownName(person, faces);
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

  /** `next` is the row as it will be, so the page behind the modal re-renders */
  async function save(
    path: string,
    body: Record<string, string>,
    next: Person,
  ) {
    setBusy(true);

    try {
      const { summary } = await postJson<{ summary?: string }>(path, {
        pageId: person.pageId,
        name: person.name,
        ...body,
      });

      onSaved(next);
      notify.ok(summary ?? "Saved.");
      onClose();
    } catch (thrown) {
      notify.failed(thrown instanceof Error ? thrown.message : String(thrown));
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
        <div className="flex flex-wrap gap-2">
          {statuses.map((status) => (
            <Button
              key={status}
              variant={person.status === status ? "default" : "outline"}
              disabled={busy}
              onClick={() =>
                void save(
                  "/api/members/status",
                  { status },
                  {
                    ...person,
                    status,
                  },
                )
              }
            >
              {status}
            </Button>
          ))}
        </div>
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
          /* the only outcome here a person cannot fix themselves, so it says
             who can: joining the server is an invite an editor sends */
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

/**
 * Enter on a text field presses the modal's save button.
 *
 * these are one-field forms in a dialog rather than a `<form>`, so nothing
 * submits them by default and everybody at the kiosk types their address and
 * hits Enter
 */
function onEnter(submit: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submit();
  };
}
