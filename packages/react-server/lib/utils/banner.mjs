import colors from "picocolors";

import { version } from "../../server/version.mjs";
import { isInteractive } from "../build/output-filter.mjs";

export default function banner(message, emoji = "") {
  const suffix = emoji && isInteractive() ? ` ${emoji}` : "";
  console.log(
    `${colors.bold(colors.cyan(version))} ${colors.green(message)}${suffix}`
  );
}
