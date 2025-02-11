import viteReact from "../plugins/vite-plugin-react.mjs";

export function userOrBuiltInVitePluginReact(plugins, options) {
  if (!plugins) return [viteReact(options)];
  return plugins.find(
    (plugin) =>
      plugin.name?.includes("vite:react") ||
      plugin.every?.((p) => p.name?.includes("vite:react"))
  )
    ? plugins.filter(
        (plugin) =>
          plugin.name?.includes("vite:react") ||
          plugin.every?.((p) => p.name?.includes("vite:react"))
      )
    : [viteReact(options)];
}

export function filterOutVitePluginReact(plugins) {
  if (!plugins) return [];
  return (
    plugins?.filter(
      (plugin) =>
        !plugin.name?.includes("vite:react") &&
        !plugin.every?.((p) => p.name?.includes("vite:react"))
    ) ?? []
  );
}
