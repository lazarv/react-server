export async function build(root, options) {
  const { default: init$ } = await import("../../lib/loader/init.mjs");
  await init$();
  const { default: buildAction } = await import("./action.mjs");
  return await buildAction(root, options);
}
