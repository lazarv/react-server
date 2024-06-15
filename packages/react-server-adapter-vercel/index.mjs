import * as sys from "@lazarv/react-server/lib/sys.mjs";
import packageJson from "@lazarv/react-server/package.json" assert { type: "json" };
import { getContext } from "@lazarv/react-server/server/context.mjs";
import {
  CONFIG_CONTEXT,
  CONFIG_ROOT,
} from "@lazarv/react-server/server/symbols.mjs";
import glob from "fast-glob";
import { spawn } from "node:child_process";
import { cp, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import colors from "picocolors";

const cwd = sys.cwd();
const reactServerDir = join(cwd, ".react-server");
const distDir = join(reactServerDir, "dist");
const clientDir = join(reactServerDir, "client");
const assetsDir = join(reactServerDir, "assets");
const vercelDir = join(cwd, ".vercel");
const outDir = join(vercelDir, "output");
const outStaticDir = join(outDir, "static");
const adapterDir = fileURLToPath(import.meta.url);
// TODO: assets only used for Vercel deployment
// const adapterOutDir = join(adapterDir, "output");

function banner(message) {
  console.log(
    `\n${colors.cyan(`${packageJson.name.split("/").pop()}/${packageJson.version}`)} ${colors.green(message)}`
  );
}

export async function adapter(adapterOptions, root, options) {
  const config = getContext(CONFIG_CONTEXT)?.[CONFIG_ROOT];
  const publicDir = join(
    cwd,
    typeof config.public === "string" ? config.public : "public"
  );

  banner("building Vercel output");
  console.log(colors.gray(`preparing .vercel/output for deployment`));
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
          `copy ${colors.gray(`.react-server/dist/${colors.cyan(file)}`)} => ${colors.gray(`.vercel/output/static/${colors.cyan(file)}`)}`
        );
        await cp(src, dest);
      })
    );
    console.log(`${colors.green("✓")} ${distFiles.length} files copied.`);
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
          `copy ${colors.gray(`.react-server/assets/${colors.cyan(file)}`)} => ${colors.gray(`.vercel/output/static/assets/${colors.cyan(file)}`)}`
        );
        await cp(src, dest);
      })
    );
    console.log(`${colors.green("✓")} ${assetFiles.length} files copied.`);
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
          `copy ${colors.gray(`.react-server/client/${colors.cyan(file)}`)} => ${colors.gray(`.vercel/output/static/client/${colors.cyan(file)}`)}`
        );
        await cp(src, dest);
      })
    );
    console.log(`${colors.green("✓")} ${clientFiles.length} files copied.`);
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
      console.log(`${colors.green("✓")} ${publicFiles.length} files copied.`);
    }
  }

  banner("creating deployment configuration");
  console.log(colors.gray("creating config.json"));
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
