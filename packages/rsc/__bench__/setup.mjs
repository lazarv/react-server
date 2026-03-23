/**
 * Vitest bench setup file
 *
 * Mock webpack globals required by react-server-dom-webpack.
 * Mirrors __tests__/setup.mjs for benchmark isolation.
 */

globalThis.__webpack_require__ = (_id) => {
  return {};
};

globalThis.__webpack_chunk_load__ = () => Promise.resolve();
