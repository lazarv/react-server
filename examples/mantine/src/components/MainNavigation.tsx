"use client";

import { Link, usePathname } from "@lazarv/react-server/navigation";
import { NavLink } from "@mantine/core";

export function MainNavigation({ serverPathname }: { serverPathname: string }) {
  const clientPathname = usePathname();
  const pathname =
    typeof window !== "undefined" ? clientPathname : serverPathname;

  return (
    <>
      <NavLink component={Link} to="/" label="Core" active={pathname === "/"} />
      <NavLink
        component={Link}
        to="/form"
        label="Form"
        active={pathname === "/form"}
      />
      <NavLink
        component={Link}
        to="/dates"
        label="Dates"
        active={pathname === "/dates"}
      />
      <NavLink
        component={Link}
        to="/charts"
        label="Charts"
        active={pathname === "/charts"}
      />
      <NavLink
        component={Link}
        to="/code"
        label="Code Highlights"
        active={pathname === "/code"}
      />
      <NavLink
        component={Link}
        to="/notification"
        label="Notification System"
        active={pathname === "/notification"}
      />
      <NavLink
        component={Link}
        to="/spotlight"
        label="Spotlight"
        active={pathname === "/spotlight"}
      />
      <NavLink
        component={Link}
        to="/carousel"
        label="Carousel"
        active={pathname === "/carousel"}
      />
      <NavLink
        component={Link}
        to="/dropzone"
        label="Dropzone"
        active={pathname === "/dropzone"}
      />
      <NavLink
        component={Link}
        to="/navigationprogress"
        label="NavigationProgress"
        active={pathname === "/navigationprogress"}
      />
      <NavLink
        component={Link}
        to="/modalsmanager"
        label="Modals manager"
        active={pathname === "/modalsmanager"}
      />
      <NavLink
        component={Link}
        to="/rte"
        label="Rich text editor"
        active={pathname === "/rte"}
      />
    </>
  );
}
