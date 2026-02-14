import colors from "picocolors";
import bannerMessage from "../utils/banner.mjs";
import { formatDuration } from "../utils/format.mjs";
import { getEnv } from "../sys.mjs";

// Emoji map for build targets (only shown in interactive mode)
const targetEmojis = {
  bundles: "📦",
  manifest: "📋",
  static: "🌐",
};

export default function banner(target, dev) {
  const emoji = targetEmojis[target] || "";
  bannerMessage(
    `building ${target} for ${dev ? "development" : "production"}${typeof globalThis.__react_server_start__ === "number" && getEnv("REACT_SERVER_VERBOSE") ? colors.gray(` [${formatDuration(Date.now() - globalThis.__react_server_start__)}]`) : ""}`,
    emoji
  );
}
