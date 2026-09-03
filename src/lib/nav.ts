import {
  FileTextIcon,
  HouseIcon,
  ImageIcon,
  MailIcon,
  NewspaperIcon,
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

/* the editorial app. only a signed-in member sees these, because everything
   behind them reads notion */
export const editorialNav: NavItem[] = [
  { href: "/articles", label: "Articles", icon: NewspaperIcon },
];

/* the public tools. these read wordpress and nothing else, so they stay
   reachable signed out, as they always have been */
export const toolsNav: NavItem[] = [
  { href: "/", label: "Home", icon: HouseIcon },
  {
    href: "/generate",
    label: "Post Generator",
    icon: ImageIcon,
    match: ["/generate", "/custom"],
  },
  { href: "/magazine", label: "InDesign Export", icon: FileTextIcon },
  { href: "/words", label: "Word Counter", icon: TypeIcon },
  { href: "/email", label: "Newsletter", icon: MailIcon },
];

/* `/` would otherwise light up on every page */
export function isActive(pathname: string, item: NavItem) {
  return (item.match ?? [item.href]).some((route) =>
    route === "/"
      ? pathname === "/"
      : pathname === route || pathname.startsWith(`${route}/`),
  );
}
