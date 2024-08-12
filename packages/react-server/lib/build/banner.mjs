import bannerMessage from "../utils/banner.mjs";

export default function banner(target, dev) {
  bannerMessage(`building ${target} for ${dev ? "development" : "production"}`);
}
