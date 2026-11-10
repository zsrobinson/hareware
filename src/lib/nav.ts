import {
  BellIcon,
  FileTextIcon,
  ImageIcon,
  MailIcon,
  NewspaperIcon,
  SettingsIcon,
  TriangleAlertIcon,
  TypeIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /* the other routes that light this item */
  match?: string[];
};

/* the public tools, which read only WordPress */
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

/* The board's tools, shown to everybody: what they show is gated by the APIs
   they ask, which say why when they refuse (ADR 0007, ADR 0012). */
export const adminNav: NavItem[] = [
  { href: "/articles", label: "Articles", icon: NewspaperIcon },
  { href: "/people", label: "People", icon: UsersIcon },
  { href: "/problems", label: "Problems", icon: TriangleAlertIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
  { href: "/reminder", label: "Social Reminder", icon: BellIcon },
];

/**
 * a page's own path as its links name it: a prerendered page is built as
 * `people.html`, so at build time Astro calls it `/people.html`
 */
export function pagePath(pathname: string) {
  return pathname.replace(/(\/index)?\.html$/, "") || "/";
}

/* `/` would otherwise light up on every page */
export function isActive(pathname: string, item: NavItem) {
  return (item.match ?? [item.href]).some((route) =>
    route === "/"
      ? pathname === "/"
      : pathname === route || pathname.startsWith(`${route}/`),
  );
}
