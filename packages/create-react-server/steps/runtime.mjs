const detectRuntime = () => {
  if (typeof globalThis.Deno !== "undefined") return "deno";
  if (typeof globalThis.Bun !== "undefined") return "bun";
  return "node";
};

function getEntrypoint(mergeArray) {
  let devScript = "react-server";
  for (const entry of mergeArray) {
    if (entry.scripts?.dev) {
      devScript = entry.scripts.dev;
    }
  }
  // devScript is like "react-server" or "react-server ./src/App.jsx"
  const args = devScript.replace(/^react-server\s*/, "").trim();
  return args ? ` ${args}` : "";
}

export default async (context) => {
  const runtime = detectRuntime();

  if (runtime === "node") {
    return {
      ...context,
      props: { ...context.props, runtime },
    };
  }

  const partials = { ...context.partials };
  const entry = getEntrypoint(partials["package.json"].merge);

  if (runtime === "bun") {
    partials["package.json"] = {
      ...partials["package.json"],
      merge: [
        ...partials["package.json"].merge,
        {
          scripts: {
            dev: `bun --bun react-server${entry}`,
            build: `bun --bun react-server build${entry}`,
            start: "bun --bun react-server start",
          },
          trustedDependencies: ["@lazarv/react-server"],
        },
      ],
    };
  }

  if (runtime === "deno") {
    partials["package.json"] = {
      ...partials["package.json"],
      merge: [
        ...partials["package.json"].merge,
        {
          scripts: {
            dev: `deno run -A npm:@lazarv/react-server${entry}`,
            build: `deno run -A npm:@lazarv/react-server build${entry}`,
            start: "deno run -A npm:@lazarv/react-server start",
          },
        },
      ],
    };

    partials["deno.json"] = {
      type: "json",
      merge: [
        {
          nodeModulesDir: "manual",
          unstable: ["byonm"],
        },
      ],
    };
  }

  return {
    ...context,
    partials,
    props: {
      ...context.props,
      runtime,
    },
  };
};
