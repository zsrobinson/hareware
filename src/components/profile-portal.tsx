import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CalendarDaysIcon,
  ChevronDownIcon,
  CircleHelpIcon,
  MailIcon,
  MessageCircleIcon,
  PencilIcon,
  UserRoundIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
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
import type { ProfilePayload } from "~/lib/members/profile";
import {
  profileKey,
  profilePath,
  type ProfileLocation,
} from "~/lib/members/profile-query-keys";
import { notify } from "~/lib/notify";
import { postJson } from "~/lib/post-json";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    },
  },
});

type Props = {
  initial: ProfilePayload;
  displayName: string;
  today: string;
  location?: ProfileLocation;
};

export function ProfilePortal(props: Props) {
  client.setQueryData(profileKey(props.location ?? {}), props.initial);
  return (
    <QueryClientProvider client={client}>
      <Portal {...props} />
    </QueryClientProvider>
  );
}

function Portal({
  initial,
  displayName,
  today,
  location: opening = {},
}: Props) {
  const [location, setLocation] = useState<ProfileLocation>(opening);
  const key = profileKey(location);
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const response = await fetch(profilePath(location));
      const body = (await response.json()) as ProfilePayload & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error ?? "Profile could not be loaded");
      return body;
    },
    initialData:
      opening.member === location.member &&
      opening.from === location.from &&
      opening.to === location.to
        ? initial
        : undefined,
  });

  function navigate(next: ProfileLocation) {
    const params = new URLSearchParams();
    if (next.member) params.set("member", next.member);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    history.pushState({}, "", `/profile${params.size ? `?${params}` : ""}`);
    setLocation(next);
  }

  if (query.isError) return <Unavailable message={query.error.message} />;
  if (!query.data)
    return <p className="text-muted-foreground text-sm">Loading profile…</p>;
  const data = query.data;
  if (data.status === "ambiguous")
    return (
      <Unavailable message="More than one profile is linked to your Discord account. Ask an editor." />
    );
  if (data.status === "unlinked")
    return (
      <CreateProfile
        data={data}
        displayName={displayName}
        location={location}
      />
    );

  return (
    <ReadyProfile
      data={data}
      location={location}
      today={today}
      navigate={navigate}
      fetching={query.isFetching}
    />
  );
}

function Unavailable({ message }: { message: string }) {
  return (
    <div className="border-destructive/25 bg-destructive/5 mx-auto max-w-xl rounded-xl border p-5">
      <h2 className="font-heading text-lg font-medium">Profile unavailable</h2>
      <p className="text-muted-foreground mt-1 text-sm">{message}</p>
    </div>
  );
}

function CreateProfile({
  data,
  displayName,
  location,
}: {
  data: Extract<ProfilePayload, { status: "unlinked" }>;
  displayName: string;
  location: ProfileLocation;
}) {
  const queries = useQueryClient();
  const [name, setName] = useState(displayName);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      postJson("/api/profile", {
        action: "create",
        name: name.trim(),
        email: email.trim(),
        status,
      }),
    onSuccess: async () => {
      notify.ok("Profile created");
      await queries.invalidateQueries({ queryKey: profileKey(location) });
    },
    onError: (error) =>
      notify.failed(error instanceof Error ? error.message : String(error)),
  });
  const ready =
    Boolean(name.trim() && email.trim() && status) && !mutation.isPending;
  return (
    <section className="mx-auto max-w-xl space-y-5">
      <header>
        <h2 className="font-heading text-2xl font-semibold tracking-tight">
          Make your Hare profile
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Check what we’ll save, then connect it to your Discord account.
        </p>
      </header>
      {data.possibleDuplicate ? <DuplicateNotice /> : null}
      <form
        className="bg-card space-y-4 rounded-xl border p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) mutation.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="create-name">Real name</Label>
          <Input
            id="create-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="create-email">Email</Label>
          <Input
            id="create-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="create-status">Status</Label>
          <select
            id="create-status"
            className="border-input bg-background h-9 w-full rounded-lg border px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            required
          >
            <option value="">Choose one</option>
            {data.statuses.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={!ready}>
          {mutation.isPending ? "Creating…" : "Create profile"}
        </Button>
        {mutation.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {mutation.error instanceof Error
              ? mutation.error.message
              : String(mutation.error)}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function DuplicateNotice() {
  return (
    <p className="bg-muted text-muted-foreground rounded-lg px-3 py-2 text-sm">
      We found a similar profile. You can continue; an editor may need to
      combine them later.
    </p>
  );
}

type Ready = Extract<ProfilePayload, { status: "ready" }>;
type EditField = "name" | "email" | "status" | "nickname";

function ReadyProfile({
  data,
  location,
  today,
  navigate,
  fetching,
}: {
  data: Ready;
  location: ProfileLocation;
  today: string;
  navigate: (next: ProfileLocation) => void;
  fetching: boolean;
}) {
  const [editing, setEditing] = useState<EditField | null>(null);
  const bounded = Boolean(location.from || location.to);
  return (
    <div className="space-y-5" aria-busy={fetching}>
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading truncate text-3xl font-semibold tracking-tight">
            {data.person.name}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Your work and time with The Hare, in one place.
          </p>
        </div>
        {data.selectable.length ? (
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            View profile
            <span className="relative">
              <select
                aria-label="View profile"
                className="border-input bg-background text-foreground h-8 max-w-48 appearance-none rounded-lg border py-1 pr-7 pl-2 text-sm"
                value={data.person.pageId}
                onChange={(event) =>
                  navigate({ ...location, member: event.target.value })
                }
              >
                {data.selectable.map((person) => (
                  <option key={person.pageId} value={person.pageId}>
                    {person.name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute top-2 right-2 size-3.5" />
            </span>
          </label>
        ) : null}
      </header>

      {data.possibleDuplicate ? <DuplicateNotice /> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <RangeControl location={location} today={today} navigate={navigate} />
        <Identity data={data} edit={setEditing} />
        <ActivityCard
          kind="contributions"
          data={data}
          bounded={bounded}
          showAll={() =>
            navigate(location.member ? { member: location.member } : {})
          }
        />
        <ActivityCard
          kind="attendance"
          data={data}
          bounded={bounded}
          showAll={() =>
            navigate(location.member ? { member: location.member } : {})
          }
        />
      </div>
      {editing ? (
        <EditDialog
          key={editing}
          data={data}
          field={editing}
          close={() => setEditing(null)}
          location={location}
        />
      ) : null}
    </div>
  );
}

function Identity({
  data,
  edit,
}: {
  data: Ready;
  edit: (field: EditField) => void;
}) {
  const facts: Array<{
    field: EditField;
    label: string;
    value: string;
    icon: ReactNode;
  }> = [
    {
      field: "name",
      label: "Real name",
      value: data.person.name,
      icon: <UserRoundIcon />,
    },
    {
      field: "email",
      label: "Email",
      value: data.person.email ?? "Add email",
      icon: <MailIcon />,
    },
    {
      field: "status",
      label: "Status",
      value: data.person.status ?? "Add status",
      icon: <CalendarDaysIcon />,
    },
    {
      field: "nickname",
      label: "Discord name",
      value: data.discordNickname ?? "No server nickname",
      icon: <MessageCircleIcon />,
    },
  ];
  return (
    <aside className="bg-card rounded-xl border p-4 lg:col-start-2 lg:row-span-3">
      <h3 className="font-heading font-medium">Your information</h3>
      <dl className="mt-2 divide-y">
        {facts.map((fact) => (
          <div key={fact.field} className="group flex items-center gap-2 py-3">
            <span className="text-muted-foreground [&>svg]:size-4">
              {fact.icon}
            </span>
            <div className="min-w-0 flex-1">
              <dt className="text-muted-foreground text-xs">{fact.label}</dt>
              <dd className="truncate text-sm">{fact.value}</dd>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${fact.label.toLowerCase()}`}
              onClick={() => edit(fact.field)}
            >
              <PencilIcon />
            </Button>
          </div>
        ))}
      </dl>
      {data.discordNickname && data.discordNickname !== data.person.name ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Your real name and Discord name are different. That’s fine if it’s
          intentional.
        </p>
      ) : null}
    </aside>
  );
}

function RangeControl({
  location,
  today,
  navigate,
}: {
  location: ProfileLocation;
  today: string;
  navigate: (next: ProfileLocation) => void;
}) {
  const [custom, setCustom] = useState(Boolean(location.from || location.to));
  const [from, setFrom] = useState(location.from ?? "");
  const [to, setTo] = useState(location.to ?? "");
  const preset = rangePreset(today);
  function choose(value: string) {
    if (value === "all") {
      setCustom(false);
      navigate(location.member ? { member: location.member } : {});
      return;
    }
    if (value === "custom") {
      setCustom(true);
      return;
    }
    setCustom(false);
    const range =
      value === "semester"
        ? preset.semester
        : value === "academic"
          ? preset.academic
          : preset.year;
    navigate({ member: location.member, ...range });
  }
  return (
    <div className="flex flex-wrap items-end gap-2 lg:col-start-1">
      <label className="text-muted-foreground space-y-1 text-xs">
        Activity range
        <select
          aria-label="Activity range"
          className="border-input bg-background text-foreground block h-9 rounded-lg border px-3 text-sm"
          value={custom ? "custom" : selectedRange(location, preset)}
          onChange={(event) => choose(event.target.value)}
        >
          <option value="all">All time</option>
          <option value="semester">This semester</option>
          <option value="academic">This academic year</option>
          <option value="year">Past 12 months</option>
          <option value="custom">Custom dates</option>
        </select>
      </label>
      {custom ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (from && to && from <= to)
              navigate({ member: location.member, from, to });
          }}
        >
          <label className="text-muted-foreground text-xs">
            From
            <Input
              aria-label="From"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="text-muted-foreground text-xs">
            To
            <Input
              aria-label="To"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <Button
            type="submit"
            variant="outline"
            disabled={!from || !to || from > to}
          >
            Apply
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function ActivityCard({
  kind,
  data,
  bounded,
  showAll,
}: {
  kind: "contributions" | "attendance";
  data: Ready;
  bounded: boolean;
  showAll: () => void;
}) {
  const rows =
    kind === "contributions"
      ? data.contributions.map((row) => ({
          ...row,
          title: row.headline,
          detail: roleLabel(row.roles),
        }))
      : data.attendance.map((row) => ({
          ...row,
          title: row.name,
          detail: row.type ?? "Meeting",
        }));
  const title = kind === "contributions" ? "Contributions" : "Attendance";
  const count =
    kind === "contributions"
      ? data.contributions.reduce(
          (total, contribution) => total + contribution.roles.length,
          0,
        )
      : rows.length;
  return (
    <Card className="lg:col-start-1">
      <CardHeader>
        <CardTitle>
          <h3 aria-label={title} className="flex items-baseline gap-2">
            <span
              aria-hidden="true"
              className="font-heading text-2xl font-semibold tabular-nums"
            >
              {count}
            </span>
            {title}
          </h3>
        </CardTitle>
        <CardAction>
          <Help />
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <ol className="divide-y">
            {rows.map((row) => (
              <li
                key={row.pageId}
                className="flex gap-3 py-3 first:pt-0 last:pb-0"
              >
                <time
                  className="text-muted-foreground w-24 shrink-0 text-xs"
                  dateTime={row.date}
                >
                  {formatDate(row.date)}
                </time>
                <div className="min-w-0">
                  <p className="font-medium">{row.title}</p>
                  <p className="text-muted-foreground text-xs">{row.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="py-7 text-center">
            <p className="text-muted-foreground text-sm">
              Nothing recorded{bounded ? " in this range" : " yet"}.
            </p>
            {bounded ? (
              <a
                href="/profile"
                className="text-primary text-sm underline-offset-4 hover:underline"
                onClick={(event) => {
                  event.preventDefault();
                  showAll();
                }}
              >
                Show all time
              </a>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Help() {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Help with incorrect activity"
        title="Missing or incorrect? Ask an editor."
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <CircleHelpIcon />
      </Button>
      {open ? (
        <span
          role="tooltip"
          className="bg-popover text-popover-foreground absolute top-7 right-0 z-10 w-48 rounded-lg border p-2 text-xs shadow-md"
        >
          Missing or incorrect? Ask an editor.
        </span>
      ) : null}
    </span>
  );
}

function EditDialog({
  data,
  field,
  close,
  location,
}: {
  data: Ready;
  field: EditField;
  close: () => void;
  location: ProfileLocation;
}) {
  const queries = useQueryClient();
  const current =
    field === "name"
      ? data.person.name
      : field === "email"
        ? (data.person.email ?? "")
        : field === "status"
          ? (data.person.status ?? "")
          : (data.discordNickname ?? "");
  const [value, setValue] = useState(current);
  const mutation = useMutation({
    scope: { id: `profile-${data.person.pageId}` },
    mutationFn: (next: string) =>
      postJson<Record<string, unknown>>("/api/profile", {
        action: field,
        value: next,
        ...(location.member ? { selectedPageId: location.member } : {}),
      }),
    onSuccess: (_answer, next) => {
      queries.setQueryData<ProfilePayload>(profileKey(location), (known) =>
        patchProfile(known, field!, next),
      );
      notify.ok(
        `${field === "nickname" ? "Discord name" : field![0]!.toUpperCase() + field!.slice(1)} saved`,
      );
      close();
    },
    onError: (error) =>
      notify.failed(error instanceof Error ? error.message : String(error)),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) close();
      }}
    >
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const next = value.trim();
            if (next && next !== current) mutation.mutate(next);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              Edit {field === "nickname" ? "Discord name" : field}
            </DialogTitle>
            <DialogDescription>
              {field === "nickname"
                ? "This changes your nickname in The Hare’s Discord server."
                : "This updates your Member profile."}
            </DialogDescription>
          </DialogHeader>
          <div className="my-5">
            <Label htmlFor={`profile-${field}`}>
              {field === "nickname"
                ? "Discord name"
                : field[0]!.toUpperCase() + field.slice(1)}
            </Label>
            {field === "status" ? (
              <select
                id={`profile-${field}`}
                className="border-input bg-background mt-1.5 h-10 w-full rounded-lg border px-3"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              >
                {data.statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            ) : (
              <Input
                id={`profile-${field}`}
                className="mt-1.5 h-10"
                type={field === "email" ? "email" : "text"}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                autoFocus
              />
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                mutation.isPending || !value.trim() || value.trim() === current
              }
            >
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
          {mutation.isError ? (
            <p role="alert" className="text-destructive mt-3 text-sm">
              {mutation.error instanceof Error
                ? mutation.error.message
                : String(mutation.error)}
            </p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function patchProfile(
  known: ProfilePayload | undefined,
  field: EditField,
  value: string,
): ProfilePayload | undefined {
  if (!known || known.status !== "ready") return known;
  if (field === "nickname") return { ...known, discordNickname: value };
  return {
    ...known,
    person: { ...known.person, [field]: value },
    selectable:
      field === "name"
        ? known.selectable.map((person) =>
            person.pageId === known.person.pageId
              ? { ...person, name: value }
              : person,
          )
        : known.selectable,
  };
}

function rangePreset(today: string) {
  const [year, month] = today.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const semester =
    month <= 6
      ? { from: `${year}-01-01`, to: `${year}-06-30` }
      : { from: `${year}-07-01`, to: `${year}-12-31` };
  const academic =
    month >= 7
      ? { from: `${year}-07-01`, to: `${year + 1}-06-30` }
      : { from: `${year - 1}-07-01`, to: `${year}-06-30` };
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  date.setUTCDate(date.getUTCDate() + 1);
  return {
    semester,
    academic,
    year: { from: date.toISOString().slice(0, 10), to: today },
  };
}

function selectedRange(
  location: ProfileLocation,
  preset: ReturnType<typeof rangePreset>,
) {
  if (!location.from && !location.to) return "all";
  return (
    Object.entries(preset).find(
      ([, range]) => range.from === location.from && range.to === location.to,
    )?.[0] ?? "custom"
  );
}

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
const roleLabel = (roles: ("writer" | "image")[]) =>
  roles.length === 2
    ? "Writer + image"
    : roles[0] === "writer"
      ? "Writer"
      : "Image";
