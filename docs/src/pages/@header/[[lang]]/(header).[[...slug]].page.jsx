import { ClientOnly } from "@lazarv/react-server/client";

import GitHub from "../../../../public/github.svg?react";
import DarkModeSwitch from "../../../components/DarkModeSwitch";
import { defaultLanguage } from "../../../const.mjs";

export default function Header({ lang }) {
  const baseUrl = lang === defaultLanguage ? "/" : `/${lang}`;

  return (
    <header>
      <nav>
        <a href={baseUrl} className="relative pl-7">
          <img
            src="/react-server.svg"
            className="size-6 absolute left-0 top-1/2 -translate-y-1/2 -mt-1"
          />
          <h4>@lazarv</h4>
          <h3>react-server</h3>
        </a>
        <a href={`${baseUrl}guide`} className="ml-auto">
          Guide
        </a>
        <a href={`${baseUrl}team`} className="mr-auto">
          Team
        </a>
        <ClientOnly>
          <DarkModeSwitch className="absolute right-8 sm:right-12" />
        </ClientOnly>
        <a
          href="https://github.com/lazarv/react-server"
          target="_blank"
          rel="noreferrer"
          className="absolute right-3 sm:right-4"
        >
          <GitHub className="size-4 max-w-none" />
        </a>
      </nav>
    </header>
  );
}
