import { spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
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

import {
  createAdapterSpinner,
  isInteractive,
} from "@lazarv/react-server/lib/build/output-filter.mjs";
import { moduleAliases } from "@lazarv/react-server/lib/loader/module-alias.mjs";
import * as sys from "@lazarv/react-server/lib/sys.mjs";
import { formatDuration } from "@lazarv/react-server/lib/utils/format.mjs";
import packageJson from "@lazarv/react-server/package.json" with { type: "json" };
import { getContext } from "@lazarv/react-server/server/context.mjs";
import {
  CONFIG_CONTEXT,
  CONFIG_ROOT,
} from "@lazarv/react-server/server/symbols.mjs";

// Use createRequire for CJS packages to avoid ESM resolution issues with pnpm symlinks
const __require = createRequire(import.meta.url);
const { nodeFileTrace, resolve } = __require("@vercel/nft");
const glob = __require("fast-glob");
const colors = __require("picocolors");
const { parse: tomlParse, stringify: tomlStringify } = __require("smol-toml");

const cwd = sys.cwd();

let currentAdapterSpinner = null;
let lastSuccessHadNewline = false; // Track if last success already added a newline
let interval = null; // Track progress animation interval

const oldConsoleLog = console.log;
console.log = function (...args) {
  clearInterval(interval);
  oldConsoleLog(...args);
};

export function banner(message, options = {}) {
  const { forceVerbose = false, emoji = "" } = options;
  const interactive = !forceVerbose && isInteractive();
  const showEmoji = isInteractive(); // Show emoji in interactive mode regardless of forceVerbose

  // Stop any existing adapter spinner
  if (currentAdapterSpinner) {
    currentAdapterSpinner.stop();
    currentAdapterSpinner = null;
  }

  // Clear any existing interval
  clearInterval(interval);

  const timestamp =
    typeof globalThis.__react_server_start__ === "number" && !isInteractive()
      ? colors.gray(
          ` [${formatDuration(Date.now() - globalThis.__react_server_start__)}]`
        )
      : "";
  const emojiSuffix = emoji && showEmoji ? ` ${emoji}` : "";
  const prefix = `${colors.bold(colors.cyan(`${packageJson.name.split("/").pop()}/${packageJson.version}`))} ${colors.green(message)}${timestamp}${emojiSuffix}`;

  if (interactive) {
    // Print the banner header on its own line (persists)
    // Only add leading empty line if last success didn't already add one
    if (!lastSuccessHadNewline) {
      console.log();
    }
    lastSuccessHadNewline = false;
    console.log(prefix);

    // Use shared spinner on a separate line that will be cleared
    currentAdapterSpinner = createAdapterSpinner("working...");
    return;
  }

  // Verbose/CI mode: just print the banner, no spinner
  // File listing will follow from the progress function
  // Only add leading empty line if last success didn't already add one
  if (!lastSuccessHadNewline) {
    console.log();
  }
  lastSuccessHadNewline = false;
  console.log(prefix);
}

export function clearProgress() {
  clearInterval(interval);
  if (currentAdapterSpinner) {
    currentAdapterSpinner.stop();
    currentAdapterSpinner = null;
  }
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
  // In interactive mode with active spinner, update spinner instead of logging
  if (isInteractive() && currentAdapterSpinner && primary) {
    currentAdapterSpinner.update(
      secondary ? `${primary} ${secondary}` : primary
    );
    return;
  }
  if (!secondary) {
    console.log(primary);
  } else if (primary && secondary) {
    console.log(`${primary} ${colors.gray(secondary)}`);
  } else {
    console.log();
  }
}

export function success(message) {
  // Stop the adapter spinner if active
  if (currentAdapterSpinner) {
    currentAdapterSpinner.stop(`${colors.green("✔")} ${message}`);
    currentAdapterSpinner = null;
    lastSuccessHadNewline = false;
    return;
  }
  // Verbose mode: print with trailing newline
  console.log(`${colors.green("✔")} ${message}\n`);
  lastSuccessHadNewline = true;
}

/**
 * Truncate a string in the middle with "..." if it exceeds maxLen
 */
function truncateMiddle(str, maxLen) {
  if (str.length <= maxLen || maxLen <= 10) return str;
  const halfLen = Math.floor((maxLen - 3) / 2);
  return str.slice(0, halfLen) + "..." + str.slice(-halfLen);
}

const extensionColor = {
  ".json": "magenta",
  ".css": "magenta",
};
export function copyMessage(file, srcDir, destDir, reactServerOutDir) {
  // In interactive mode, don't log individual files - spinner is shown instead
  if (isInteractive()) {
    if (currentAdapterSpinner) {
      currentAdapterSpinner.update(`copying ${file}`);
    }
    return;
  }
  const termWidth = process.stdout.columns || 80;
  const srcBaseDir = relative(cwd, reactServerOutDir);
  const destBaseDir = relative(cwd, destDir);
  const srcPath = `${srcBaseDir}/${relative(reactServerOutDir, srcDir)}/${file}`
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
  const destPath = `${destBaseDir}/${file}`.replace(/^\/+/, "");
  const prefix = "copy ";
  const arrow = " => ";
  const maxPathLen = Math.floor((termWidth - prefix.length - arrow.length) / 2);

  const truncatedSrc = truncateMiddle(srcPath, maxPathLen);
  const truncatedDest = truncateMiddle(destPath, maxPathLen);

  // Apply colors - directory prefix is gray, file path portion is colored
  const fileColor = extensionColor[extname(file)] ?? "cyan";
  const colorPath = (truncated, baseDir) => {
    const baseDirWithSlash = baseDir + "/";
    if (truncated.startsWith(baseDirWithSlash)) {
      // Full base dir intact - gray it, color the rest
      return (
        colors.gray(baseDirWithSlash) +
        colors[fileColor](truncated.slice(baseDirWithSlash.length))
      );
    }
    // Path was truncated - gray before "...", color after "..."
    const ellipsisIdx = truncated.indexOf("...");
    if (ellipsisIdx !== -1) {
      return (
        colors.gray(truncated.slice(0, ellipsisIdx + 3)) +
        colors[fileColor](truncated.slice(ellipsisIdx + 3))
      );
    }
    // No truncation and no base dir match - just color it
    return colors[fileColor](truncated);
  };
  const coloredSrc = colorPath(truncatedSrc, srcBaseDir);
  const coloredDest = colorPath(truncatedDest, destBaseDir);

  console.log(`${prefix}${coloredSrc}${arrow}${coloredDest}`);
}

export function copy(srcDir, destDir, reactServerOutDir) {
  return async (file) => {
    const src = join(srcDir, file);
    const dest = join(destDir, file);
    copyMessage(file, srcDir, destDir, reactServerOutDir);
    await cp(src, dest);
  };
}

export async function copyFiles(
  message,
  files,
  srcDir,
  destDir,
  reactServerOutDir,
  emoji
) {
  if (files.length > 0) {
    banner(message, { emoji });
    await Promise.all(files.map(copy(srcDir, destDir, reactServerOutDir)));
    success(`${files.length} files copied`);
  }
}

export async function writeJSON(file, data) {
  return writeFile(file, JSON.stringify(data, null, 2));
}

/**
 * Deep merge two objects, extending arrays and objects from source with target values.
 * Target (adapter config) takes precedence for primitive values.
 * For arrays, target items are used, with unique source items prepended.
 */
export function deepMerge(source, target) {
  const result = { ...source };

  for (const key of Object.keys(target)) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      // For arrays: use target items, prepend unique source items
      const targetJson = targetValue.map((item) => JSON.stringify(item));
      const uniqueSourceItems = sourceValue.filter(
        (item) => !targetJson.includes(JSON.stringify(item))
      );
      result[key] = [...uniqueSourceItems, ...targetValue];
    } else if (
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue) &&
      sourceValue &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue)
    ) {
      // Recursively merge objects
      result[key] = deepMerge(sourceValue, targetValue);
    } else {
      // Target (adapter) takes precedence for primitives
      result[key] = targetValue;
    }
  }

  return result;
}

/**
 * Read and parse a TOML file, returning null if parsing fails or file doesn't exist.
 */
export function readToml(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    return tomlParse(content);
  } catch {
    return null;
  }
}

/**
 * Write a TOML file from an object.
 */
export async function writeToml(filePath, data) {
  return writeFile(filePath, tomlStringify(data));
}

/**
 * Merge existing TOML config with adapter config.
 * Reads from existingPath, merges with adapterConfig (adapter takes precedence),
 * and returns the merged config.
 */
export function mergeTomlConfig(existingPath, adapterConfig) {
  const existingConfig = readToml(existingPath);
  if (existingConfig) {
    return deepMerge(existingConfig, adapterConfig);
  }
  return adapterConfig;
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
    __require.resolve("@lazarv/react-server/cache/index.mjs", {
      paths: [cwd],
    }),
    __require.resolve("@lazarv/react-server/cache/client.mjs", {
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

  const ignoreAlias = [
    "unstorage",
    "unstorage/drivers/memory",
    "unstorage/drivers/localstorage",
    "unstorage/drivers/session-storage",
  ];

  // Show banner for dependency resolution phase
  banner("resolving server dependencies", { emoji: "🔍" });

  // Start spinner for dependency tracing (in interactive mode, banner already created a spinner)
  let traceSpinner = currentAdapterSpinner;
  let lastResolvedModule = "";

  const updateTraceSpinner = (id) => {
    if (traceSpinner && id) {
      // Extract package name from module id
      const moduleName = id.startsWith(".")
        ? id
        : id.startsWith("@")
          ? id.split("/").slice(0, 2).join("/")
          : id.split("/")[0];
      if (moduleName !== lastResolvedModule) {
        lastResolvedModule = moduleName;
        traceSpinner.update(`resolving ${colors.cyan(moduleName)}`);
      }
    }
  };

  const traces = await Promise.all([
    nodeFileTrace(sourceFiles, {
      conditions: ["react-server", "node", "import"],
      cache: traceCache,
      base: rootDir,
      ignore: [`${reactServerPkgDir}/lib/dev/create-logger.mjs`],
      resolve(id, parent, job, cjsResolve) {
        updateTraceSpinner(id);
        if (aliasReactServer[id] && !ignoreAlias.includes(id)) {
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
        updateTraceSpinner(id);
        if (aliasReact[id] && !ignoreAlias.includes(id)) {
          return aliasReact[id];
        }
        return resolve(id, parent, job, cjsResolve);
      },
    }),
    nodeFileTrace(
      Array.from(
        new Set([...Object.keys(aliasReactServer), ...Object.keys(aliasReact)])
      ).map((id) => __require.resolve(id, { paths: [cwd] })),
      {
        conditions: ["node", "require"],
        cache: traceCache,
        base: rootDir,
        resolve(id, parent, job, cjsResolve) {
          updateTraceSpinner(id);
          return resolve(id, parent, job, cjsResolve);
        },
      }
    ),
  ]);

  const trace = traces.reduce((trace, t) => {
    t.fileList.forEach((file) => trace.add(file));
    t.esmFileList.forEach((file) => trace.add(file));
    return trace;
  }, new Set());

  reactServerDeps.forEach((file) => trace.add(relative(rootDir, file)));
  const dependencyFiles = Array.from(trace).reduce((deps, file) => {
    try {
      const src = join(rootDir, file);
      const stat = lstatSync(src);
      if (stat.isSymbolicLink()) {
        const srcLink = readlinkSync(src);
        const link = isAbsolute(srcLink)
          ? srcLink
          : join(dirname(src), srcLink);
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
    } catch {
      return deps;
    }
  }, []);

  success(`${dependencyFiles.length} dependencies resolved`);

  return dependencyFiles.map((src) => {
    const path = sys.normalizePath(relative(rootDir, src));
    let dest = path;

    if (path.startsWith("node_modules/.pnpm")) {
      dest = path.split("/").slice(3).join("/");
    } else if (
      path.startsWith(sys.normalizePath(relative(rootDir, reactServerPkgDir)))
    ) {
      dest = path.replace(
        sys.normalizePath(relative(rootDir, reactServerPkgDir)),
        "node_modules/@lazarv/react-server"
      );
    } else if (relative(src, cwd).startsWith("../")) {
      try {
        let packageJsonPath = join(dirname(src), "package.json");
        while (
          !existsSync(packageJsonPath) &&
          dirname(packageJsonPath) !== "/"
        ) {
          packageJsonPath = join(
            dirname(packageJsonPath),
            "..",
            "package.json"
          );
        }
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
        dest = sys.normalizePath(
          join(
            `node_modules/${packageJson.name}`,
            relative(dirname(packageJsonPath), src)
          )
        );
      } catch {
        // If package.json is not found, keep the original path
        dest = path;
      }
    }
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

    banner(`building ${name} output`, { emoji: "🏗️" });
    if (!isInteractive()) {
      console.log(
        `preparing ${colors.gray(`${relative(cwd, outDir)} for deployment`)}`
      );
    }
    await clearDirectory(outDir);
    success(`${name} output successfully prepared`);

    // Get all static files first to identify PPR pages and RSC files
    const allStaticFiles = await getFiles(
      ["**/*", "!**/*.gz", "!**/*.br"],
      distDir
    );

    // Build a set of PPR base paths (pages with .postponed.json files)
    // These need special handling in edge mode
    const pprBasePaths = new Set();
    for (const f of allStaticFiles) {
      if (f.endsWith(".postponed.json")) {
        // Extract the base path (e.g., "index.html.postponed.json" -> "index.html")
        const basePath = f.replace(/\.postponed\.json$/, "");
        pprBasePaths.add(basePath);
      }
    }

    // Check if a file is PPR-related (the HTML, .postponed.json, or .prerender-cache.json)
    const isPprFile = (f) => {
      if (
        f.endsWith(".postponed.json") ||
        f.endsWith(".prerender-cache.json")
      ) {
        return true;
      }
      // Check if this HTML file has a corresponding .postponed.json
      return pprBasePaths.has(f);
    };

    // Check if a file is an RSC payload file
    // These should not be served as static files because the client sends POST requests for them
    // RSC files can be:
    // - "rsc.x-component" (root RSC file)
    // - "some/path/rsc.x-component" (nested RSC file)
    // - "something.rsc.x-component" (named RSC file like @outlet.rsc.x-component)
    const isRscFile = (f) =>
      f === "rsc.x-component" ||
      f.endsWith("/rsc.x-component") ||
      f.endsWith(".rsc.x-component");

    const files = {
      static: () => {
        if (options.edge) {
          return allStaticFiles.filter((f) => !isPprFile(f) && !isRscFile(f));
        }
        return allStaticFiles;
      },
      ppr: () => allStaticFiles.filter((f) => isPprFile(f)),
      // Get only RSC payload files (for potential edge bundling/caching)
      rsc: () => allStaticFiles.filter((f) => isRscFile(f)),
      compressed: () => getFiles(["**/*.gz", "**/*.br"], distDir),
      assets: () => getFiles(["assets/**/*"], reactServerDir),
      client: () =>
        getFiles(["client/**/*", "!**/*-manifest.json"], reactServerDir),
      public: () => getFiles(["**/*"], publicDir),
      server: () =>
        getFiles(
          [
            "**/*-manifest.json",
            "server/**/*.mjs",
            "static/**/*.mjs",
            ...(options.sourcemap ? ["server/**/*.map"] : []),
          ],
          reactServerDir
        ),
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
          reactServerDir,
          "🌐"
        ),
      ppr: async (out) =>
        copyFiles(
          "copying PPR files",
          await files.ppr(),
          distDir,
          out ?? outServerDir,
          reactServerDir,
          "⚡"
        ),
      rsc: async (out) =>
        copyFiles(
          "copying RSC files",
          await files.rsc(),
          distDir,
          out ?? outServerDir,
          reactServerDir,
          "📦"
        ),
      compressed: async (out) =>
        copyFiles(
          "copying compressed files",
          await files.compressed(),
          distDir,
          out ?? outStaticDir,
          reactServerDir,
          "🗜️"
        ),
      assets: async (out) =>
        copyFiles(
          "copying assets",
          await files.assets(),
          reactServerDir,
          out ?? outStaticDir,
          reactServerDir,
          "🎨"
        ),
      client: async (out) =>
        copyFiles(
          "copying client components",
          await files.client(),
          reactServerDir,
          out ?? outStaticDir,
          reactServerDir,
          "⚛️"
        ),
      public: async (out) =>
        copyFiles(
          "copying public",
          await files.public(),
          publicDir,
          out ?? outStaticDir,
          cwd,
          "📂"
        ),
      server: async (out) =>
        copyFiles(
          "copying server files",
          await files.server(),
          reactServerDir,
          join(out ?? outServerDir, ".react-server"),
          reactServerOutDir,
          "🖥️"
        ),
      dependencies: async (out, adapterFiles) => {
        const dependencyFiles = await files.dependencies(adapterFiles ?? []);

        banner("copying server dependencies", {
          forceVerbose: true,
          emoji: "📦",
        });

        if (isInteractive()) {
          // Interactive mode: use spinner with filename
          const copySpinner = createAdapterSpinner("copying dependencies");
          let copiedCount = 0;

          for (const file of dependencyFiles) {
            const filename = basename(file.dest);
            copySpinner.update(`copying ${colors.cyan(filename)}`);
            await cp(file.src, join(out, file.dest));
            copiedCount++;
          }

          copySpinner.stop(`${colors.green("✔")} ${copiedCount} files copied`);
        } else {
          // CI/verbose mode: show file listing
          for (const file of dependencyFiles) {
            const termWidth = process.stdout.columns || 80;
            const srcPath =
              dirname(relative(cwd, file.src).replace(/^(\.\.\/)+ /g, "")) +
              "/" +
              basename(file.src);
            const destPath = relative(cwd, out) + "/" + file.dest;
            const prefix = "copy ";
            const arrow = " => ";
            const maxPathLen = Math.floor(
              (termWidth - prefix.length - arrow.length) / 2
            );

            const truncatedSrc = truncateMiddle(srcPath, maxPathLen);
            const truncatedDest = truncateMiddle(destPath, maxPathLen);

            // Apply colors after truncation - highlight the filename
            const srcFilename = basename(file.src);
            const destFilename = basename(file.dest);
            const coloredSrc = truncatedSrc.endsWith(srcFilename)
              ? colors.gray(truncatedSrc.slice(0, -srcFilename.length)) +
                colors.cyan(srcFilename)
              : colors.gray(truncatedSrc);
            const coloredDest = truncatedDest.endsWith(destFilename)
              ? colors.gray(truncatedDest.slice(0, -destFilename.length)) +
                colors.cyan(destFilename)
              : colors.gray(truncatedDest);

            console.log(`${prefix}${coloredSrc}${arrow}${coloredDest}`);
            await cp(file.src, join(out, file.dest));
          }
          success(`${dependencyFiles.length} dependencies copied`);
        }
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

    success(`${name} deployment successfully created`);
    if (deploy) {
      const {
        command,
        args,
        message: deployMessage,
      } = typeof deploy === "function"
        ? await deploy({ adapterOptions, options, handlerResult })
        : deploy;
      if (command && args) {
        if (options.deploy) {
          banner(`deploying to ${name}`, { emoji: "🚀" });
          clearProgress();
          await spawnCommand(command, args);
        } else {
          const deployCmd = `${command} ${args.join(" ")}`;
          const deployLabel = `🚀 Deploy to ${name} using:`;

          if (isInteractive()) {
            // Interactive mode: show bordered box
            // Add empty line only if last success didn't already add one
            if (!lastSuccessHadNewline) {
              console.log();
            }
            const contentWidth = Math.max(deployLabel.length, deployCmd.length);
            const topBorder = `┌${"─".repeat(contentWidth + 2)}┐`;
            const bottomBorder = `└${"─".repeat(contentWidth + 2)}┘`;
            console.log(colors.dim(topBorder));
            console.log(
              colors.dim("│") +
                ` ${colors.gray(deployLabel.padEnd(contentWidth))} ` +
                colors.dim("│")
            );
            console.log(
              colors.dim("│") +
                ` ${colors.white(deployCmd.padEnd(contentWidth))} ` +
                colors.dim("│")
            );
            console.log(colors.dim(bottomBorder));
          } else {
            // CI/verbose mode: simple output
            console.log(`${colors.gray(deployLabel)} ${deployCmd}`);
          }
          if (deployMessage) {
            console.log(deployMessage);
          }
        }
      }
    }
  };
}
