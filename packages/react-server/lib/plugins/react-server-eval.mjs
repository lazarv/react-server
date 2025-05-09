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
        if (options.eval) {
          return options.eval;
        } else if (!process.env.CI && !process.stdin.isTTY) {
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
