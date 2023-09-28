import { createReadStream } from "node:fs";
import { createRequire } from "node:module";
import { extname, join, relative } from "node:path";
import { createInterface } from "node:readline";

import glob from "fast-glob";

import packageJson from "../../package.json" assert { type: "json" };
import { cwd } from "../sys.mjs";

const __require = createRequire(import.meta.url);
const hmrSrc = `/${packageJson.name}/client/hmr.mjs`;

async function readFirstLine(path) {
  const inputStream = createReadStream(path);
  try {
    for await (const line of createInterface(inputStream)) return line;
    return ""; // If the file is empty.
  } finally {
    inputStream.destroy(); // Destroy file stream.
  }
}

export default function viteReactServer(type) {
  return {
    name: "react-server",
    async config(config) {
      if (type) {
        const extensions = config.resolve?.extensions || [
          ".mjs",
          ".js",
          ".mts",
          ".ts",
          ".jsx",
          ".tsx",
        ];
        const pattern = join(
          cwd(),
          `**/*{.${extensions.map((ext) => ext.slice(1)).join(",")}}`
        );
        const entries = await glob(pattern, {
          ignore: ["**/node_modules/**/*"],
        });
        for (const entry of entries) {
          const firstLine = await readFirstLine(entry);
          if (
            firstLine.includes(`"use client";`) ||
            firstLine.includes(`'use client';`)
          ) {
            const specifier = relative(cwd(), entry);
            if (!specifier.startsWith("..")) {
              const name = specifier.replace(extname(specifier), "");
              config.build.rollupOptions.input[`${type}/${name}`] = entry;
            }
          }
        }
      }
    },
    load(id) {
      if (id === hmrSrc) {
        return `
				import RefreshRuntime from "/@react-refresh";
				RefreshRuntime.injectIntoGlobalHook(window);
				window.$RefreshReg$ = () => {};
				window.$RefreshSig$ = () => (type) => type;
				window.__vite_plugin_react_preamble_installed__ = true;
				console.log("Hot Module Replacement installed.");
				import("${__require.resolve("@lazarv/react-server/client/entry.client.jsx")}");
			`;
      }
    },
  };
}
