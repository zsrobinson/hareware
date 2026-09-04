import { useEffect, useState } from "react";
import { NavGroup } from "~/components/nav-group";
import { adminNav } from "~/lib/nav";
import { useAdmin } from "~/lib/use-session";

/*
  `/` and `/email` are cached at the edge, so their html has to be identical
  for everyone — a cache hit never reaches the worker and could not personalise
  it anyway. the nav that varies by who you are is therefore asked for after
  the page has loaded, on the pages that are cached.

  pages that are `private, no-store` skip this and render the same group
  server-side, which is why this takes no props: it is only ever the fallback
*/
export function AdminNav() {
  const admin = useAdmin();
  const [pathname, setPathname] = useState("");

  useEffect(() => setPathname(window.location.pathname), []);

  if (!admin) return null;

  return <NavGroup items={adminNav} pathname={pathname} label="Admin tools" />;
}
