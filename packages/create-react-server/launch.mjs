import { spawn } from "node:child_process";
import { relative } from "node:path";

import { confirm } from "@inquirer/prompts";
import colors from "picocolors";

import { theme } from "./lib/theme.mjs";

export async function launch(context) {
  const {
    env: { cwd, logger, projectDir },
    props: {
      packageManager: { name: packageManager },
      adapter,
      projectName,
      port,
    },
  } = context;

  const launchInDev =
    context.env.options.install !== false &&
    context.props.packageManager.install !== false &&
    (context.env.options.dev ??
      (context.env.hasOptions
        ? false
        : await confirm({
            message: "Launch in development mode?",
            theme,
          })));

  const devCommand = {
    npm: "npm run dev",
    pnpm: "pnpm dev",
    yarn: "yarn dev",
  };

  const buildCommand = {
    npm: "npm run build",
    pnpm: "pnpm build",
    yarn: "yarn build",
  };

  const startCommand = {
    npm: "npm start",
    pnpm: "pnpm start",
    yarn: "yarn start",
  };

  const instructions = () => {
    console.log(`\n📂 You can launch your project later by changing into the project directory by running:
${colors.cyan(`cd ${relative(cwd, projectDir)}`)}

${
  context.props.installInstructions
    ? `📦 To install dependencies, run:
${colors.cyan(`${context.props.packageManager.name} install`)}

`
    : ""
}Then choose from the following commands.

🚧 To launch the project in development mode, run:
${colors.cyan(devCommand[packageManager])}

🔧 To build the project for production, run:
${colors.cyan(buildCommand[packageManager])}

🚀 To start the production server, run:
${colors.cyan(startCommand[packageManager])}
${
  adapter === "docker"
    ? `\n🐳 To build a Docker image and start your application in a Docker container, run:
${colors.cyan(`docker build -t ${projectName} .`)}
${colors.cyan(`docker run --rm -ti -p ${port}:${port} ${projectName}`)}\n`
    : ""
}
💕 Thanks for choosing ${colors.bold("@lazarv/react-server")}!
📚 Check out the documentation at ${colors.underline("https://react-server.dev")}
💻 Happy coding!
`);
  };

  if (launchInDev) {
    process.chdir(projectDir);
    const server = spawn(
      packageManager,
      [
        ...(packageManager === "npm" ? ["run"] : []),
        "dev",
        ...(packageManager === "pnpm" ? [] : ["--"]),
        "--host",
        context.props.host,
        "--port",
        context.props.port,
        ...(context.env.options.open || !context.props.custom
          ? ["--open"]
          : []),
      ],
      {
        cwd: projectDir,
        stdio: ["inherit", "pipe", "pipe"],
        shell: true,
        env: {
          ...process.env,
          NODE_ENV: "development",
          NO_REACT_SERVER_LOGO: "true",
          FORCE_COLOR: process.env.NO_COLOR ? undefined : "true",
        },
      }
    );
    server.stdout.on("data", (data) => {
      let out = data;
      const message = data.toString();
      const lines = message.split("\n");
      if (lines.length > 1) {
        out = lines.filter((line) => !line.startsWith("> ")).join("\n");
        out = out.replace(/\n\n/g, "\n");
      }
      process.stdout.write(out);
    });
    server.stderr.on("data", (data) => {
      process.stderr.write(data);
    });
    server.on("error", (error) => {
      logger.error(error);
      process.exit(1);
    });
    server.on("close", () => {
      process.chdir(cwd);
      instructions();
      process.exit(server.status);
    });
  } else {
    instructions();
  }
}
