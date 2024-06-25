import colors from "picocolors";

import packageJson from "../../package.json" with { type: "json" };

export default function banner(target, dev) {
  console.log(
    `${colors.cyan(
      `${packageJson.name.split("/").pop()}/${packageJson.version}`
    )} ${colors.green(
      `building ${target} for ${dev ? "development" : "production"}`
    )}`
  );
}
