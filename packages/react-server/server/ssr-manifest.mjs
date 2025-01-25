export const ssrManifest = {
  serverConsumerManifest: {
    moduleMap: new Proxy(
      {},
      {
        get(target, id) {
          if (!target[id]) {
            target[id] = new Proxy(
              {},
              {
                get(target, name) {
                  if (!target[name]) {
                    target[name] = {
                      id,
                      name,
                      chunks: [],
                      async: true,
                    };
                  }
                  return target[name];
                },
              }
            );
          }
          return target[id];
        },
      }
    ),
  },
};
