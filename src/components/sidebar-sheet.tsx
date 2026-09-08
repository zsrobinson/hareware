import { ChevronDownIcon } from "lucide-react";
import { NavGroup } from "~/components/nav-group";
import { SidebarAccount, SidebarMenu } from "~/components/sidebar-account";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { adminNav, toolsNav } from "~/lib/nav";
import type { ViewerState } from "~/lib/admin";
import { useViewer } from "~/lib/use-session";

export function SidebarGroups({
  pathname,
  viewer,
}: {
  pathname: string;
  viewer?: ViewerState | null;
}) {
  const resolved = useViewer(viewer);

  return (
    <>
      <NavGroup items={toolsNav} pathname={pathname} label="Public tools" />
      {resolved.admin ? (
        <NavGroup items={adminNav} pathname={pathname} label="Admin tools" />
      ) : null}
    </>
  );
}

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
        The page name is the control on a phone, so the way to everything else
        is the most obvious thing on the screen rather than a glyph. It shrinks
        rather than pushing the chevron off the bar.
      */}
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
          <div className="flex items-center gap-1">
            <SheetTitle className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <img
                src="/bot-logo.svg"
                alt=""
                width={28}
                height={28}
                className="size-7 shrink-0 rounded-md"
              />
              HareWare
            </SheetTitle>
            <SidebarMenu viewer={viewer} returnTo={returnTo} />
          </div>
        </SheetHeader>

        <SidebarAccount viewer={viewer} returnTo={returnTo} inSheet />

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
          <SidebarGroups pathname={pathname} viewer={viewer} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
