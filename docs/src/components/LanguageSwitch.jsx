import { ChevronDown, Languages, MoveUpRight } from "lucide-react";
import { defaultLanguage } from "../const.mjs";
import { usePathname } from "@lazarv/react-server";

const langName = {
  en: "English",
  ja: "日本語",
};

export default function LanguageSwitch({ lang }) {
  const pathname = usePathname();

  return (
    <div className="relative inline-flex items-center justify-center w-8 h-8 ml-2">
      <div
        htmlFor="dropdown"
        className="cursor-pointer group flex items-center"
      >
        <Languages />
        <ChevronDown className="size-3" />
        <ul className="absolute left-0 top-8 -ml-2 bg-white border border-gray-300 dark:bg-gray-800 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 ease-in-out">
          <li className="px-4 py-2 font-semibold ">{langName[lang]}</li>
          {Object.entries(langName).reduce((children, [newLang, name]) => {
            if (newLang !== lang) {
              children.push(
                <li key={newLang} className="px-4 py-2 ">
                  <a
                    href={`${newLang === defaultLanguage ? "/" : `/${newLang}`}${pathname.replace(new RegExp(`^/${lang}`), "")}`.replace(
                      /^\/+/,
                      "/"
                    )}
                    hrefLang={newLang}
                    className="flex gap-1 items-center text-sm text-nowrap"
                  >
                    {name} <MoveUpRight className="size-3 text-gray-500" />
                  </a>
                </li>
              );
            }
            return children;
          }, [])}
        </ul>
      </div>
    </div>
  );
}
