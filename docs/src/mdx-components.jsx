import CopyToClipboard from "./components/CopyToClipboard";
import { defaultLanguage } from "./const.mjs";
import { useLanguage } from "./i18n.mjs";

export default function useMDXComponents() {
  return {
    pre: (props) => {
      const { filename, className, children } = props;
      return (
        <pre {...props} className={`${className ?? ""} relative`}>
          {filename && (
            <div className="text-sm text-gray-500 dark:text-gray-400 [&+code]:mt-0">
              {filename}
            </div>
          )}
          {children}
          <CopyToClipboard filename={filename} />
        </pre>
      );
    },
    a: ({ children, href, ...props }) => {
      const lang = useLanguage();
      return (
        <a
          {...props}
          href={
            href.startsWith("http")
              ? href
              : `${lang === defaultLanguage ? "" : `/${lang}`}${href}`
          }
          hrefLang={lang}
        >
          {children}
        </a>
      );
    },
  };
}
