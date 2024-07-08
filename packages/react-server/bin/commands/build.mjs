export default (cli) =>
  cli
    .command("build [root]", "build for production")
    .option("--minify", "minify", { default: true })
    .option(
      "--sourcemap [type]",
      "[boolean|inline|hidden] generate source map",
      {
        default: false,
      }
    )
    .option("--no-color", "disable color output", { default: false })
    .option("--server", "[boolean] build server", { default: true })
    .option("--client", "[boolean] build client", { default: true })
    .option("--export", "[boolean] static export", { default: false })
    .option("--adapter <adapter>", "[boolean|string] adapter", {
      default: "",
      type: [String],
    })
    .option("--deploy", "[boolean] deploy using adapter", { default: false })
    .option("--outDir <dir>", "[string] output directory", {
      default: ".react-server",
    })
    .action(async (...args) =>
      (await import("../../lib/build/action.mjs")).default(...args)
    );
