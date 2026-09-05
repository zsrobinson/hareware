import { isActive, type NavItem } from "~/lib/nav";
import { cn } from "~/lib/utils";

/*
  rendered two ways: statically inside the astro sidebar, and inside the mobile
  sheet. keeping it presentational — no hooks, no state — is what lets the
  first of those ship no javascript at all.

  there was a third, an island that revealed the editorial nav on cached pages.
  it went when the admin tools stopped being hidden from anyone: no group here
  varies by who is looking any more, so the sidebar is markup on every page
*/
export function NavGroup({
  items,
  pathname,
  label,
}: {
  items: NavItem[];
  pathname: string;
  label?: string;
}) {
  return (
    <div className="flex flex-col">
      {label && (
        /* shadcn's sidebar group label: quiet, small, and it goes away with
           the rest of the text when the sidebar collapses to the rail.

           it sits close to what it names. the height it used to carry put as
           much space under the word as the gap above it, so the label floated
           between the two groups rather than belonging to the one below */
        <div
          className="text-sidebar-foreground/60 flex h-7 shrink-0 items-end px-2 pb-1 text-xs font-medium group-data-[state=collapsed]/shell:md:hidden"
          aria-hidden="true"
        >
          {label}
        </div>
      )}

      <ul className="flex flex-col gap-0.5" aria-label={label}>
        {items.map((item) => {
          const active = isActive(pathname, item);

          return (
            <li key={item.href}>
              <a
                href={item.href}
                data-active={active || undefined}
                aria-current={active ? "page" : undefined}
                /* the label is what collapses; the icon is the whole control at
                 rail width, so the title carries the name a tooltip would */
                title={item.label}
                className={cn(
                  "text-sidebar-foreground/80 flex h-8 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-sm outline-hidden transition-colors",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  "focus-visible:ring-sidebar-ring focus-visible:ring-2",
                  "data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:font-medium",
                  "[&_svg]:size-4 [&_svg]:shrink-0",
                  "group-data-[state=collapsed]/shell:md:justify-center group-data-[state=collapsed]/shell:md:p-2",
                )}
              >
                <item.icon />
                <span className="truncate group-data-[state=collapsed]/shell:md:hidden">
                  {item.label}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
