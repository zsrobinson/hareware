import {
  ActivityIcon,
  CodeIcon,
  ZapIcon,
  FileTextIcon,
  ImageIcon,
  MailIcon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react";

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

/* the admin tools. everybody sees these, signed in or not: the guard over
   /admin refuses in person and says which of four things is wrong, so there is
   nothing for the nav to hide — ADR 0007, amended 2026-09-04 */
export const adminNav: NavItem[] = [
  { href: "/admin/automations", label: "Automations", icon: ZapIcon },
  { href: "/admin/log", label: "Invocation Log", icon: ActivityIcon },
  { href: "/admin/commands", label: "Slash Commands", icon: CodeIcon },
];

/* `/` would otherwise light up on every page */
export function isActive(pathname: string, item: NavItem) {
  return (item.match ?? [item.href]).some((route) =>
    route === "/"
      ? pathname === "/"
      : pathname === route || pathname.startsWith(`${route}/`),
  );
}
