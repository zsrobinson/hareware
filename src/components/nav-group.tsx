import { isActive, type NavItem } from "~/lib/nav";
import { cn } from "~/lib/utils";

/* no hooks or state, so the sidebar ships as static html */
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
                /* at rail width only the icon shows, so the title names it */
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
