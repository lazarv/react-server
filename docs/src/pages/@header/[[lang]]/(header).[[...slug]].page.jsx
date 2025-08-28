import { usePathname } from "@lazarv/react-server";

import GitHub from "../../../../public/github.svg?react";
import AlgoliaSearch from "../../../components/AlgoliaSearch";
import DarkModeSwitch from "../../../components/DarkModeSwitch";
import LanguageSwitch from "../../../components/LanguageSwitch";
import { defaultLanguage } from "../../../const.mjs";
import { m } from "../../../i18n.mjs";

export default function Header({ lang }) {
  const baseUrl = lang === defaultLanguage ? "/" : `/${lang}/`;
  const pathname = usePathname();

  const activeClass = (path) =>
    pathname.includes(`/${lang}/${path}`)
      ? " text-indigo-500 dark:text-yellow-600"
      : "";

  return (
    <header>
      <nav>
        <a href={baseUrl} className="pl-7">
          <img
            src="/react-server.svg"
            className="size-6 absolute left-0 top-1/2 -translate-y-1/2 -mt-1"
            alt="@lazarv/react-server logo"
          />
          <h4>@lazarv</h4>
          <h3>react-server</h3>
        </a>
        <div className="container max-w-screen-lg flex gap-8 mx-auto">
          <a
            href={`${baseUrl}guide`}
            className={`ml-auto hidden lg:inline${activeClass("guide")}`}
          >
            {m.category_guide()}
          </a>
          <a
            href={`${baseUrl}integrations`}
            className={`hidden lg:inline${activeClass("integrations")}`}
          >
            {m.category_integrations()}
          </a>
          <a
            href={`${baseUrl}framework`}
            className={`hidden lg:inline${activeClass("framework")}`}
          >
            {m.category_framework()}
          </a>
          <a
            href={`${baseUrl}router`}
            className={`hidden lg:inline${activeClass("router")}`}
          >
            {m.category_router()}
          </a>
          <a
            href={`${baseUrl}deploy`}
            className={`hidden lg:inline${activeClass("deploy")}`}
          >
            {m.category_deploy()}
          </a>
          <a
            href={`${baseUrl}tutorials`}
            className={`mr-auto xl:mr-0 hidden lg:inline${activeClass("tutorials")}`}
          >
            {m.category_tutorials()}
          </a>
          <a
            href={`${baseUrl}team`}
            className={`mr-auto hidden xl:inline${activeClass("team")}`}
          >
            {m.category_team()}
          </a>
        </div>
        <div className="h-full ml-auto flex gap-2 items-center">
          <AlgoliaSearch
            placeholder={m.algolia_placeholder()}
            translations={{
              button: {
                buttonText: m.algolia_buttonText(),
                buttonAriaLabel: m.algolia_buttonText(),
              },
              modal: {
                searchBox: {
                  resetButtonTitle: m.algolia_resetButtonTitle(),
                  resetButtonAriaLabel: m.algolia_resetButtonTitle(),
                  cancelButtonText: m.algolia_cancelButtonText(),
                  cancelButtonAriaLabel: m.algolia_cancelButtonText(),
                  searchInputLabel: m.algolia_searchInputLabel(),
                },
                footer: {
                  selectText: m.algolia_selectText(),
                  selectKeyAriaLabel: m.algolia_selectKeyAriaLabel(),
                  navigateText: m.algolia_navigateText(),
                  navigateUpKeyAriaLabel: m.algolia_navigateUpKeyAriaLabel(),
                  navigateDownKeyAriaLabel:
                    m.algolia_navigateDownKeyAriaLabel(),
                  closeText: m.algolia_closeText(),
                  closeKeyAriaLabel: m.algolia_closeKeyAriaLabel(),
                  searchByText: m.algolia_searchByText(),
                },
                errorScreen: {
                  titleText: m.algolia_errorScreen_titleText(),
                  helpText: m.algolia_errorScreen_helpText(),
                },
                startScreen: {
                  recentSearchesTitle: m.algolia_recentSearchesTitle(),
                  noRecentSearchesText: m.algolia_noRecentSearchesText(),
                  saveRecentSearchButtonTitle:
                    m.algolia_saveRecentSearchButtonTitle(),
                  removeRecentSearchButtonTitle:
                    m.algolia_removeRecentSearchButtonTitle(),
                  favoriteSearchesTitle: m.algolia_favoriteSearchesTitle(),
                  removeFavoriteSearchButtonTitle:
                    m.algolia_removeFavoriteSearchButtonTitle(),
                },
                noResultsScreen: {
                  noResultsText: m.algolia_noResultsText(),
                  suggestedQueryText: m.algolia_suggestedQueryText(),
                  reportMissingResultsText:
                    m.algolia_reportMissingResultsText(),
                  reportMissingResultsLinkText:
                    m.algolia_reportMissingResultsLinkText(),
                },
              },
            }}
          />
          <LanguageSwitch lang={lang} />
          <DarkModeSwitch />
          <a
            href="https://github.com/lazarv/react-server"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="size-8 inline-flex items-center justify-center"
          >
            <GitHub className="size-4 max-w-none" />
          </a>
        </div>
      </nav>
    </header>
  );
}
