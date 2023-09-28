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
    .action(async (...args) =>
      (await import("../../lib/start/action.mjs")).default(...args)
    );
