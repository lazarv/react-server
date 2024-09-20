import { usePathname } from "@lazarv/react-server";
import { ClientOnly } from "@lazarv/react-server/client";

import GitHub from "../../../../public/github.svg?react";
import AlgoliaSearch from "../../../components/AlgoliaSearch";
import DarkModeSwitch from "../../../components/DarkModeSwitch";
import { defaultLanguage } from "../../../const.mjs";

export default function Header({ lang }) {
  const baseUrl = lang === defaultLanguage ? "/" : `/${lang}`;
  const pathname = usePathname();

  const activeClass = (path) =>
    pathname.includes(`/${lang}/${path}`)
      ? " text-indigo-500 dark:text-yellow-600"
      : "";

  return (
    <header>
      <nav className="relative">
        <a href={baseUrl} className="pl-7 left-2 sm:absolute">
          <img
            src="/react-server.svg"
            className="size-6 absolute left-0 top-1/2 -translate-y-1/2 -mt-1"
            alt="@lazarv/react-server logo"
          />
          <h4>@lazarv</h4>
          <h3>react-server</h3>
        </a>
        <a
          href={`${baseUrl}guide`}
          className={`ml-auto hidden lg:inline${activeClass("guide")}`}
        >
          Guide
        </a>
        <a
          href={`${baseUrl}integrations`}
          className={`hidden lg:inline${activeClass("integrations")}`}
        >
          Integrations
        </a>
        <a
          href={`${baseUrl}framework`}
          className={`hidden lg:inline${activeClass("framework")}`}
        >
          Framework
        </a>
        <a
          href={`${baseUrl}router`}
          className={`hidden lg:inline${activeClass("router")}`}
        >
          Router
        </a>
        <a
          href={`${baseUrl}deploy`}
          className={`hidden lg:inline${activeClass("deploy")}`}
        >
          Deploy
        </a>
        <a
          href={`${baseUrl}tutorials`}
          className={`mr-auto xl:mr-0 hidden lg:inline${activeClass("tutorials")}`}
        >
          Tutorials
        </a>
        <a
          href={`${baseUrl}team`}
          className={`mr-auto hidden xl:inline${activeClass("team")}`}
        >
          Team
        </a>
        <ClientOnly>
          <AlgoliaSearch />
          <DarkModeSwitch className="absolute right-12" />
        </ClientOnly>
        <a
          href="https://github.com/lazarv/react-server"
          target="_blank"
          rel="noreferrer"
          className="absolute right-3 sm:right-4"
          aria-label="GitHub"
        >
          <GitHub className="size-4 max-w-none" />
        </a>
      </nav>
    </header>
  );
}
