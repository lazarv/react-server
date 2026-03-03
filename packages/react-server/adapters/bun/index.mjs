import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as sys from "@lazarv/react-server/lib/sys.mjs";
import {
  banner,
  createAdapter,
  message,
  success,
  writeJSON,
} from "@lazarv/react-server/adapters/core";
import { writeFile } from "node:fs/promises";

const cwd = sys.cwd();
const bunDir = join(cwd, ".bun");
const outDir = bunDir;
const outStaticDir = join(outDir, "static");
const outServerDir = join(outDir, "server");
const adapterDir = dirname(fileURLToPath(import.meta.url));

/**
 * Build options that the Bun adapter requires.
 * Uses edge build mode to bundle everything into a single server entry.
 */
export const buildOptions = {
  edge: {
    entry: join(adapterDir, "server/entry.mjs"),
  },
};

export const adapter = createAdapter({
  name: "Bun",
  outDir,
  outStaticDir,
  outServerDir,
  handler: async function ({ adapterOptions, files, reactServerOutDir }) {
    // Collect all static file paths for the route map
    banner("generating static route map", { emoji: "🗺️" });
    const [staticFiles, assetFiles, clientFiles, publicFiles] =
      await Promise.all([
        files.static(),
        files.assets(),
        files.client(),
        files.public(),
      ]);

    // Build the static route entries as code lines
    // All files are relative to outStaticDir which is .bun/static/
    const staticEntries = [];
    const addFile = (urlPath, filePath) => {
      staticEntries.push(
        `  ${JSON.stringify(urlPath)}: new Response(Bun.file(join(staticDir, ${JSON.stringify(filePath)})))`
      );
    };

    for (const f of staticFiles) {
      addFile(`/${f}`, f);
      // Serve index.html at the directory path too
      if (f.endsWith("/index.html")) {
        const dirPath = "/" + f.slice(0, -"/index.html".length);
        addFile(dirPath || "/", f);
      } else if (f === "index.html") {
        addFile("/", f);
      }
    }
    for (const f of assetFiles) addFile(`/${f}`, f);
    for (const f of clientFiles) addFile(`/${f}`, f);
    for (const f of publicFiles) addFile(`/${f}`, f);

    success(`${staticEntries.length} static routes mapped`);

    // Generate the start script
    banner("creating Bun start script", { emoji: "🥟" });

    // Try to get app name from adapter options or package.json
    let appName = adapterOptions?.name;
    if (!appName) {
      const packageJsonPath = join(cwd, "package.json");
      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(
            readFileSync(packageJsonPath, "utf-8")
          );
          appName = packageJson.name?.replace(/^@[^/]+\//, "");
        } catch {
          // Ignore parsing errors
        }
      }
    }

    // Generate start.mjs with hardcoded static routes built at build time
    const startScript = `import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir = join(__dirname, "static");

process.chdir(join(__dirname, "server/${reactServerOutDir}"));
const { handleRequest, port, hostname } = await import("./server/${reactServerOutDir}/server/edge.mjs");

Bun.serve({
  port,
  hostname,
  static: {
${staticEntries.join(",\n")}
  },
  async fetch(request) {
    return handleRequest(request, { runtime: "bun" });
  },
});

console.log(\`Bun server listening on http://\${hostname}:\${port}\`);
`;

    message("creating", "start.mjs");
    await writeFile(join(outDir, "start.mjs"), startScript);
    success("start script created");

    // Write a package.json for the output (for easy deployment)
    banner("creating deployment metadata", { emoji: "📦" });
    message("creating", "package.json");
    await writeJSON(join(outDir, "package.json"), {
      name: appName ?? "react-server-app",
      private: true,
      type: "module",
      scripts: {
        start: "bun start.mjs",
      },
    });
    success("deployment metadata created");
  },
  deploy: {
    command: "bun",
    args: [".bun/start.mjs"],
  },
});

export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}
