import { ChevronRight } from "lucide-react";
import Menu from "../../public/menu.svg?react";
import classes from "./Sidebar.module.css";

export default function Sidebar({ id, menu, right, children }) {
  const aside = (
    <aside
      className={`${classes.sidebar} bg-white dark:bg-gray-800 dark:text-gray-300`}
    >
      <nav>{children}</nav>
    </aside>
  );

  if (!menu) return aside;

  return (
    <div
      className={`${classes.root} ${right ? classes.right : ""} fixed top-12 h-12 w-full flex lg:sticky lg:w-auto lg:top-16 lg:h-full bg-white dark:bg-zinc-900 border-b dark:border-slate-900 lg:!bg-transparent before:bg-white before:dark:bg-zinc-900`}
    >
      <input type="checkbox" id={id} className={classes.toggle} />
      {aside}
      <div className={classes.backdrop}></div>
      <div className={classes.label}>
        <label htmlFor={id}>
          {!right && <Menu className={classes.menu} />}
          {menu}
          {right && <ChevronRight className={classes.arrow} />}
        </label>
      </div>
    </div>
  );
}
