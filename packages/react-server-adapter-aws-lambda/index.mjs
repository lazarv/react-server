import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
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
import { build } from "vite";

const cwd = sys.cwd();
const awsLambdaDir = join(cwd, ".aws-lambda");
const outDir = join(awsLambdaDir, "output");
const outStaticDir = join(outDir, "static");
const adapterDir = dirname(fileURLToPath(import.meta.url));

export const adapter = createAdapter({
  name: "AWS Lambda Adapter",
  outDir,
  outStaticDir,
  handler: async function ({
    adapterOptions: adapterOptionsInput,
    copy,
    files,
  }) {
    const adapterOptions = {
      streaming: false,
      serverlessFunctions: true,
      routingMode: "pathBehaviors", // edgeFunctionRouting
      ...adapterOptionsInput,
    };
    if (adapterOptions?.serverlessFunctions !== false) {
      banner("building serverless functions");

      message("creating", "index.func module");
      const outServerDir = join(outDir, "functions/index.func");
      const entryFile = join(outServerDir, "index.mjs");
      const srcEntry = join(
        adapterDir,
        `lambda-wrapper/index.${adapterOptions?.streaming === true ? "streaming" : "buffered"}.mjs`
      );

      await clearDirectory(outServerDir);
      // Bundle the function with Vite, externalizing @lazarv/react-server
      message("bundling", srcEntry);
      message("bundling", "functions/index.mjs with Vite");
      await build({
        logLevel: "warn",
        mode: "production",
        // Inline DEBUG flag so dead code elimination can remove guarded blocks
        define: process.env.DEBUG_AWS_LAMBDA_ADAPTER
          ? {}
          : {
              "process.env.DEBUG_AWS_LAMBDA_ADAPTER": JSON.stringify(
                process.env.DEBUG_AWS_LAMBDA_ADAPTER ?? ""
              ),
            },
        build: {
          ssr: true,
          outDir: outServerDir,
          emptyOutDir: false,
          minify: false,
          sourcemap: false,
          rollupOptions: {
            input: srcEntry,
            output: {
              format: "es",
              entryFileNames: "index.mjs",
              chunkFileNames: "chunks/[name]-[hash].mjs",
            },
            external: [
              /^(node:)?(fs|path|url|stream|util|zlib|crypto|http|https)$/,
              /^@lazarv\/react-server(\/.*)?$/,
            ],
          },
        },
        resolve: {
          // Prefer ESM
          conditions: ["module", "import"],
        },
        ssr: {
          noExternal: true,
        },
      });

      success(
        "AWS lambda entry function (streaming=" +
          (adapterOptions?.streaming === true) +
          ") bundled with Vite"
      );

      await writeJSON(join(outServerDir, "package.json"), { type: "module" });

      message("creating", "lambda configuration");
      await writeFile(
        join(outServerDir, "adapter.config.mjs"),
        `export default ${JSON.stringify(adapterOptions)};`
      );
      success("lambda configuration written.");

      await copy.server(outServerDir);
      // If we bundled, dependencies are inlined except externals; ensure externals are copied.
      // Always scan the final entry to capture externals like @lazarv/react-server.
      await copy.dependencies(outServerDir, [entryFile]);

      if (adapterOptions.routingMode === "edgeFunctionRouting") {
        message("creating", "static_files.json for edge function routing");
        const rsFiles = {
          static: await files.static(),
          compressed: await files.compressed(),
          assets: await files.assets(),
          client: await files.client(),
          public: await files.public(),
          server: await files.server(),
          //dependencies: await files.dependencies(),
        };
        await writeFile(
          join(outDir, "static_files.json"),
          JSON.stringify(rsFiles, null, 0),
          "utf-8"
        );
        success("static_files.json created.");
      }
    }

    // Scaffold minimal CDK app if missing at repo root
    try {
      await access(join(cwd, "cdk.json"));
      message("info", "cdk.json found in project root, skipping scaffold.");
    } catch {
      message("scaffolding", "cdk.json and infra/bin/deploy.mjs");
      const cdkJson = {
        app: "node ./infra/bin/deploy.mjs",
        context: {
          "@aws-cdk/customresources:installLatestAwsSdkDefault": false,
        },
      };
      await writeFile(
        join(cwd, "cdk.json"),
        JSON.stringify(cdkJson, null, 2),
        "utf-8"
      );

      await mkdir(join(cwd, "infra/bin"), { recursive: true });
      await cp(
        join(adapterDir, "cdk/deploy.template.mjs"),
        join(cwd, "infra/bin", "deploy.mjs")
      );

      // Check and update package.json for required devDependencies
      const packageJsonPath = join(cwd, "package.json");
      try {
        const packageJsonContent = await readFile(packageJsonPath, "utf-8");
        const packageJson = JSON.parse(packageJsonContent);

        const requiredDevDeps = {
          "aws-cdk-lib": "^2.0.0",
          constructs: "^10.0.0",
        };

        if (!packageJson.devDependencies) {
          packageJson.devDependencies = {};
        }

        const missingDeps = [];
        for (const [dep, version] of Object.entries(requiredDevDeps)) {
          if (!packageJson.devDependencies[dep]) {
            packageJson.devDependencies[dep] = version;
            missingDeps.push(dep);
          }
        }

        if (missingDeps.length > 0) {
          await writeFile(
            packageJsonPath,
            JSON.stringify(packageJson, null, 2),
            "utf-8"
          );
          message("added", `${missingDeps.join(", ")} to devDependencies`);
          message(
            "info",
            "run 'npm install' or 'yarn install' to install the new dependencies"
          );
        }
      } catch {
        message("warning", "could not read or update package.json");
      }

      success("cdk.json and infra/bin/deploy.mjs scaffolded.");
    }
    message(
      "info",
      "run 'npx cdk synth' in the project root to synthesize the CloudFormation template."
    );
    message("info", "run 'npx cdk deploy' in the project root to deploy.");
  },
  deploy: {
    command: "npx",
    args: ["cdk", "deploy"],
  },
});

export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}
