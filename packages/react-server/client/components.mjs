export function client$(Component, name = "default") {
  if (typeof window !== "undefined") return Component;

  let id = "default";
  try {
    throw new Error();
  } catch (e) {
    const [, , source] = e.stack.split("\n");
    id =
      /\((.*):[0-9]+:[0-9]+\)/.exec(source)?.[1] ??
      /file:\/\/(.*):[0-9]+:[0-9]+/.exec(source)?.[1] ??
      "default";
  }

  Object.defineProperties(Component, {
    $$typeof: {
      value: Symbol.for("react.client.reference"),
    },
    $$id: {
      value: `${id}::${name}`,
    },
    $$async: {
      value: true,
    },
  });

  return Component;
}
