import { basename, relative } from "node:path";

import { usePathname } from "@lazarv/react-server";

import Menu from "../../public/menu.svg?react";
import { defaultLanguage } from "../const.mjs";

import classes from "./Sidebar.module.css";

const guides = Array.from(
  Object.entries(
    import.meta.glob("../../../*/guide/**/*.{md,mdx}", { eager: true })
  )
);

export default function Sidebar({ lang, children }) {
  const pathname = usePathname();

  return (
    <>
      <input type="checkbox" id="sidebar-toggle" className={classes.toggle} />
      <aside
        className={`${classes.sidebar} bg-white dark:bg-gray-800 dark:text-gray-300`}
      >
        <nav>{children}</nav>
      </aside>
      <div className={classes.backdrop}></div>
      <div className={classes.label}>
        <label htmlFor="sidebar-toggle">
          <Menu />
          Menu
        </label>
      </div>
    </>
  );
}
