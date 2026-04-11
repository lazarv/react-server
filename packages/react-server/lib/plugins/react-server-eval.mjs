export default function reactServerEval(options) {
  return {
    name: "react-server:eval",
    resolveId: {
      filter: {
        id: /^virtual:react-server-eval\.jsx$/,
      },
      async handler(id) {
        return id;
      },
    },
    load: {
      filter: {
        id: /^virtual:react-server-eval\.jsx$/,
      },
      async handler() {
        // `--eval <code>` → use the literal code string.
        // `--eval` (no value) → read the entrypoint from stdin.
        // Stdin is never consulted unless `--eval` was explicitly passed.
        if (typeof options.eval === "string") {
          return options.eval;
        }
        if (options.eval === true) {
          let code = "";
          process.stdin.setEncoding("utf8");
          for await (const chunk of process.stdin) {
            code += chunk;
          }
          return code;
        }
        return "throw new Error('Root module not provided')";
      },
    },
  };
}
