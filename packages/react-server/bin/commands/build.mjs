import { isBun, isDeno, setEnv } from "../../lib/sys.mjs";

export default (cli) =>
  cli
    .command("build [root]", "build for production")
    .option("--minify", "minify", { default: true })
    .option(
      "--sourcemap [type]",
      "[boolean|inline|hidden|server|server-inline] generate source map",
      {
        default: false,
      }
    )
    .option("--no-color", "disable color output", { default: false })
    .option("--no-check", "skip dependency checks", { default: false })
    .option("--export", "[boolean] static export")
    .option("--compression", "[boolean] enable compression", { default: false })
    .option("--adapter <adapter>", "[boolean|string] adapter", {
      default: "",
      type: [String],
    })
    .option("--deploy", "[boolean] deploy using adapter", { default: false })
    .option("-e, --eval <code>", "evaluate code", { type: "string" })
    .option("--outDir <dir>", "[string] output directory", {
      default: ".react-server",
    })
    .option("--mode <mode>", "[string] mode", { default: "production" })
    .option("--edge", "[boolean] enable edge build mode", {
      default: false,
    })
    .option("--silent", "[boolean] suppress build output", { default: false })
    .option("--verbose", "[boolean] verbose build output", {
      default: false,
    })
    .action(async (root, options) => {
      setEnv("NODE_ENV", "production");
      if (options.verbose) {
        setEnv("REACT_SERVER_VERBOSE", "true");
      }
      if (isBun || isDeno) {
        options.edge = true;
      }
      const { default: init$ } = await import("../../lib/loader/init.mjs");
      await init$({ root, command: "build", ...options });
      const { patchViteForDeno } = await import("../../lib/loader/deno.mjs");
      patchViteForDeno();
      const { default: build } = await import("../../lib/build/action.mjs");
      return build(root, options);
    });
