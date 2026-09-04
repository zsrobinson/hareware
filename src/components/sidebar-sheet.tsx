import { PanelLeftIcon } from "lucide-react";
import { NavGroup } from "~/components/nav-group";
import { SidebarAccount } from "~/components/sidebar-account";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { adminNav, toolsNav } from "~/lib/nav";
import type { Session } from "~/lib/session";
import { useAdmin, useSession } from "~/lib/use-session";

/*
  the sidebar itself is static markup and simply hidden below `md`. this is the
  drawer that stands in for it there, and it is mounted with
  `client:media="(max-width: 767px)"` so a desktop browser never downloads the
  dialog primitive at all
*/
export function SidebarSheet({
  pathname,
  returnTo,
  session: sessionFromServer,
}: {
  pathname: string;
  returnTo: string;
  session: Session | null;
}) {
  const session = useSession(sessionFromServer);
  const admin = useAdmin();

  return (
    <Sheet>
      <SheetTrigger
        className="text-foreground/70 hover:bg-accent hover:text-foreground inline-flex size-8 items-center justify-center rounded-md md:hidden"
        aria-label="Open navigation"
      >
        <PanelLeftIcon className="size-4" />
      </SheetTrigger>

      <SheetContent side="left" className="bg-sidebar w-64 p-0">
        <SheetHeader className="px-3 pt-3 pb-0">
          <SheetTitle className="text-sm">HareWare</SheetTitle>
        </SheetHeader>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
          <NavGroup items={toolsNav} pathname={pathname} label="Public tools" />

          {/* the sheet only knows there is a session, not whether the member
              holds the role — the pages themselves are what refuse */}
          {admin && (
            <NavGroup
              items={adminNav}
              pathname={pathname}
              label="Admin tools"
            />
          )}
        </nav>

        <SidebarAccount
          session={sessionFromServer}
          returnTo={returnTo}
          inSheet
        />
      </SheetContent>
    </Sheet>
  );
}
