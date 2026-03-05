import { EventEmitter } from "node:events";
import { rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import colors from "picocolors";
import logo from "../../bin/logo.mjs";
import { loadConfig } from "../../config/index.mjs";
import {
  validateConfig,
  formatValidationErrors,
} from "../../config/validate.mjs";
import { ContextStorage } from "../../server/context.mjs";
import {
  BUILD_OPTIONS,
  CONFIG_CONTEXT,
  CONFIG_ROOT,
} from "../../server/symbols.mjs";
import * as sys from "../sys.mjs";
import { formatDuration } from "../utils/format.mjs";
import adapter, { getAdapterBuildOptions } from "./adapter.mjs";
import clientBuild, { startCollectingClientComponents } from "./client.mjs";
import serverBuild from "./server.mjs";
import edgeBuild from "./edge.mjs";
import staticSiteGenerator from "./static.mjs";
import manifest from "./manifest.mjs";
import banner from "./banner.mjs";
import {
  initOutputFilter,
  restoreStdout,
  createSpinner,
} from "./output-filter.mjs";

const cwd = sys.cwd();

// Check if a function is native (not patched by test frameworks etc.)
const isNative = (fn) =>
  /\[native code\]/.test(Function.prototype.toString.call(fn));

export default async function build(root, options) {
  const buildStart = Date.now();

  // Patch console and stdout when silent mode is enabled
  // Keep stderr so errors are still visible
  // Only patch if not already patched (e.g., by test frameworks)
  if (options.silent) {
    const noop = () => {};
    if (isNative(console.log)) console.log = noop;
    if (isNative(console.warn)) console.warn = noop;
    if (isNative(console.info)) console.info = noop;
    if (isNative(process.stdout.write)) process.stdout.write = noop;
  }

  await logo();

  if (!options.outDir) {
    options.outDir = ".react-server";
  }

  const config = await loadConfig({}, { ...options, command: "build" });

  // Validate config — fail and exit on hard errors during build.
  {
    const validation = validateConfig(config[CONFIG_ROOT]);
    if (!validation.valid || validation.warnings.length > 0) {
      const output = formatValidationErrors(
        [...validation.errors, ...validation.warnings],
        { command: "build" }
      );
      if (output) console.error(output);

      if (!validation.valid) {
        return 1;
      }
    }
  }

  // Apply sourcemap from config if not explicitly set via CLI
  if (
    !options.sourcemap &&
    typeof config[CONFIG_ROOT]?.sourcemap !== "undefined"
  ) {
    options.sourcemap = config[CONFIG_ROOT].sourcemap;
  }

  // Get adapter build options before build starts
  const adapterBuildOptions = await getAdapterBuildOptions(
    config[CONFIG_ROOT] ?? {},
    options
  );

  // Merge adapter build options into options (adapter options take precedence for adapter-specific settings)
  options = { ...options, ...adapterBuildOptions };

  // Normalize edge option: CLI passes `true`, adapters pass `{ entry: "..." }`
  if (options.edge === true) {
    const buildDir = dirname(fileURLToPath(import.meta.url));
    options.edge = {
      entry: sys.normalizePath(join(buildDir, "default-edge-entry.mjs")),
    };
  }

  return new Promise((resolve) => {
    ContextStorage.run(
      {
        [CONFIG_CONTEXT]: config,
        [BUILD_OPTIONS]: options,
      },
      async () => {
        try {
          if (!options.dev) {
            // enforce production mode
            sys.setEnv("NODE_ENV", "production");
          }
          // empty out dir
          await rm(join(cwd, options.outDir), {
            recursive: true,
            force: true,
          });

          if (sys.isDeno) {
            await rm(join(cwd, ".deno"), {
              recursive: true,
              force: true,
            });
          }

          if (sys.isBun) {
            await rm(join(cwd, ".bun"), {
              recursive: true,
              force: true,
            });
          }

          // Generate the action encryption secret early so the
          // use-server plugin can encrypt action IDs in client/SSR stubs.
          const { initSecret, initSecretFromConfig, generateSecret } =
            await import("../../server/action-crypto.mjs");
          // Generate a fresh secret and set it as the baseline key.
          const actionSecret = generateSecret();
          initSecret(actionSecret);
          // Let user-provided secret (env var, config, .pem) override
          // the generated key.  At runtime the same env/config will
          // override the build artifact, keeping the keys in sync.
          await initSecretFromConfig(config[CONFIG_ROOT]);

          // Create event bus for parallel builds
          // This allows RSC build to emit client component entries
          // that SSR and Client builds consume dynamically
          const clientManifestBus = new EventEmitter();

          // Start collecting client components BEFORE Promise.all
          // Uses double-stop mechanism:
          // 1. RSC emits "groups-ready" when done discovering components
          // 2. Collector extracts packages and generates chunk groups
          // 3. Collector emits "end" so SSR and Client builds can proceed
          const chunkGroupsPromise =
            startCollectingClientComponents(clientManifestBus);

          // Single banner for all parallel builds
          // bannerMessage(
          //   `building for ${options.dev ? "development" : "production"}`
          // );
          banner("bundles");
          const parallelBuildStart = Date.now();

          // Filter out Vite's verbose output during parallel builds
          initOutputFilter();

          // Run all builds in parallel
          // Server build returns {clientManifest, serverManifest}, client build returns boolean
          const [buildOutput] = await Promise.all([
            serverBuild(root, options, clientManifestBus),
            clientBuild(root, options, clientManifestBus, chunkGroupsPromise),
          ]);

          // Restore stdout and show combined build time
          restoreStdout();

          console.log(
            `${colors.green("✔")} built in ${formatDuration(Date.now() - parallelBuildStart)}`
          );

          // manifest
          // empty line
          console.log();
          banner("manifest");
          const manifestStart = Date.now();
          const manifestSpinner = createSpinner(
            `generating ${colors.dim("manifest")}`
          );
          await manifest(root, options, buildOutput);
          manifestSpinner.stop(
            `${colors.green("✔")} manifest generated in ${formatDuration(Date.now() - manifestStart)}`
          );

          // Write build manifest module with build metadata
          await writeFile(
            join(cwd, options.outDir, "server/build-manifest.mjs"),
            `export default ${JSON.stringify({
              sourcemap: options.sourcemap
                ? options.sourcemap === "server"
                  ? true
                  : options.sourcemap === "server-inline"
                    ? "inline"
                    : options.sourcemap
                : false,
            })};\n`,
            "utf8"
          );

          // Persist the action encryption secret as a build artifact so it
          // survives serverless cold starts and edge restarts.
          await writeFile(
            join(cwd, options.outDir, "server/action-secret.mjs"),
            `export default ${JSON.stringify(actionSecret)};\n`,
            "utf8"
          );

          if (options.edge) {
            // empty line
            console.log();
            banner("edge");
            const edgeStart = Date.now();
            const edgeSpinner = createSpinner(
              `building for ${colors.dim("edge runtime")}`
            );
            await edgeBuild(root, options);
            edgeSpinner.stop(
              `${colors.green("✔")} edge build completed in ${formatDuration(Date.now() - edgeStart)}`
            );
          }
          // static export
          if (
            options.export !== false &&
            (options.export ||
              typeof config[CONFIG_ROOT]?.export !== "undefined")
          ) {
            const start = Date.now();
            await rm(join(cwd, options.outDir, "dist"), {
              recursive: true,
              force: true,
            });
            await staticSiteGenerator(root, options);
            console.log(
              `${colors.green("✔")} exported in ${formatDuration(Date.now() - start)}`
            );
          }
          await adapter(root, options);

          if (buildOutput) {
            console.log(
              `\n${colors.green("✔")} Build completed successfully in ${formatDuration(Date.now() - globalThis.__react_server_start__)}!`
            );
          }
          resolve();
        } catch (e) {
          console.error(colors.red(e.stack || e.message || e));
          console.log(
            `\n${colors.red("ⅹ")} Build failed in ${formatDuration(Date.now() - globalThis.__react_server_start__)}`
          );
          resolve(1);
        }
      }
    );
  });
}
