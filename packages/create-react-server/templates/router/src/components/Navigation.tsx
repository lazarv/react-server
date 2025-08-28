"use client";

import { Link, usePathname } from "@lazarv/react-server/navigation";

export default function Navigation() {
  const pathname = usePathname("content");

  return (
    <nav
      className="sticky top-0 flex gap-4 bg-slate-200 p-4 dark:bg-zinc-800"
      data-pathname={pathname}
    >
      <Link
        to="/"
        target="content"
        push
        className="text-2xl uppercase font-bold px-4 [[data-pathname='/']_&]:text-indigo-500 dark:[[data-pathname='/']_&]:text-yellow-600"
      >
        Home
      </Link>
      <Link
        to="/about"
        target="content"
        push
        className="text-2xl uppercase font-bold px-4 [[data-pathname='/about']_&]:text-indigo-500 dark:[[data-pathname='/about']_&]:text-yellow-600"
      >
        About
      </Link>
    </nav>
  );
}
