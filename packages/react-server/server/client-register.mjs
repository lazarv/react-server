export function registerClientReference(target, id, name) {
  Object.defineProperties(target, {
    $$typeof: { value: Symbol.for("react.client.reference") },
    $$id: { value: `${id}#${name}` },
    $$async: { value: true },
  });
}
