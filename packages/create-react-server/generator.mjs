import { execSync, spawn } from "node:child_process";
import { statSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative } from "node:path";

import banner from "@lazarv/react-server/lib/utils/banner.mjs";
import merge from "@lazarv/react-server/lib/utils/merge.mjs";
import { filesize } from "filesize";
import colors from "picocolors";

import { mergeCodeFiles } from "./lib/code-merge.mjs";
import { format } from "./lib/formatter.mjs";

const extensionColor = {
  ".json": "magenta",
  ".css": "magenta",
  ".scss": "magenta",
};

function size(bytes) {
  const s = filesize(bytes);
  return " ".repeat(Math.max(0, 8 - s.length)) + s;
}

function logFileEmit(name, file, bytes, maxLength) {
  const padding = " ".repeat(maxLength - file.length + 1);
  console.log(
    `${colors.gray(`${name}/${colors[extensionColor[extname(file)] ?? "cyan"](file.replace(/\\/g, "/"))}${padding} ${colors.bold(size(bytes))}`).replace(/^\/+/, "")}`
  );
}

const mergeFunctions = {
  json: async (partials) => merge(...partials),
  text: (partials) => partials.join("\n"),
  code: (partials) => mergeCodeFiles(...partials),
};

function renderTemplate(template, context) {
  return template.replace(/(?:\/\*)?<%=\s*([^\s]+)\s*%>(?:\*\/)?/g, (_, key) =>
    key.split(".").reduce((acc, k) => acc?.[k] ?? "", context)
  );
}

export async function generate(context) {
  const {
    env: { logger },
  } = context;

  console.log();
  banner("bootstrapping project");

  try {
    if (statSync(context.env.projectDir).isDirectory()) {
      if (context.env.options.clean) {
        await rm(context.env.projectDir, { recursive: true });
      } else {
        logger.error(
          `Directory ${colors.italic(relative(context.env.cwd, context.env.projectDir))} already exists!`
        );
        process.exit(1);
      }
    }
  } catch {
    // directory does not exist
  }

  await mkdir(context.env.projectDir, { recursive: true });

  const maxLength = Math.max(
    24,
    ...(context.files?.map((file) => file.length) ?? []),
    ...Object.keys(context.partials)
  );
  if (context.files?.length > 0) {
    const { files } = context;

    for (const file of files) {
      const filename = relative(
        context.env.projectDir,
        Array.isArray(file) ? file[1] : file
      );
      if (context.partials[filename]) {
        const partial = context.partials[filename];
        if (partial.merge) {
          const content = await readFile(
            Array.isArray(file) ? file[0] : file,
            "utf8"
          );
          partial.merge = [
            ...partial.merge,
            partial.type === "json" ? JSON.parse(content) : content,
          ];
        }
        continue;
      }
      const [src, dest] = Array.isArray(file)
        ? file
        : [
            isAbsolute(file) ? file : join(context.env.templateAppDir, file),
            join(
              context.env.projectDir,
              relative(context.env.templateDir, file)
            ),
          ];
      logFileEmit(
        context.props.projectName,
        relative(context.env.projectDir, dest),
        statSync(src).size,
        maxLength
      );
      await cp(src, dest);
    }
  }

  for (const [file, partial] of Object.entries(context.partials)) {
    if (partial.merge) {
      partial.content = await mergeFunctions[partial.type](partial.merge);
    }

    if (partial.template) {
      partial.content = renderTemplate(partial.template, context);
    }

    if (partial.type === "json") {
      partial.content = `${JSON.stringify(partial.content, null, 2)}\n`;
    }

    const content =
      partial.type === "json"
        ? await format(partial.content, "json")
        : partial.format
          ? await format(
              partial.content,
              typeof partial.format === "string" ? partial.format : "js"
            )
          : partial.content;
    logFileEmit(context.props.projectName, file, content.length, maxLength);
    await writeFile(join(context.env.projectDir, file), content, "utf8");
  }

  console.log();

  if (
    context.env.options.git ||
    (context.features.includes("git") && context.env.options.git !== false)
  ) {
    logger.info("Initializing git repository 🗃️");
    execSync("git init", { cwd: context.env.projectDir, stdio: "ignore" });
  }

  if (
    context.props.packageManager &&
    context.env.options.install !== false &&
    context.props.packageManager.install !== false &&
    (!context.props.custom ||
      (context.props.custom && context.props.packageManager.install !== false))
  ) {
    logger.info(
      `Installing dependencies using ${context.props.packageManager.name} 📦`
    );

    await new Promise((resolve, reject) => {
      const child = spawn(
        context.props.packageManager.name,
        [
          "install",
          ...(context.props.packageManager.ciInstallArgs?.split(" ") ?? []),
        ],
        {
          cwd: context.env.projectDir,
          encoding: "utf8",
          stdio: ["inherit", "pipe", "pipe"],
          env: { ...process.env, NPM_CONFIG_COLOR: "always", CI: "1" },
        }
      );

      child.stdout.on("data", (data) => {
        process.stdout.write(colors.gray(data));
      });
      child.stderr.on("data", (data) => {
        process.stdout.write(colors.gray(data));
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve(code);
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });
    });

    console.log();
    logger.info("Ready to launch your project! 🚀");
  } else {
    logger.warn("You need to install dependencies to start your project!");
    context.props.installInstructions = true;
  }
}
