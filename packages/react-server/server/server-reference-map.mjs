export const serverReferenceMap = new Proxy(
  {},
  {
    get(target, prop) {
      if (!target[prop]) {
        const [id, name] = prop.split("#");
        target[prop] = {
          id: `server-action://${id}`,
          name,
          chunks: [],
        };
      }
      return target[prop];
    },
  }
);
