export async function init$(ssrLoadModule) {
  const moduleCache = new Map();
  globalThis.__webpack_require__ = function (id) {
    if (!moduleCache.has(id)) {
      const modulePromise = ssrLoadModule(id);
      modulePromise.then(
        () => {
          modulePromise.value = modulePromise;
          modulePromise.status = "fulfilled";
        },
        (reason) => {
          modulePromise.reason = reason;
          modulePromise.status = "rejected";
        }
      );
      moduleCache.set(id, modulePromise);
    }
    return moduleCache.get(id);
  };
}
