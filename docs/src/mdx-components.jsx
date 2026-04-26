import CopyToClipboard from "./components/CopyToClipboard";
import { defaultLanguage } from "./const.mjs";
import { useLanguage } from "./i18n.mjs";

export default function useMDXComponents() {
  return {
    pre: (props) => {
      const { filename, className, children } = props;
      return (
        <pre {...props} className={className ?? ""}>
          {filename && (
            <div className="text-sm text-gray-500 dark:text-gray-400 [&+div_code]:mt-0">
              {filename}
            </div>
          )}
          <div className="relative">
            {children}
            <CopyToClipboard filename={filename} />
          </div>
        </pre>
      );
    },
    table: (props) => (
      <div className="max-w-full overflow-x-auto mb-4">
        <table {...props} className={`${props.className ?? ""} !mb-0`} />
      </div>
    ),
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
          target={href.startsWith("http") ? "_blank" : undefined}
        >
          {children}
        </a>
      );
    },
  };
}
