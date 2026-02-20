import { isBun, isDeno, setEnv, cwd } from "../../lib/sys.mjs";

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
      const [root, options] = args;
      options.cwd = cwd();
      setEnv("REACT_SERVER_CWD", options.cwd);

      // Deno: import the generated .deno/start.mjs directly
      if (isDeno) {
        const [{ existsSync }, { join }, { cwd }, { generateDenoImportMap }] =
          await Promise.all([
            import("node:fs"),
            import("node:path"),
            import("../../lib/sys.mjs"),
            import("../../lib/loader/deno.mjs"),
          ]);

        const importMapPath = await generateDenoImportMap({
          ...options,
          condition: "react-server",
        });
        const startScript = join(cwd(), ".deno", "start.mjs");

        const env = Deno.env.toObject();
        if (options.port) {
          env.PORT = String(options.port);
        }
        if (options.host && options.host !== true) {
          env.HOST = options.host;
        }
        if (options.origin) {
          env.ORIGIN = options.origin;
        }

        if (existsSync(startScript)) {
          const denoConfigPath = join(cwd(), "react-server.deno.json");

          // Spawn .deno/start.mjs directly. If react-server.deno.json exists,
          // apply it via --config so unstable flags (e.g. kv) are available.
          // We use the project-level config (not .deno/deno.json) because the
          // generated .deno/deno.json has "nodeModulesDir": "none".
          const args = ["run"];
          if (existsSync(denoConfigPath)) {
            args.push("--config", denoConfigPath);
          }
          args.push("-A", "--import-map", importMapPath, startScript);

          const cmd = new Deno.Command(Deno.execPath(), {
            cwd: options.cwd,
            args,
            stdin: "inherit",
            stdout: "inherit",
            stderr: "inherit",
            env,
          });
          const { code } = await cmd.output();
          Deno.exit(code);
        }

        // No .deno/start.mjs — fall through to normal production start
        // with Deno import map for .react-server/... specifier resolution
      }

      // Bun: import the generated .bun/start.mjs directly
      if (isBun) {
        const { join } = await import("node:path");
        const { pathToFileURL } = await import("node:url");

        if (options.port) {
          setEnv("PORT", String(options.port));
        }
        if (options.host && options.host !== true) {
          setEnv("HOST", options.host);
        }
        if (options.origin) {
          setEnv("ORIGIN", options.origin);
        }

        const startScript = join(options.cwd, ".bun", "start.mjs");
        try {
          await import(pathToFileURL(startScript).href);
          return;
        } catch {
          // No .bun/start.mjs — fall through to normal production start
        }
      }

      setEnv("NODE_ENV", "production");
      const { default: init$ } = await import("../../lib/loader/init.mjs");
      await init$({ root, command: "start", ...options });
      return (await import("../../lib/start/action.mjs")).default(
        root,
        options
      );
    });
  command.__react_server_check_node_version__ = false;
  command.__react_server_check_deps__ = false;
  return command;
};
