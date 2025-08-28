export function compose(middlewares) {
  if (!Array.isArray(middlewares))
    throw new TypeError("middlewares must be an array");
  for (const mw of middlewares) {
    if (typeof mw !== "function")
      throw new TypeError("middleware must be function");
  }
  return function composed(context) {
    let index = -1;
    async function dispatch(i) {
      if (i === middlewares.length) return undefined;
      if (i < 0) i = 0;
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      const fn = middlewares[i];
      if (!fn) return undefined;
      context.next = () => dispatch(i + 1);
      const result = await fn(context);
      if (result === undefined) return context.next();
      return result;
    }
    return dispatch(0);
  };
}
