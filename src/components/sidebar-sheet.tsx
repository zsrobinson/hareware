import { MenuIcon } from "lucide-react";
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

/* the sidebar's drawer below `md`, mounted with `client:media` so a desktop
   never downloads it */
export function SidebarSheet({
  pathname,
  returnTo,
}: {
  pathname: string;
  returnTo: string;
}) {
  return (
    <Sheet>
      <SheetTrigger
        className="text-foreground hover:bg-accent ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-lg md:hidden"
        aria-label="Open navigation"
      >
        <MenuIcon className="size-4" />
      </SheetTrigger>

      {/* opens from the side its button is on */}
      <SheetContent side="right" className="bg-sidebar w-64 p-0">
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
          <NavGroup items={toolsNav} pathname={pathname} label="Tools" />

          {/* shown to everybody: the pages themselves refuse, and say why */}
          <NavGroup
            items={adminNav}
            pathname={pathname}
            label="Editorial Board"
            gated
          />
        </nav>

        <SidebarAccount returnTo={returnTo} inSheet />
      </SheetContent>
    </Sheet>
  );
}
