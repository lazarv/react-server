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
  //writeJSON,
} from "@lazarv/react-server-adapter-core";

const cwd = sys.cwd();
const awsDir = join(cwd, ".aws-lambda");
const outDir = join(awsDir, "output");
const outStaticDir = join(outDir, "static");
const adapterDir = dirname(fileURLToPath(import.meta.url));

export const adapter = createAdapter({
  name: "AWS Lambda",
  outDir,
  outStaticDir,
  handler: async ({
    // adapterOptions,
    // files,
    copy,
    // config,
    // reactServerDir,
    // reactServerOutDir,
    // root,
    // options,
  }) => {
    banner("building serverless functions");

    message("creating", "index.func module");
    const outServerDir = join(outDir, "functions/index.func");
    const entryFile = join(outServerDir, "index.mjs");

    await clearDirectory(outServerDir);
    await cp(join(adapterDir, "functions/index.mjs"), entryFile);

    success("index.func serverless function initialized.");

    await copy.server(outServerDir);
    await copy.dependencies(outServerDir, [entryFile]);
  },
  // deploy: {
  //   command: "vercel",
  //   args: ["deploy", "--prebuilt"],
  // },
});

export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}
