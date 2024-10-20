import { setEnv } from "../../lib/sys.mjs";

export default (cli) =>
  cli
    .command("[root]", "start server in development mode", {
      ignoreOptionDefaultValue: true,
    })
    .option("--host [host]", "[string] host to listen on", {
      default: "localhost",
    })
    .option("--port <port>", "[number] port to listen on", { default: 3000 })
    .option("--https", "[boolean] use HTTPS protocol", { default: false })
    .option("--open [url]", "[boolean|string] open browser on server start", {
      default: false,
    })
    .option("--cors", "enable CORS", { default: false })
    .option("--force", "force optimize deps", { default: false })
    .option("--watch", "watch for config changes", { default: true })
    .option("--clear-screen", "clear screen on server start", {
      default: false,
    })
    .option("--no-color", "disable color output", { default: false })
    .option("-e, --eval <code>", "evaluate code", { type: "string" })
    .option("-o, --outDir <dir>", "[string] output directory", {
      default: ".react-server",
    })
    .option("-n, --name <name>", "[string] server name", {
      default: "react-server",
    })
    .action(async (...args) => {
      setEnv("NODE_ENV", "development");
      return (await import("../../lib/dev/action.mjs")).default(...args);
    });
