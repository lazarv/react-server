import { setEnv } from "../../lib/sys.mjs";

export default (cli) =>
  cli
    .command("start [root]", "start server in production mode")
    .option("--host [host]", "[string] host to listen on", {
      default: "localhost",
    })
    .option("--port <port>", "[number] port to listen on", { default: 3000 })
    .option("--https", "[boolean] use HTTPS protocol", { default: false })
    .option("--cors", "[boolean] enable CORS", { default: false })
    .option("--origin <origin>", "[string] origin", { default: "" })
    .option("--trust-proxy", "[boolean] trust proxy", { default: false })
    .option("--build <root>", "[string] build root", { default: "" })
    .option("--dev", "[boolean] development mode", { default: false })
    .option("--outDir <dir>", "[string] output directory", {
      default: ".react-server",
    })
    .action(async (...args) => {
      setEnv("NODE_ENV", "production");
      return (await import("../../lib/start/action.mjs")).default(...args);
    });
