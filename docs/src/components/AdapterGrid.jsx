import { useLanguage } from "../i18n.mjs";
import { defaultLanguage } from "../const.mjs";

const adapters = [
  {
    name: "Vercel",
    href: "/deploy/vercel",
    description: {
      en: "Serverless & edge functions",
      ja: "サーバーレス & エッジ関数",
    },
  },
  {
    name: "Netlify",
    href: "/deploy/netlify",
    description: {
      en: "Serverless functions & edge CDN",
      ja: "サーバーレス関数 & エッジ CDN",
    },
  },
  {
    name: "Cloudflare",
    href: "/deploy/cloudflare",
    description: {
      en: "Workers & Pages",
      ja: "Workers & Pages",
    },
  },
  {
    name: "AWS Lambda",
    href: "/deploy/aws",
    description: {
      en: "Serverless functions",
      ja: "サーバーレス関数",
    },
  },
  {
    name: "Bun",
    href: "/deploy/bun",
    description: {
      en: "Standalone Bun server",
      ja: "スタンドアロン Bun サーバー",
    },
  },
  {
    name: "Deno",
    href: "/deploy/deno",
    description: {
      en: "Standalone Deno server",
      ja: "スタンドアロン Deno サーバー",
    },
  },
  {
    name: "Azure Functions",
    href: "/deploy/azure",
    description: {
      en: "Functions v4 with streaming",
      ja: "ストリーミング対応 Functions v4",
    },
  },
  {
    name: "Azure Static Web Apps",
    href: "/deploy/azure-swa",
    description: {
      en: "Managed functions & CDN",
      ja: "マネージド関数 & CDN",
    },
  },
  {
    name: "Firebase Functions",
    href: "/deploy/firebase",
    description: {
      en: "Cloud Functions v2 with streaming",
      ja: "ストリーミング対応 Cloud Functions v2",
    },
  },
  {
    name: "Docker",
    href: "/deploy/docker",
    description: {
      en: "Node.js, Bun, or Deno container",
      ja: "Node.js、Bun、または Deno コンテナ",
    },
  },
];

export default function AdapterGrid() {
  const lang = useLanguage();
  return (
    <div className="my-4 grid grid-cols-1 md:grid-cols-3 auto-rows-fr gap-4 not-prose">
      {adapters.map(({ name, href, description }) => (
        <a
          key={href}
          href={`${lang === defaultLanguage ? "" : `/${lang}`}${href}`}
          hrefLang={lang}
          className="adapter-card flex flex-col rounded-xl p-4 bg-gray-50 dark:bg-gray-800 text-xs shadow-lg dark:shadow-[rgba(255,255,255,0.1)] border border-gray-500 no-underline hover:no-underline transition-colors hover:border-gray-300 dark:hover:border-gray-400"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <span className="adapter-card-title relative inline-block self-start font-semibold text-base text-black dark:text-gray-300 mb-1">
            {name}
          </span>
          <span className="font-normal text-sm text-gray-500 dark:text-gray-400">
            {description[lang] ?? description.en}
          </span>
        </a>
      ))}
    </div>
  );
}
