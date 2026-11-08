import { EllipsisVerticalIcon, LogOutIcon, TagIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { DiscordMark } from "~/components/discord-mark";
import { useEffect } from "react";
import { useViewer, useViewerKnown } from "~/lib/use-session";
import { cn } from "~/lib/utils";

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

const REPO = "https://github.com/zsrobinson/hareware";

/* `git describe` gives a tag or `<tag>-<n>-g<hash>`; link the hash if any */
const described = __APP_VERSION__.replace(/-dirty$/, "");
const commit = /-g([0-9a-f]+)$/.exec(described)?.[1];
const versionHref = commit
  ? `${REPO}/commit/${commit}`
  : described.startsWith("v")
    ? `${REPO}/releases/tag/${described}`
    : `${REPO}/commit/${described}`;

function AccountMenu({
  signedIn,
  returnTo,
}: {
  signedIn: boolean;
  returnTo: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title="More"
        className="text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground data-open:bg-sidebar-accent data-open:text-sidebar-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
      >
        <EllipsisVerticalIcon className="size-4" />
        <span className="sr-only">More</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="end">
        {signedIn ? (
          /* a <button> sizes to its text where an <a> fills the row */
          <form
            method="post"
            action="/auth/logout"
            data-astro-reload
            className="w-full"
          >
            <input type="hidden" name="returnTo" value={returnTo} />
            <DropdownMenuItem
              render={<button type="submit" />}
              className="w-full"
            >
              <LogOutIcon className="size-4" />
              Sign out
            </DropdownMenuItem>
          </form>
        ) : null}

        <DropdownMenuItem
          render={
            <a
              href="https://github.com/zsrobinson/hareware"
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          <GitHubMark className="size-4" />
          View source on GitHub
        </DropdownMenuItem>

        <DropdownMenuItem
          render={<a href={versionHref} target="_blank" rel="noreferrer" />}
          className="text-muted-foreground text-xs"
        >
          <TagIcon className="size-3.5" />
          <span className="font-mono">{__APP_VERSION__}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* every page is static, so who is looking is asked from the browser */
export function SidebarAccount({
  returnTo,
  inSheet = false,
}: {
  returnTo: string;
  inSheet?: boolean;
}) {
  const { session, profile } = useViewer();
  const known = useViewerKnown();

  /* the nav is static html, so it learns who is looking from the root:
     the board's group shows a lock for someone signed out */
  useEffect(() => {
    if (inSheet) return;
    if (known && !session)
      document.documentElement.dataset.viewer = "signed-out";
    else delete document.documentElement.dataset.viewer;
  }, [known, session, inSheet]);

  /* the sheet is only ever open at full width, so it never collapses. the rail
     has no room for a row, so the menu sits under what it belongs to */
  const railHidden = inSheet ? "" : "group-data-[state=collapsed]/shell:hidden";
  const row = cn(
    "border-sidebar-border flex items-center gap-2 border-t p-2",
    !inSheet && "group-data-[state=collapsed]/shell:flex-col",
  );

  if (!session) {
    /* straight to discord; /sign-in is only where callback errors land */
    const signInHref = `/auth/discord?${new URLSearchParams({ returnTo })}`;

    return (
      <div className={row}>
        <a
          href={signInHref}
          title="Sign in with Discord"
          className={cn(
            /* quiet, like every other control: the Discord mark says whose sign-in it is */
            "bg-background hover:bg-muted flex h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors",
            /* in the stacked rail `flex-1` would grow down, not across */
            !inSheet &&
              "group-data-[state=collapsed]/shell:size-9 group-data-[state=collapsed]/shell:flex-none",
          )}
        >
          <DiscordMark className="size-4 shrink-0 text-[#5865F2]" />
          <span className={cn("truncate", railHidden)}>
            Sign in with Discord
          </span>
        </a>

        <AccountMenu signedIn={false} returnTo={returnTo} />
      </div>
    );
  }

  /* the profile may arrive late or never, so both lines fall back */
  return (
    <div className={row}>
      {profile ? (
        <img
          src={profile.avatarUrl}
          alt=""
          width={28}
          height={28}
          className="size-7 shrink-0 rounded-full object-cover"
          /* discord's cdn needs no credentials and should not be sent any */
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#5865F2] text-white">
          <DiscordMark className="size-3.5" />
        </div>
      )}

      <div className={cn("min-w-0 flex-1 leading-tight", railHidden)}>
        <div className="truncate text-sm font-medium">
          {profile?.displayName ?? "Signed in with Discord"}
        </div>
        <div className="text-sidebar-foreground/50 truncate text-xs">
          {profile ? `@${profile.username}` : `ID ${session.discordUserId}`}
        </div>
      </div>

      <AccountMenu signedIn returnTo={returnTo} />
    </div>
  );
}
