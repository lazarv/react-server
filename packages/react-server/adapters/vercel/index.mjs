import { cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as sys from "@lazarv/react-server/lib/sys.mjs";
import {
  banner,
  clearDirectory,
  createAdapter,
  message,
  success,
  writeJSON,
} from "@lazarv/react-server/adapters/core";

const cwd = sys.cwd();
const vercelDir = join(cwd, ".vercel");
const outDir = join(vercelDir, "output");
const outStaticDir = join(outDir, "static");
const adapterDir = dirname(fileURLToPath(import.meta.url));

export const adapter = createAdapter({
  name: "Vercel",
  outDir,
  outStaticDir,
  handler: async function ({ adapterOptions, copy }) {
    if (adapterOptions?.serverlessFunctions !== false) {
      banner("building serverless functions", { emoji: "⚡" });

      message("creating", "index.func module");
      const outServerDir = join(outDir, "functions/index.func");
      const entryFile = join(outServerDir, "index.mjs");

      await clearDirectory(outServerDir);
      await cp(join(adapterDir, "functions/index.mjs"), entryFile);

      message("creating", "index.func configuration");
      await writeJSON(join(outServerDir, ".vc-config.json"), {
        runtime: "nodejs20.x",
        handler: "index.mjs",
        launcherType: "Nodejs",
        shouldAddHelpers: true,
        supportsResponseStreaming: true,
        ...adapterOptions?.serverlessFunctions?.index,
      });
      success("index.func serverless function initialized");

      await copy.server(outServerDir);
      await copy.dependencies(outServerDir, [entryFile]);

      adapterOptions.routes = [
        {
          src: "^/(.*)",
          dest: "/",
        },
        ...(adapterOptions.routes ?? []),
      ];
    }

    banner("creating deployment configuration", { emoji: "⚙️" });
    message("creating", "config.json");
    await writeJSON(join(outDir, "config.json"), {
      version: 3,
      ...adapterOptions,
      routes: [
        {
          src: "/(.*)(@([^.]+)\\.)?(rsc|remote)\\.x-component$",
          headers: {
            "Content-Type": "text/x-component; charset=utf-8",
          },
        },
        { handle: "filesystem" },
        ...(adapterOptions?.routes ?? []),
        adapterOptions?.routes?.find((route) => route.status === 404) ?? {
          src: "/(.*)",
          status: 404,
          dest: "/404/index.html",
        },
      ],
    });
    success("configuration created");
  },
  deploy: {
    command: "vercel",
    args: ["deploy", "--prebuilt"],
  },
});

export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}
