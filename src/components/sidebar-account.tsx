import { EllipsisVerticalIcon, LogOutIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { avatarUrl, type Session } from "~/lib/session";
import { useSession } from "~/lib/use-session";
import { cn } from "~/lib/utils";

/* lucide carries no brand marks */
function DiscordMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127c-.598.35-1.22.645-1.873.891a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.056c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.332-.955 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.332-.946 2.418-2.157 2.418Z" />
    </svg>
  );
}

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

/* the same menu either side of signing in, so the one thing in it stays
   reachable whether or not anyone is signed in yet */
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

      <DropdownMenuContent side="top" align="end" className="min-w-48">
        {signedIn ? (
          <form method="post" action="/auth/logout" data-astro-reload>
            <input type="hidden" name="returnTo" value={returnTo} />
            <DropdownMenuItem render={<button type="submit" />}>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/*
  the bottom of the sidebar. private pages seed the verified session, while
  cached pages let the shared client hook fill it in without personalising html.
*/
export function SidebarAccount({
  session: knownByServer = null,
  returnTo,
  inSheet = false,
}: {
  session?: Session | null;
  returnTo: string;
  inSheet?: boolean;
}) {
  const session = useSession(knownByServer);

  /* the sheet is only ever open at full width, so it never collapses. the rail
     has no room for a row, so the menu sits under what it belongs to */
  const railHidden = inSheet ? "" : "group-data-[state=collapsed]/shell:hidden";
  const row = cn(
    "border-sidebar-border flex items-center gap-2 border-t p-2",
    !inSheet && "group-data-[state=collapsed]/shell:flex-col",
  );

  if (!session) {
    /*
      straight to discord rather than by way of a page whose only content is
      the same button again. /sign-in still exists for the errors the callback
      redirects to, which do need somewhere to say what went wrong
    */
    const signInHref = `/auth/discord?${new URLSearchParams({ returnTo })}`;

    return (
      <div className={row}>
        <a
          href={signInHref}
          title="Sign in with Discord"
          className="flex h-9 min-w-0 flex-1 items-center justify-center gap-2 self-stretch rounded-md bg-[#5865F2] text-sm font-medium text-white transition-colors hover:bg-[#4752c4]"
        >
          <DiscordMark className="size-4 shrink-0" />
          <span className={cn("truncate", railHidden)}>
            Sign in with Discord
          </span>
        </a>

        <AccountMenu signedIn={false} returnTo={returnTo} />
      </div>
    );
  }

  /*
    a session signed before the cookie carried a name still has none, so both
    lines fall back rather than rendering an empty row
  */
  const name = session.displayName ?? "Signed in with Discord";
  const handle = session.username
    ? `@${session.username}`
    : `ID ${session.discordUserId}`;

  return (
    <div className={row}>
      {session.displayName ? (
        <img
          src={avatarUrl(session)}
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
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="text-sidebar-foreground/50 truncate text-xs">
          {handle}
        </div>
      </div>

      <AccountMenu signedIn returnTo={returnTo} />
    </div>
  );
}
