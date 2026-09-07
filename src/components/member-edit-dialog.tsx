import { useMemo, useState } from "react";
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
          <DialogTitle>{person.name}'s status</DialogTitle>
          <DialogDescription>
            Where {person.name} stands with the university. Alumni do not vote.
          </DialogDescription>
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
    return (
      <>
        <DialogHeader>
          <DialogTitle>{person.name}'s email</DialogTitle>
          <DialogDescription>
            Use an @terpmail.umd.edu or @umd.edu address. It is what matches
            this row to a Discord application later.
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
            placeholder="you@terpmail.umd.edu"
            className="h-12 text-base"
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !email.trim() || email.trim() === person.email}
            onClick={() =>
              void save(
                "/api/members/email",
                { email: email.trim() },
                {
                  ...person,
                  email: email.trim(),
                },
              )
            }
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </>
    );
  }

  const chosen = guild.find((one) => one.id === discordId) ?? null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{person.name}'s Discord</DialogTitle>
        <DialogDescription>
          Search the server and pick yourself. This is what links your name here
          to what you post there.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="edit-discord">Name in the server</Label>
        <Input
          id="edit-discord"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
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
        <Button
          disabled={busy || !chosen || chosen.id === person.discordId}
          onClick={() =>
            void save(
              "/api/members/discord",
              { discordId },
              {
                ...person,
                discordId,
              },
            )
          }
        >
          {busy ? "Linking…" : chosen ? `Link ${chosen.displayName}` : "Link"}
        </Button>
      </DialogFooter>
    </>
  );
}
