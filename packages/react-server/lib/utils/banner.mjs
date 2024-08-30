import colors from "picocolors";

import packageJson from "../../package.json" with { type: "json" };

export default function banner(message) {
  console.log(
    `${colors.bold(
      colors.cyan(`${packageJson.name.split("/").pop()}/${packageJson.version}`)
    )} ${colors.green(message)}`
  );
}
