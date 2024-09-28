import { dirname, join, relative } from "node:path";

import glob from "fast-glob";

import * as sys from "../sys.mjs";

const cwd = sys.cwd();

export default function configPrebuilt() {
  return {
    name: "react-server:config-prebuilt",
    resolveId(id) {
      if (id === "virtual:config/prebuilt") {
        return id;
      }
    },
    async load(id) {
      if (id === "virtual:config/prebuilt") {
        const configFiles = (
          await glob(
            [
              "**/{react-server,+*}.{production,runtime,server}.config.{json,js,ts,mjs,mts,ts.mjs,mts.mjs}",
              "**/+{production,runtime,server}.config.{json,js,ts,mjs,mts,ts.mjs,mts.mjs}",
              "!**/node_modules",
            ],
            {
              cwd,
            }
          )
        ).map((file) => relative(cwd, file));

        if (configFiles.length === 0) {
          return "export default {};";
        }

        return `import { CONFIG_ROOT } from "@lazarv/react-server/server/symbols.mjs";
import merge from "@lazarv/react-server/lib/utils/merge.mjs";

${configFiles.map((file, i) => `import config_${i} from "${join(cwd, file)}";`).join("\n")}

export default {
    ${
      configFiles.length > 0
        ? `${Object.entries(
            configFiles.reduce((acc, file, i) => {
              if (acc[dirname(file)]) {
                acc[dirname(file)].push(`config_${i}`);
              } else {
                acc[dirname(file)] = [`config_${i}`];
              }
              return acc;
            }, {})
          )
            .map(([key, value]) => `"${key}": merge({}, ${value.join(", ")})`)
            .join(",\n    ")}`
        : ""
    }
};`;
      }
    },
  };
}
