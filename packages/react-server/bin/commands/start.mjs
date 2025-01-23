import { setEnv } from "../../lib/sys.mjs";

export default (cli) => {
  const command = cli
    .command("start [root]", "start server in production mode", {
      ignoreOptionDefaultValue: true,
    })
    .option("--host [host]", "[string] host to listen on", {
      default: "localhost",
    })
    .option("--port <port>", "[number] port to listen on", { default: 3000 })
    .option("--https", "[boolean] use HTTPS protocol", { default: false })
    .option("--cors", "[boolean] enable CORS", { default: false })
    .option("--origin <origin>", "[string] origin", { default: "" })
    .option("--trust-proxy", "[boolean] trust proxy", { default: false })
    .option("--build <root>", "[string] build root", { default: "" })
    .option("--outDir <dir>", "[string] output directory", {
      default: ".react-server",
    })
    .action(async (...args) => {
      if (typeof Bun !== "undefined" && process.env.NODE_ENV !== "production") {
        const { spawnSync } = await import("bun");
        spawnSync(process.argv, {
          env: {
            ...process.env,
            NODE_ENV: "production",
          },
          stdout: "inherit",
          stderr: "inherit",
        });

        process.exit(0);
      }

      setEnv("NODE_ENV", "production");
      return (await import("../../lib/start/action.mjs")).default(...args);
    });
  command.__react_server_check_node_version__ = false;
  command.__react_server_check_deps__ = false;
  return command;
};
