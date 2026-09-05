import { ChevronDownIcon } from "lucide-react";
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
import type { ViewerState } from "~/lib/admin";

/*
  the sidebar itself is static markup and simply hidden below `md`. this is the
  drawer that stands in for it there, and it is mounted with
  `client:media="(max-width: 767px)"` so a desktop browser never downloads the
  dialog primitive at all
*/
export function SidebarSheet({
  pathname,
  returnTo,
  title,
  viewer,
}: {
  pathname: string;
  returnTo: string;
  /** the page being looked at, which the trigger wears as its label */
  title: string;
  viewer?: ViewerState | null;
}) {
  return (
    <Sheet>
      {/*
        the whole header is the control on a phone, not a bare icon beside a
        heading that does nothing. it names where you are and carries a
        chevron, so the way to everything else is the most obvious thing on the
        screen rather than a glyph you have to already know about
      */}
      {/* the brand sits to the left of this, so the trigger starts at the page
          name and shrinks from there: on a narrow screen the title truncates
          rather than pushing the chevron off the bar */}
      <SheetTrigger
        className="text-foreground hover:bg-accent inline-flex h-8 min-w-0 items-center gap-1 rounded-md px-1.5 md:hidden"
        aria-label={`${title}. Open navigation`}
      >
        <span className="truncate text-sm font-medium">{title}</span>
        <ChevronDownIcon className="text-foreground/50 size-3.5 shrink-0" />
      </SheetTrigger>

      <SheetContent side="left" className="bg-sidebar w-64 p-0">
        {/* the same mark and name the sidebar wears, so the drawer reads as
            the same thing rather than a second design */}
        <SheetHeader className="px-3.5 pt-3.5 pb-0">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <img
              src="/bot-logo.svg"
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 rounded-md"
            />
            HareWare
          </SheetTitle>
        </SheetHeader>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
          <NavGroup items={toolsNav} pathname={pathname} label="Public tools" />

          {/* shown to everybody: the pages themselves refuse, and say why */}
          <NavGroup items={adminNav} pathname={pathname} label="Admin tools" />
        </nav>

        <SidebarAccount viewer={viewer} returnTo={returnTo} inSheet />
      </SheetContent>
    </Sheet>
  );
}
