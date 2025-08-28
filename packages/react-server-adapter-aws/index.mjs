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

import mergeDeep from "./utilities/merge.mjs";

const cwd = sys.cwd();
const awsDirPath = ".aws-react-server";
const awsDir = join(cwd, awsDirPath);
const outDir = join(awsDir, "output");
const outStaticDir = join(outDir, "static");
const adapterDir = dirname(fileURLToPath(import.meta.url));

export const adapter = createAdapter({
  name: "AWS",
  outDir,
  outStaticDir: undefined,
  handler: async ({
    adapterOptions,
    files,
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
    const serveStaticFiles = adapterOptions?.serveStaticFiles ?? false;
    if (serveStaticFiles) {
      entryFileContent = entryFileContent.replace(
        "serveStaticFiles: false",
        "serveStaticFiles: true"
      );
    }

    await clearDirectory(outServerDir);
    await mkdir(outServerDir, { recursive: true });

    await writeFile(entryFile, entryFileContent, "utf-8");

    await writeJSON(join(outServerDir, "package.json"), {
      type: "module",
    });
    success("index.func serverless function initialized.");

    banner("detect aws deploy toolkit...");
    const toolkit = detectToolkit(adapterOptions);
    const toolkitConfig = getToolkitConfig(toolkit, adapterOptions);

    if (toolkit === "cdk") {
      await copy.static(join(outStaticDir, "public"));
      await copy.assets(join(outStaticDir, "client_assets"));
      await copy.client(join(outStaticDir, "client_assets"));
      await copy.public(join(outStaticDir, "public"));

      await writeToolkitConfig(toolkit, toolkitConfig);
    } else {
      await copy.static(outStaticDir);
      await copy.assets(outStaticDir);
      await copy.client(outStaticDir);
      await copy.public(outStaticDir);
    }
    await copy.server(outServerDir);
    await copy.dependencies(outServerDir, [entryFile]);

    await setupToolkit(toolkit, { files }, toolkitConfig);

    return {
      toolkit,
    };
  },
  deploy: deployToolkit,
});

async function deployToolkit({ /* adapterOptions , options,*/ handlerResult }) {
  const { toolkit } = handlerResult;

  switch (toolkit) {
    case "sst":
      return {
        command: "pnpm",
        args: ["sst", "deploy"],
      };
    case "cdk":
      return {
        command: "pnpm",
        args: ["cdk", "deploy", "--all"],
      };
    case "sls":
      return {
        command: "pnpm",
        args: ["sls", "deploy"],
      };
    default:
      return null;
  }
}

function detectToolkit(adapterOptions) {
  if (adapterOptions?.toolkitDefault) return adapterOptions.toolkitDefault;
  const toolkitConfigs = Object.keys(adapterOptions?.toolkit ?? {});
  if (toolkitConfigs.length === 1) return toolkitConfigs[0];
  if (toolkitConfigs.length > 1) {
    message(
      "Found multiple toolkits!",
      `Add e.g. '"toolkitDefault":"cdk"' to adapter options.`
    );
    return null;
  }
  if (existsSync(join(cwd, ".sst"))) {
    return "sst";
  } else if (existsSync(join(cwd, "cdk.json"))) {
    return "cdk";
  } else if (existsSync(join(cwd, "serverless.yml"))) {
    return "sls";
  }
  return null;
}

function getToolkitConfig(toolkit, adapterOptions) {
  if (toolkit === "sst") {
    return mergeDeep({}, adapterOptions?.toolkit?.sst);
  } else if (toolkit === "cdk") {
    return mergeDeep(
      {
        toolkitOutDir: awsDirPath,
        cdkPath: "cdk",
      },
      adapterOptions?.toolkit?.cdk
    );
  } else if (toolkit === "sls") {
    return mergeDeep({}, adapterOptions?.toolkit?.sls);
  }
  return null;
}

async function writeToolkitConfig(toolkit, config) {
  let configPath;
  if (toolkit === "sst") {
    return;
  } else if (toolkit === "cdk") {
    configPath = [config.cdkPath, "stack.config.ts"];
  } else if (toolkit === "sls") {
    return;
  }
  if (config) {
    await writeFile(
      join(cwd, ...configPath),
      `// this file is auto generated\nexport const StackConfig = ${JSON.stringify(config)};`,
      "utf-8"
    );
  }
}

async function setupToolkit(toolkit, adapter, toolkitConfig) {
  if (toolkit === null) {
    message("no toolkit detected.");
  } else {
    if (toolkit === "sst") {
      const reactStackTemplatePath = join(
        adapterDir,
        "setup",
        "sst/sst-react-server.ts.template"
      );
      const reactStackTargetPath = join(cwd, "sst-react-server.ts");
      const reactStackTemplateContent = await readFile(reactStackTemplatePath, {
        encoding: "utf-8",
      });
      const existsReactServerStack = existsSync(
        join(cwd, "sst-react-server.ts")
      );
      const reactStackTemplateVersion = reactStackTemplateContent.match(
        /\/\/ Version: (\d+\.\d+\.\d+)/
      )[1];
      const reactStackTargetVersion = existsReactServerStack
        ? ((await readFile(reactStackTargetPath, { encoding: "utf-8" })).match(
            /\/\/ Version: (\d+\.\d+\.\d+)/
          )?.[1] ?? "")
        : "";
      if (reactStackTemplateVersion !== reactStackTargetVersion) {
        await cp(
          join(adapterDir, "setup", "sst/sst-react-server.ts.template"),
          join(cwd, "sst-react-server.ts")
        );
        message(
          "found sst toolkit:",
          "'./sst-react-server.ts' stack added or replaced."
        );
      } else {
        message("found sst toolkit:", "sst-react-server.ts stack exists.");
      }
      await modifySstConfig(cwd);
      await sstFixExtentionsContentTypesMap(cwd);
    } else if (toolkit === "cdk") {
      if (await fileIsEmpty(join(cwd, "cdk.json"))) {
        await cp(join(adapterDir, "setup", toolkitConfig.cdkPath), cwd, {
          overwrite: true,
          recursive: true,
        });
        message("found cdk toolkit:", "cdk setup initialized.");
      } else {
        message("found cdk toolkit:", "cdk setup exists.");
      }
      const rsFiles = {
        static: await adapter.files.static(),
        compressed: await adapter.files.compressed(),
        assets: await adapter.files.assets(),
        client: await adapter.files.client(),
        public: await adapter.files.public(),
        server: await adapter.files.server(),
        //dependencies: await files.dependencies(),
      };
      await writeFile(
        join(awsDir, "static_files.json"),
        JSON.stringify(rsFiles, null, 0),
        "utf-8"
      );
    } else if (toolkit === "sls") {
      if (await fileIsEmpty(join(cwd, "serverless.yml"))) {
        await cp(join(adapterDir, "setup", "sls"), join(cwd), {
          overwrite: true,
          recursive: true,
        });
        message("found sls toolkit:", "serverless.yml initialized.");
      } else {
        message("found sls toolkit:", "serverless.yml exists.");
      }
    }
  }
  return toolkit;
}

async function fileIsEmpty(path) {
  const stats = await stat(path);
  return stats.size === 0;
}

async function modifySstConfig(cwd) {
  let dirty = false;
  const path = join(cwd, "sst.config.ts");
  const content = await readFile(path, { encoding: "utf-8" });
  const lines = content.split("\n");
  if (!content.includes("async run() {}")) return;
  if (!content.includes('./sst-react-server"')) {
    const importIndex = lines.findIndex((line) => line.startsWith("import"));
    lines.splice(
      importIndex + 2,
      0,
      'import { ReactServer } from "./sst-react-server";'
    );
    dirty = true;
  }
  if (content.includes("async run() {}")) {
    const packageJsonPath = join(cwd, "package.json");
    const packageJsonData = await readFile(packageJsonPath, {
      encoding: "utf-8",
    });
    const packageJson = JSON.parse(packageJsonData);
    const appName = capitalizeWords(packageJson.name);
    lines.forEach((line, index) => {
      if (line.includes("async run() {}")) {
        lines[index] = lines[index].replace(
          "async run() {}",
          `
  async run() {
    new ReactServer("${appName}", {
      server: {
        architecture: "arm64",
        runtime: "nodejs22.x",
      },
    });
  }`
        );
        dirty = true;
      }
    });
  }
  if (dirty) {
    await writeFile(path, lines.join("\n"), "utf-8");
    message(
      "found sst toolkit:",
      "fix missing 'new ReactServer()' in './sst.config.ts'."
    );
  }
}
// fix missing extention '.rsc' in '.sst/platform/src/components/base/base-site.ts'.
async function sstFixExtentionsContentTypesMap(cwd) {
  const sstBaseSiteFilePath = join(
    cwd,
    ".sst",
    "platform",
    "src",
    "components",
    "base",
    "base-site.ts"
  );

  if (existsSync(sstBaseSiteFilePath)) {
    const content = await readFile(sstBaseSiteFilePath, { encoding: "utf-8" });
    if (!content.includes(`[".x-component"]:`)) {
      await writeFile(
        sstBaseSiteFilePath,
        content.replace(
          `const extensions = {`,
          'const extensions = {\n  [".x-component"]: { mime: "text/x-component", isText: true },'
        ),
        "utf-8"
      );
      message(
        "sst toolkit:",
        "fix missing extention '.x-component' in '.sst/platform/src/components/base/base-site.ts'."
      );
    }
  }
}

function capitalizeWords(str) {
  return str
    .split(/[^a-zA-Z]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}
