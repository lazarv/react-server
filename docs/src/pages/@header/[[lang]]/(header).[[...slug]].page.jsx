import { ClientOnly } from "@lazarv/react-server/client";

import GitHub from "../../../../public/github.svg?react";
import AlgoliaSearch from "../../../components/AlgoliaSearch";
import DarkModeSwitch from "../../../components/DarkModeSwitch";
import { defaultLanguage } from "../../../const.mjs";

export default function Header({ lang }) {
  const baseUrl = lang === defaultLanguage ? "/" : `/${lang}`;

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
        <a href={`${baseUrl}guide`} className="ml-auto hidden lg:inline">
          Guide
        </a>
        <a href={`${baseUrl}framework`} className="hidden lg:inline">
          Framework
        </a>
        <a href={`${baseUrl}router`} className="hidden lg:inline">
          Router
        </a>
        <a href={`${baseUrl}deploy`} className="hidden lg:inline">
          Deploy
        </a>
        <a href={`${baseUrl}tutorials`} className="hidden lg:inline">
          Tutorials
        </a>
        <a href={`${baseUrl}team`} className="mr-auto hidden lg:inline">
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
