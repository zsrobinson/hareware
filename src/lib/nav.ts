import {
  FileTextIcon,
  ImageIcon,
  MailIcon,
  NewspaperIcon,
  SquarePenIcon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/* the editorial app. only a signed-in member sees these, because everything
   behind them reads notion */
export const editorialNav: NavItem[] = [
  { href: "/articles", label: "Articles", icon: NewspaperIcon },
];

/* the public tools. these read wordpress and nothing else, so they stay
   reachable signed out, as they always have been */
export const toolsNav: NavItem[] = [
  { href: "/", label: "Post Generator", icon: ImageIcon },
  { href: "/custom", label: "Custom Post", icon: SquarePenIcon },
  { href: "/magazine", label: "InDesign Export", icon: FileTextIcon },
  { href: "/words", label: "Word Counter", icon: TypeIcon },
  { href: "/email", label: "Newsletter", icon: MailIcon },
];

/* `/` would otherwise light up on every page */
export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
