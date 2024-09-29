import { existsSync } from "node:fs";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
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
} from "@lazarv/react-server-adapter-core";

const cwd = sys.cwd();
const awsDir = join(cwd, ".aws-react-server");
const outDir = join(awsDir, "output");
const outStaticDir = join(outDir, "static");
const adapterDir = dirname(fileURLToPath(import.meta.url));

export const adapter = createAdapter({
  name: "AWS",
  outDir,
  outStaticDir,
  handler: async ({
    adapterOptions,
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

    let entryFileContent = await readFile(
      join(adapterDir, "functions/index.mjs"),
      { encoding: "utf-8" }
    );
    const streaming = adapterOptions?.streaming === true;
    if (streaming) {
      entryFileContent = entryFileContent.replace(
        "awsLambdaAdapter",
        "awsLambdaAdapterStreaming"
      );
    }

    await clearDirectory(outServerDir);
    await mkdir(outServerDir, { recursive: true });

    await writeFile(entryFile, entryFileContent, "utf-8");

    await writeJSON(join(outServerDir, "package.json"), {
      type: "module",
    });
    success("index.func serverless function initialized.");

    await copy.server(outServerDir);
    await copy.dependencies(outServerDir, [entryFile]);

    banner("detect aws build tool");
    await setupFramework();
  },
  deploy: deployFramework(),
});

function detectFramework() {
  if (existsSync(join(cwd, ".sst"))) {
    return "sst";
  } else if (existsSync(join(cwd, "cdk.json"))) {
    return "cdk";
  } else if (existsSync(join(cwd, "serverless.yml"))) {
    return "sls";
  }
  return null;
}

async function setupFramework() {
  const framework = detectFramework();
  if (framework === "sst") {
    if (
      !existsSync(join(cwd, ".sst/platform/src/components/aws/react-server.ts"))
    ) {
      await cp(
        join(adapterDir, "setup", "sst/react-server.ts.template"),
        join(cwd, ".sst/platform/src/components/aws/react-server.ts")
      );
      message("found sst framework:", "missing react-server.ts stack added.");
    } else {
      message("found sst framework:", "react-server.ts stack exists.");
    }
  } else if (framework === "cdk") {
    if (await fileIsEmpty(join(cwd, "cdk.json"))) {
      await cp(join(adapterDir, "setup", "cdk"), cwd, {
        overwrite: true,
        recursive: true,
      });
      message("found cdk framework:", "cdk setup initialized.");
    } else {
      message("found cdk framework:", "cdk setup exists.");
    }
  } else if (framework === "sls") {
    if (await fileIsEmpty(join(cwd, "serverless.yml"))) {
      await cp(join(adapterDir, "setup", "sls"), join(cwd), {
        overwrite: true,
        recursive: true,
      });
      message("found sls framework:", "serverless.yml initialized.");
    } else {
      message("found sls framework:", "serverless.yml exists.");
    }
  } else {
    message("no framework detected.");
  }
}

function deployFramework() {
  const framework = detectFramework();
  if (framework === "sst") {
    return {
      command: "pnpm",
      args: ["sst", "deploy"],
    };
  } else if (framework === "cdk") {
    return {
      command: "pnpm",
      args: ["cdk", "deploy", "--all"],
    };
  } else if (framework === "sls") {
    return {
      command: "pnpm",
      args: ["sls", "deploy"],
    };
  }
  return null;
}

async function fileIsEmpty(path) {
  const stats = await stat(path);
  return stats.size === 0;
}

export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}
