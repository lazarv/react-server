import { spawn } from "node:child_process";
import { lstatSync, readlinkSync } from "node:fs";
import { cp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
} from "node:path";

import { moduleAliases } from "@lazarv/react-server/lib/loader/module-alias.mjs";
import * as sys from "@lazarv/react-server/lib/sys.mjs";
import packageJson from "@lazarv/react-server/package.json" with { type: "json" };
import { getContext } from "@lazarv/react-server/server/context.mjs";
import {
  CONFIG_CONTEXT,
  CONFIG_ROOT,
} from "@lazarv/react-server/server/symbols.mjs";
import { nodeFileTrace, resolve } from "@vercel/nft";
import cliProgress from "cli-progress";
import spinners from "cli-spinners";
import glob from "fast-glob";
import logUpdate from "log-update";
import colors from "picocolors";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();

const PROGRESS_LIMIT =
  process.env.CI || process.env.REACT_SERVER_PROGRESS_LIMIT
    ? Infinity
    : process.env.REACT_SERVER_PROGRESS_LIMIT
      ? parseInt(process.env.REACT_SERVER_PROGRESS_LIMIT) || 50
      : 50;

let interval;

const oldConsoleLog = console.log;
console.log = function (...args) {
  clearInterval(interval);
  oldConsoleLog(...args);
};

export function banner(message) {
  const spinner = spinners.bouncingBar;
  console.log();

  logUpdate(
    `${colors.cyan(`${packageJson.name.split("/").pop()}/${packageJson.version}`)} ${colors.green(message)}`
  );

  let i = -1;
  interval = setInterval(() => {
    i = ++i % spinner.frames.length;
    logUpdate(
      `${colors.cyan(`${packageJson.name.split("/").pop()}/${packageJson.version}`)} ${colors.green(message)} ${colors.magenta(spinner.frames[i])}`
    );
  }, spinner.interval);
}

export function createProgress(message, total, start = 0) {
  if (process.env.CI || total < PROGRESS_LIMIT) {
    return null;
  }

  clearInterval(interval);
  const progress = new cliProgress.SingleBar({
    format: `${message} ${colors.magenta("[{bar}]")} {percentage}%${colors.gray(" | ETA: {eta}s | {value}/{total}")}`,
  });
  progress.start(total, start);
  return progress;
}

export function clearProgress() {
  clearInterval(interval);
}

export function getConfig() {
  return getContext(CONFIG_CONTEXT)?.[CONFIG_ROOT];
}

export function getPublicDir() {
  const config = getConfig();
  return join(
    cwd,
    typeof config.public === "string" ? config.public : "public"
  );
}

export async function clearDirectory(dir) {
  await rm(dir, { recursive: true, force: true });
}

export async function getFiles(pattern, srcDir = cwd) {
  return glob(pattern, {
    onlyFiles: true,
    cwd: srcDir,
  });
}

export function message(primary, secondary) {
  if (!secondary) {
    console.log(primary);
  } else if (primary && secondary) {
    console.log(`${primary} ${colors.gray(secondary)}`);
  } else {
    console.log();
  }
}

export function success(message) {
  console.log(`${colors.green("✓")} ${message}\n`);
}

const extensionColor = {
  ".json": "magenta",
  ".css": "magenta",
};
export function copyMessage(file, srcDir, destDir, reactServerOutDir) {
  console.log(
    `copy ${colors
      .gray(
        `${relative(cwd, reactServerOutDir)}/${relative(reactServerOutDir, srcDir)}/${colors.cyan(file)}`.replace(
          /^\/+/,
          ""
        )
      )
      .replace(
        /\/+/g,
        "/"
      )} => ${colors.gray(`${relative(cwd, destDir)}/${colors[extensionColor[extname(file)] ?? "cyan"](file)}`).replace(/^\/+/, "")}`
  );
}

export function copy(srcDir, destDir, reactServerOutDir) {
  return async (file) => {
    const src = join(srcDir, file);
    const dest = join(destDir, file);
    copyMessage(file, srcDir, destDir, reactServerOutDir);
    await cp(src, dest);
  };
}

export async function progress({ message, files, onProgress, onFile }) {
  const progress = createProgress(message, files.length);
  const promises = files.map(
    progress
      ? async (file) => {
          progress.increment();
          return onProgress(file);
        }
      : onFile
  );
  await Promise.all(promises);
  progress?.stop();
  success(`${files.length} files copied.`);
}

export async function copyFiles(
  message,
  files,
  srcDir,
  destDir,
  reactServerOutDir
) {
  if (files.length > 0) {
    banner(message);
    await Promise.all(files.map(copy(srcDir, destDir, reactServerOutDir)));
    success(`${files.length} files copied.`);
  }
}

export async function writeJSON(file, data) {
  return writeFile(file, JSON.stringify(data, null, 2));
}

export async function getDependencies(adapterFiles, reactServerDir) {
  let rootDir = cwd;
  let lockFile = [];
  while (lockFile.length === 0) {
    lockFile = await glob(
      [
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "bun.lockb",
        "bun.lock",
      ],
      {
        onlyFiles: true,
        cwd: rootDir,
      }
    );
    if (lockFile.length > 0) {
      break;
    }
    rootDir = join(rootDir, "..");
    if (rootDir === "/") {
      rootDir = cwd;
      break;
    }
  }

  const sourceFiles = await glob("server/**/*.mjs", {
    onlyFiles: true,
    absolute: true,
    cwd: reactServerDir,
  });
  const reactServerDeps = [
    __require.resolve("@lazarv/react-server/lib/start/render-stream.mjs", {
      paths: [cwd],
    }),
    __require.resolve("@lazarv/react-server/lib/loader/node-loader.mjs", {
      paths: [cwd],
    }),
    __require.resolve(
      "@lazarv/react-server/lib/loader/node-loader.react-server.mjs",
      {
        paths: [cwd],
      }
    ),
    __require.resolve("@lazarv/react-server/client/entry.client.jsx", {
      paths: [cwd],
    }),
  ];
  sourceFiles.push(...adapterFiles, ...reactServerDeps);

  const reactServerPkgDir = dirname(
    __require.resolve("@lazarv/react-server/package.json", {
      paths: [cwd],
    })
  );

  const traceCache = {};
  const aliasReactServer = moduleAliases("react-server");
  const aliasReact = moduleAliases();
  const traces = await Promise.all([
    nodeFileTrace(sourceFiles, {
      conditions: ["react-server", "node", "import"],
      cache: traceCache,
      base: rootDir,
      ignore: [`${reactServerPkgDir}/lib/dev/create-logger.mjs`],
      resolve(id, parent, job, cjsResolve) {
        if (aliasReactServer[id]) {
          return aliasReactServer[id];
        }
        return resolve(id, parent, job, cjsResolve);
      },
    }),
    nodeFileTrace(sourceFiles, {
      conditions: ["node", "import"],
      cache: traceCache,
      base: rootDir,
      ignore: [`${reactServerPkgDir}/lib/dev/create-logger.mjs`],
      resolve(id, parent, job, cjsResolve) {
        if (aliasReact[id]) {
          return aliasReact[id];
        }
        return resolve(id, parent, job, cjsResolve);
      },
    }),
  ]);

  const trace = traces.reduce((trace, t) => {
    t.fileList.forEach((file) => trace.add(file));
    t.esmFileList.forEach((file) => trace.add(file));
    return trace;
  }, new Set());

  reactServerDeps.forEach((file) => trace.add(relative(rootDir, file)));
  const dependencyFiles = Array.from(trace).reduce((deps, file) => {
    const src = join(rootDir, file);
    const stat = lstatSync(src);
    if (stat.isSymbolicLink()) {
      const srcLink = readlinkSync(src);
      const link = isAbsolute(srcLink) ? srcLink : join(dirname(src), srcLink);
      const linkStat = lstatSync(link);
      if (linkStat.isDirectory()) {
        return deps;
      }
    }
    if (
      stat.isDirectory() ||
      (sourceFiles.includes(src) && !reactServerDeps.includes(src))
    ) {
      return deps;
    }
    if (!deps.includes(src)) {
      deps.push(src);
    }
    return deps;
  }, []);

  return dependencyFiles.map((src) => {
    const path = sys.normalizePath(relative(rootDir, src));
    const dest = path.startsWith("node_modules/.pnpm")
      ? path.split("/").slice(3).join("/")
      : path.startsWith(sys.normalizePath(relative(rootDir, reactServerPkgDir)))
        ? path.replace(
            sys.normalizePath(relative(rootDir, reactServerPkgDir)),
            "node_modules/@lazarv/react-server"
          )
        : path;
    return { src, dest };
  });
}

export async function spawnCommand(command, args) {
  const deploy = spawn(command, args, {
    cwd,
    stdio: "inherit",
  });
  await new Promise((resolve, reject) => {
    deploy.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject();
      }
    });
  });
}

export function createAdapter({
  name,
  outDir,
  outStaticDir,
  outServerDir,
  handler,
  deploy,
}) {
  return async function (adapterOptions, root, options) {
    adapterOptions = adapterOptions ?? {};
    const reactServerOutDir = options.outDir ?? ".react-server";

    const reactServerDir = join(cwd, reactServerOutDir);
    const distDir = join(reactServerDir, "dist");

    const config = getConfig();
    const publicDir = getPublicDir();

    banner(`building ${name} output`);
    console.log(
      `preparing ${colors.gray(`${relative(cwd, outDir)} for deployment`)}`
    );
    await clearDirectory(outDir);
    success(`${name} output successfully prepared.`);

    const files = {
      static: () => getFiles(["**/*", "!**/*.gz", "!**/*.br"], distDir),
      compressed: () => getFiles(["**/*.gz", "**/*.br"], distDir),
      assets: () => getFiles(["assets/**/*"], reactServerDir),
      client: () =>
        getFiles(["client/**/*", "!**/*-manifest.json"], reactServerDir),
      public: () => getFiles(["**/*"], publicDir),
      server: () =>
        getFiles(["**/*-manifest.json", "server/**/*.mjs"], reactServerDir),
      dependencies: (adapterFiles) =>
        getDependencies(adapterFiles, reactServerDir),
      all: async () =>
        (
          await Promise.all([
            files.static(),
            files.assets(),
            files.client(),
            files.public(),
            files.server(),
          ])
        ).flat(),
    };

    const copy = {
      static: async (out) =>
        copyFiles(
          "copying static files",
          await files.static(),
          distDir,
          out ?? outStaticDir,
          reactServerDir
        ),
      compressed: async (out) =>
        copyFiles(
          "copying compressed files",
          await files.compressed(),
          distDir,
          out ?? outStaticDir,
          reactServerDir
        ),
      assets: async (out) =>
        copyFiles(
          "copying assets",
          await files.assets(),
          reactServerDir,
          out ?? outStaticDir,
          reactServerDir
        ),
      client: async (out) =>
        copyFiles(
          "copying client components",
          await files.client(),
          reactServerDir,
          out ?? outStaticDir,
          reactServerDir
        ),
      public: async (out) =>
        copyFiles(
          "copying public",
          await files.public(),
          publicDir,
          out ?? outStaticDir,
          cwd
        ),
      server: async (out) =>
        copyFiles(
          "copying server files",
          await files.server(),
          reactServerDir,
          join(out ?? outServerDir, ".react-server"),
          reactServerOutDir
        ),
      dependencies: async (out, adapterFiles) => {
        const copyDependency = async ({ src, dest }) => {
          await cp(src, join(out, dest));
        };

        banner("copying server dependencies");
        await progress({
          message: "copying dependencies",
          files: await files.dependencies(adapterFiles ?? []),
          onProgress: copyDependency,
          onFile: async (file) => {
            console.log(
              `copy ${colors.gray(dirname(relative(cwd, file.src).replace(/^(\.\.\/)+/g, "")))}/${colors.cyan(basename(file.src))} => ${colors.gray(relative(cwd, out))}/${colors.cyan(file.dest)}`
            );
            await copyDependency(file);
          },
        });
      },
    };

    if (outStaticDir) {
      await copy.static();
      await copy.assets();
      await copy.client();
      await copy.public();
    }

    if (outServerDir) {
      await copy.server();
    }

    const handlerResult = await handler({
      files,
      copy,
      config,
      adapterOptions,
      reactServerDir,
      reactServerOutDir,
      root,
      options,
    });

    success(`${name} deployment successfully created.`);
    if (deploy) {
      const { command, args, message } =
        typeof deploy === "function"
          ? await deploy({ adapterOptions, options, handlerResult })
          : deploy;
      if (command && args) {
        if (options.deploy) {
          banner(`deploying to ${name}`);
          clearProgress();
          await spawnCommand(command, args);
        } else {
          console.log(
            `${colors.gray(`Deploy to ${name} using:`)} ${command} ${args.join(" ")}`
          );
          if (message) {
            console.log(message);
          }
        }
      }
    }
  };
}
