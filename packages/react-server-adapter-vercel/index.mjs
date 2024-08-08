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
import { spawn } from "node:child_process";
import { lstatSync, readlinkSync } from "node:fs";
import { cp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import colors from "picocolors";

const __require = createRequire(import.meta.url);
const cwd = sys.cwd();
const vercelDir = join(cwd, ".vercel");
const outDir = join(vercelDir, "output");
const outStaticDir = join(outDir, "static");
const adapterDir = dirname(fileURLToPath(import.meta.url));

const PROGRESS_LIMIT = 50;

let interval;

const oldConsoleLog = console.log;
console.log = function (...args) {
  clearInterval(interval);
  oldConsoleLog(...args);
};

function banner(message) {
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

function createProgress(message, total, start = 0) {
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

export async function adapter(adapterOptions, root, options) {
  const reactServerOutDir = options.outDir ?? ".react-server";
  const reactServerDir = join(cwd, reactServerOutDir);
  const distDir = join(reactServerDir, "dist");
  const clientDir = join(reactServerDir, "client");
  const assetsDir = join(reactServerDir, "assets");

  const config = getContext(CONFIG_CONTEXT)?.[CONFIG_ROOT];
  const publicDir = join(
    cwd,
    typeof config.public === "string" ? config.public : "public"
  );

  banner("building Vercel output");
  console.log(
    `preparing ${colors.gray("preparing .vercel/output for deployment")}\n`
  );
  await rm(outDir, { recursive: true, force: true });

  const distFiles = await glob(
    ["**/*", "!**/*.html.gz", "!**/*.html.br", "!**/x-component.*"],
    {
      onlyFiles: true,
      cwd: distDir,
    }
  );
  if (distFiles.length > 0) {
    banner("copying static files");
    await Promise.all(
      distFiles.map(async (file) => {
        const src = join(distDir, file);
        const dest = join(outStaticDir, file);
        console.log(
          `copy ${colors.gray(`${reactServerOutDir}/dist/${colors.cyan(file)}`)} => ${colors.gray(`.vercel/output/static/${colors.cyan(file)}`)}`
        );
        await cp(src, dest);
      })
    );
    console.log(`${colors.green("✓")} ${distFiles.length} files copied.\n`);
  }

  const assetFiles = await glob("**/*", {
    onlyFiles: true,
    cwd: assetsDir,
  });
  if (assetFiles.length > 0) {
    banner("copying assets");
    await Promise.all(
      assetFiles.map(async (file) => {
        const src = join(assetsDir, file);
        const dest = join(outStaticDir, "assets", file);
        console.log(
          `copy ${colors.gray(`${reactServerOutDir}/assets/${colors.cyan(file)}`)} => ${colors.gray(`.vercel/output/static/assets/${colors.cyan(file)}`)}`
        );
        await cp(src, dest);
      })
    );
    console.log(`${colors.green("✓")} ${assetFiles.length} files copied.\n`);
  }

  const clientFiles = await glob("**/*", {
    onlyFiles: true,
    cwd: clientDir,
  });
  if (clientFiles.length > 0) {
    banner("copying client components");
    await Promise.all(
      clientFiles.map(async (file) => {
        const src = join(clientDir, file);
        const dest = join(outStaticDir, "client", file);
        console.log(
          `copy ${colors.gray(`${reactServerOutDir}/client/${colors.cyan(file)}`)} => ${colors.gray(`.vercel/output/static/client/${colors.cyan(file)}`)}`
        );
        await cp(src, dest);
      })
    );
    console.log(`${colors.green("✓")} ${clientFiles.length} files copied.\n`);
  }

  if (config.public !== false) {
    const publicFiles = await glob("**/*", {
      onlyFiles: true,
      cwd: publicDir,
    });
    if (publicFiles.length > 0) {
      banner("copying public");
      await Promise.all(
        publicFiles.map(async (file) => {
          const src = join(publicDir, file);
          const dest = join(outStaticDir, file);
          console.log(
            `copy ${colors.gray(`${relative(cwd, publicDir)}/${colors.cyan(file)}`)} => ${colors.gray(`.vercel/output/static/${colors.cyan(file)}`)}`
          );
          await cp(src, dest);
        })
      );
      console.log(`${colors.green("✓")} ${publicFiles.length} files copied.\n`);
    }
  }

  if (adapterOptions?.serverlessFunctions !== false) {
    banner("building serverless functions");
    console.log(`creating ${colors.gray("creating index.func module")}`);
    await rm(join(cwd, outDir, "functions/index.func"), {
      recursive: true,
      force: true,
    });
    await cp(
      join(adapterDir, "functions/index.mjs"),
      join(outDir, "functions/index.func/index.mjs")
    );

    console.log(
      `creating ${colors.gray("creating index.func configuration")}\n`
    );
    await writeFile(
      join(outDir, "functions/index.func/.vc-config.json"),
      JSON.stringify(
        {
          runtime: "nodejs20.x",
          handler: "index.mjs",
          launcherType: "Nodejs",
          shouldAddHelpers: true,
          supportsResponseStreaming: true,
          ...adapterOptions?.serverlessFunctions?.index,
        },
        null,
        2
      ),
      "utf8"
    );

    banner("copying server files");
    const buildFiles = await glob(["**/*-manifest.json", "server/**/*.mjs"], {
      onlyFiles: true,
      cwd: reactServerDir,
    });
    if (buildFiles.length > 0) {
      await Promise.all(
        buildFiles.map(async (file) => {
          const src = join(reactServerDir, file);
          const dest = join(outDir, "functions/index.func/.react-server", file);
          console.log(
            `copy ${colors.gray(`${relative(cwd, reactServerDir)}/${colors.cyan(file)}`)} => ${colors.gray(`.vercel/output/static/${colors.cyan(file)}`)}`
          );
          await cp(src, dest);
        })
      );
      console.log(`${colors.green("✓")} ${buildFiles.length} files copied.\n`);
    }

    banner("copying server dependencies");

    let rootDir = cwd;
    let lockFile = [];
    while (lockFile.length === 0) {
      lockFile = await glob(
        ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"],
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
    sourceFiles.push(
      join(outDir, "functions/index.func/index.mjs"),
      ...reactServerDeps
    );

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
    }, []);

    const dependencyProgress = createProgress(
      `copying ${colors.gray("dependencies")}`,
      dependencyFiles.length
    );
    for (const src of dependencyFiles) {
      const path = sys.normalizePath(relative(rootDir, src));
      const dest = join(
        outDir,
        "functions/index.func",
        path.startsWith("node_modules/.pnpm")
          ? path.split("/").slice(3).join("/")
          : path.startsWith(
                sys.normalizePath(relative(rootDir, reactServerPkgDir))
              )
            ? path.replace(
                sys.normalizePath(relative(rootDir, reactServerPkgDir)),
                "node_modules/@lazarv/react-server"
              )
            : path
      );
      if (dependencyProgress) {
        dependencyProgress.increment();
      } else {
        console.log(
          `copy ${colors.gray(`${relative(rootDir, dirname(src))}/${colors.cyan(basename(src))}`)} => ${colors.gray(`.vercel/output/${relative(outDir, dirname(dest))}/${colors.cyan(basename(dest))}`)}`
        );
      }
      await cp(src, dest);
    }
    dependencyProgress?.stop();
    console.log(
      `${colors.green("✓")} ${dependencyFiles.length} files copied.\n`
    );

    if (!adapterOptions) {
      adapterOptions = {};
    }
    adapterOptions.routes = [
      {
        src: "^/(.*)",
        dest: "/",
      },
      ...(adapterOptions.routes ?? []),
    ];
  }

  banner("creating deployment configuration");
  console.log(`creating ${colors.gray("config.json")}`);
  await writeFile(
    join(outDir, "config.json"),
    JSON.stringify(
      {
        version: 3,
        ...adapterOptions,
        routes: [
          { handle: "filesystem" },
          ...(adapterOptions?.routes ?? []),
          adapterOptions?.routes?.find((route) => route.status === 404) ?? {
            src: "/(.*)",
            status: 404,
            dest: "/404/index.html",
          },
        ],
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`\n${colors.green("✓")} Vercel deployment successfully created.`);
  if (options.deploy) {
    banner("deploying to Vercel");
    clearInterval(interval);

    const deploy = spawn("vercel", ["deploy", "--prebuilt"], {
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
  } else {
    console.log(
      `${colors.gray("Deploy to Vercel using:")} vercel deploy --prebuilt`
    );
  }
}

export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}
