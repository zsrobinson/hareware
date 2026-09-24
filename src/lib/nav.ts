import {
  ClipboardCheckIcon,
  CodeIcon,
  FileTextIcon,
  ImageIcon,
  MailIcon,
  ScaleIcon,
  SquareActivityIcon,
  TypeIcon,
  UsersIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import type { AdminRoute } from "./admin-routes";

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

/* The admin tools, shown to everybody: the guard refuses in person (ADR 0007). */
export const adminNav: (NavItem & { href: AdminRoute })[] = [
  { href: "/attendance", label: "Attendance", icon: ClipboardCheckIcon },
  { href: "/reconciler", label: "Reconciler", icon: UsersIcon },
  { href: "/standing", label: "Standing", icon: ScaleIcon },
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
