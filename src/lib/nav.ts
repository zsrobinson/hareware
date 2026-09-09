import {
  ClipboardCheckIcon,
  CodeIcon,
  FileTextIcon,
  ImageIcon,
  HouseIcon,
  MailIcon,
  ScaleIcon,
  SquareActivityIcon,
  TypeIcon,
  UserRoundIcon,
  UsersIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import type { AdminRoute } from "./admin-routes";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  /* the other routes that belong to this tool. the generator's working pages
     are /generate and /custom, and neither should light a nav item of its own */
  match?: string[];
};

export const primaryNav: NavItem[] = [
  {
    href: "/",
    label: "Home",
    icon: HouseIcon,
    description: "Find the publishing and club tools available to you.",
  },
  {
    href: "/profile",
    label: "Profile",
    icon: UserRoundIcon,
    description: "Review your activity and keep your member details current.",
  },
];

/* the public tools. these read wordpress and nothing else, so they stay
   reachable signed out, as they always have been */
export const toolsNav: NavItem[] = [
  {
    href: "/generate",
    label: "Instagram Posts",
    icon: ImageIcon,
    description: "Turn a published article into slides ready for Instagram.",
    match: ["/generate", "/custom"],
  },
  {
    href: "/magazine",
    label: "InDesign Export",
    icon: FileTextIcon,
    description: "Prepare article copy for the magazine's InDesign layout.",
  },
  {
    href: "/words",
    label: "Word Counter",
    icon: TypeIcon,
    description: "Count the words in one or more published articles.",
  },
  {
    href: "/email",
    label: "Newsletter",
    icon: MailIcon,
    description: "Collect published articles into the weekly newsletter.",
  },
];

/*
  The admin tools, shown to everybody: the guard refuses in person, so the nav
  has nothing to hide (ADR 0007). `href` is an `AdminRoute`, so a tool listed
  here is one the guard protects.

  Ordered by when they are used: the kiosk at the meeting, the reconciler
  before a vote, standing to answer the question those two make answerable,
  then the three that were here first. The log goes last, being the one read
  after the fact rather than a thing somebody came to do.
*/
export const adminNav: (NavItem & { href: AdminRoute })[] = [
  {
    href: "/attendance",
    label: "Attendance",
    icon: ClipboardCheckIcon,
    description: "Record attendance at meetings and volunteer events.",
  },
  {
    href: "/reconciler",
    label: "Reconciler",
    icon: UsersIcon,
    description: "Review member records that may need a human decision.",
  },
  {
    href: "/standing",
    label: "Standing",
    icon: ScaleIcon,
    description: "Check which members meet a participation threshold.",
  },
  {
    href: "/automations",
    label: "Automations",
    icon: ZapIcon,
    description: "Check scheduled Discord reminders and run them manually.",
  },
  {
    href: "/commands",
    label: "Slash Commands",
    icon: CodeIcon,
    description: "Review the Discord commands available to editors.",
  },
  {
    href: "/log",
    label: "Invocation Log",
    icon: SquareActivityIcon,
    description: "See what HareWare ran and whether it completed.",
  },
];

/* `/` would otherwise light up on every page */
export function isActive(pathname: string, item: NavItem) {
  return (item.match ?? [item.href]).some((route) =>
    route === "/"
      ? pathname === "/"
      : pathname === route || pathname.startsWith(`${route}/`),
  );
}
