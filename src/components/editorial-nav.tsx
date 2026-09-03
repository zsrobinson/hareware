import { useEffect, useState } from "react";
import { NavGroup } from "~/components/nav-group";
import { editorialNav } from "~/lib/nav";

/*
  `/` and `/email` are cached at the edge, so their html has to be identical
  for everyone — a cache hit never reaches the worker and could not personalise
  it anyway. the nav that varies by who you are is therefore asked for after
  the page has loaded, on the pages that are cached.

  pages that are `private, no-store` skip this and render the same group
  server-side, which is why this takes no props: it is only ever the fallback
*/
export function EditorialNav() {
  const [signedIn, setSignedIn] = useState(false);
  const [pathname, setPathname] = useState("");

  useEffect(() => {
    let live = true;
    setPathname(window.location.pathname);

    fetch("/api/session.json")
      .then((r) => (r.ok ? r.json() : { signedIn: false }))
      .then((d) => live && setSignedIn(Boolean(d.signedIn)))
      .catch(() => {});

    return () => {
      live = false;
    };
  }, []);

  if (!signedIn) return null;

  return (
    <>
      <NavGroup items={editorialNav} pathname={pathname} label="Editorial" />
      <hr className="border-sidebar-border my-2" />
    </>
  );
}
