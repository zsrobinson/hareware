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
import { editorialNav, toolsNav } from "~/lib/nav";
import { useSignedIn } from "~/lib/use-session";

/*
  the sidebar itself is static markup and simply hidden below `md`. this is the
  drawer that stands in for it there, and it is mounted with
  `client:media="(max-width: 767px)"` so a desktop browser never downloads the
  dialog primitive at all
*/
export function SidebarSheet({
  pathname,
  signedIn: signedInFromServer,
}: {
  pathname: string;
  signedIn: boolean;
}) {
  const signedIn = useSignedIn(signedInFromServer);

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

        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
          {signedIn && (
            <>
              <NavGroup
                items={editorialNav}
                pathname={pathname}
                label="Editorial"
              />
              <hr className="border-sidebar-border" />
            </>
          )}
          <NavGroup items={toolsNav} pathname={pathname} label="Tools" />
        </nav>

        <SidebarAccount signedIn={signedInFromServer} inSheet />
      </SheetContent>
    </Sheet>
  );
}
