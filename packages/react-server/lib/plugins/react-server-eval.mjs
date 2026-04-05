import { fstatSync } from "node:fs";

// Check whether stdin is an actual pipe or file redirect (i.e. the user
// is piping code into react-server), as opposed to a TTY, /dev/null
// (background process), or a closed fd (spawned subprocess).
// `isFIFO()` catches `echo "code" | react-server`
// `isFile()` catches `react-server < file.jsx`
function isStdinPiped() {
  try {
    const stat = fstatSync(0);
    return stat.isFIFO() || stat.isFile();
  } catch {
    return false;
  }
}

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
        } else if (isStdinPiped()) {
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
