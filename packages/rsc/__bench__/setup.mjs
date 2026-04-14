/**
 * Vitest bench setup file
 *
 * Mock webpack globals required by react-server-dom-webpack.
 *
 * The `client.browser` production bundle reads `__webpack_require__.u` at
 * top-level module evaluation, so the global must exist before any
 * `import("react-server-dom-webpack/client.browser")` runs. Without these
 * mocks the import throws `ReferenceError: __webpack_require__ is not
 * defined` and the bench file is reported as a failed suite — which means
 * webpack columns never appear in the Flight Protocol benchmark report.
 *
 * Our bench fixtures contain no client references, so `__webpack_require__`
 * is only ever consulted for `.u` (chunk filename resolution). Calling it
 * as a function would mean a fixture leaked a client reference — surface
 * that loudly rather than silently returning an empty module.
 */

globalThis.__webpack_chunk_load__ = () => Promise.resolve();

const webpackRequire = function (id) {
  throw new Error(
    `__webpack_require__(${JSON.stringify(id)}) called in benchmark — ` +
      `bench fixtures must not contain client references.`
  );
};
webpackRequire.u = (id) => `${id}.js`;
globalThis.__webpack_require__ = webpackRequire;
