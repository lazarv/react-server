export * from "./context.mjs";
export { default as ClientOnly } from "./ClientOnly.jsx";

export function client$(Component) {
  return Component;
}
