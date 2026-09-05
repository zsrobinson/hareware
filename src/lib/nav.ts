import {
  CodeIcon,
  FileTextIcon,
  ImageIcon,
  MailIcon,
  SquareActivityIcon,
  TypeIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import type { AdminRoute } from "./admin-routes";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /* the other routes that belong to this tool. the generator's working pages
     are /generate and /custom, and neither should light a nav item of its own */
  match?: string[];
};

/* the public tools. these read wordpress and nothing else, so they stay
   reachable signed out, as they always have been */
export const toolsNav: NavItem[] = [
  {
    href: "/generate",
    label: "Instagram Posts",
    icon: ImageIcon,
    match: ["/generate", "/custom"],
  },
  { href: "/magazine", label: "InDesign Export", icon: FileTextIcon },
  { href: "/words", label: "Word Counter", icon: TypeIcon },
  { href: "/email", label: "Newsletter", icon: MailIcon },
];

/*
  The admin tools, shown to everybody: the guard refuses in person, so the nav
  has nothing to hide (ADR 0007). `href` is an `AdminRoute`, so a tool listed
  here is one the guard protects. The log goes last, being the one read after
  the fact rather than a thing somebody came to do.
*/
export const adminNav: (NavItem & { href: AdminRoute })[] = [
  { href: "/automations", label: "Automations", icon: ZapIcon },
  { href: "/commands", label: "Slash Commands", icon: CodeIcon },
  { href: "/log", label: "Invocation Log", icon: SquareActivityIcon },
];

/* `/` would otherwise light up on every page */
export function isActive(pathname: string, item: NavItem) {
  return (item.match ?? [item.href]).some((route) =>
    route === "/"
      ? pathname === "/"
      : pathname === route || pathname.startsWith(`${route}/`),
  );
}
