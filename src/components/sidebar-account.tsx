import { SettingsIcon } from "lucide-react";
import { mockSignIn, useSignedIn } from "~/lib/use-session";
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

/*
  the bottom of the sidebar. mocked: signing in swaps to an example member
  rather than going anywhere, so the signed-in shell can be looked at and the
  editorial nav above reacts with it. #19 makes the button an oauth redirect
  and the member real.
*/
export function SidebarAccount({
  signedIn: knownByServer = false,
  inSheet = false,
}: {
  signedIn?: boolean;
  inSheet?: boolean;
}) {
  const signedIn = useSignedIn(knownByServer);

  /* the sheet is only ever open at full width, so it never collapses */
  const railHidden = inSheet ? "" : "group-data-[state=collapsed]/shell:hidden";

  if (!signedIn) {
    return (
      <div className="border-sidebar-border border-t p-2">
        <button
          type="button"
          onClick={() => mockSignIn(true)}
          title="Sign in with Discord"
          className={cn(
            "flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#5865F2] text-sm font-medium text-white transition-colors hover:bg-[#4752c4]",
          )}
        >
          <DiscordMark className="size-4 shrink-0" />
          <span className={railHidden}>Sign in with Discord</span>
        </button>
      </div>
    );
  }

  return (
    <div className="border-sidebar-border flex items-center gap-2 border-t p-2 group-data-[state=collapsed]/shell:justify-center">
      <div className="bg-sidebar-accent text-sidebar-accent-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium">
        EM
      </div>

      <div className={cn("min-w-0 flex-1 leading-tight", railHidden)}>
        <div className="truncate text-sm font-medium">Example Member</div>
        <div className="text-sidebar-foreground/50 truncate text-xs">
          Section Editor
        </div>
      </div>

      {/* #22 hangs the real thing off this; it does nothing yet */}
      <button
        type="button"
        title="Settings"
        className={cn(
          "text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
          railHidden,
        )}
      >
        <SettingsIcon className="size-4" />
        <span className="sr-only">Settings</span>
      </button>
    </div>
  );
}
