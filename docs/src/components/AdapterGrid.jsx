const adapters = [
  {
    name: "Vercel",
    href: "/deploy/vercel",
    description: "Serverless & edge functions",
  },
  {
    name: "Netlify",
    href: "/deploy/netlify",
    description: "Serverless functions & edge CDN",
  },
  {
    name: "Cloudflare",
    href: "/deploy/cloudflare",
    description: "Workers & Pages",
  },
  {
    name: "AWS Lambda",
    href: "/deploy/aws",
    description: "Serverless functions",
  },
  {
    name: "Bun",
    href: "/deploy/bun",
    description: "Standalone Bun server",
  },
  {
    name: "Deno",
    href: "/deploy/deno",
    description: "Standalone Deno server",
  },
  {
    name: "Azure Functions",
    href: "/deploy/azure",
    description: "Functions v4 with streaming",
  },
  {
    name: "Azure Static Web Apps",
    href: "/deploy/azure-swa",
    description: "Managed functions & CDN",
  },
  {
    name: "Docker",
    href: "/deploy/docker",
    description: "Containerized Node.js server",
  },
];

export default function AdapterGrid() {
  return (
    <div className="my-4 grid grid-cols-1 md:grid-cols-3 gap-4 not-prose">
      {adapters.map(({ name, href, description }) => (
        <a
          key={href}
          href={href}
          className="adapter-card flex flex-col rounded-xl p-4 bg-gray-50 dark:bg-gray-800 text-xs shadow-lg dark:shadow-[rgba(255,255,255,0.1)] border border-gray-500 no-underline hover:no-underline transition-colors hover:border-gray-300 dark:hover:border-gray-400"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <span className="adapter-card-title relative inline-block self-start font-semibold text-base text-black dark:text-gray-300 mb-1">
            {name}
          </span>
          <span className="font-normal text-sm text-gray-500 dark:text-gray-400">
            {description}
          </span>
        </a>
      ))}
    </div>
  );
}
