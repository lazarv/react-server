import colors from "picocolors";

import { version } from "../../server/version.mjs";

export default function banner(message) {
  console.log(`${colors.bold(colors.cyan(version))} ${colors.green(message)}`);
}
