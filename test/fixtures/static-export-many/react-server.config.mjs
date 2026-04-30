// Static export config for the at-scale spec.
//
// The whole point of this fixture is to drive the streaming export
// pipeline with the *generator* form of `config.export` — same shape
// as the documented "level up" pattern in docs/router/static. We
// declare an async generator here rather than an array so that:
//
//   - the path source is never materialized (this is what makes
//     "very-high amount of static exports" actually work);
//   - we exercise the generator-detection branch in
//     `lib/build/path-source.mjs` end-to-end through a real build;
//   - the path count can be lifted arbitrarily without hitting any
//     OS / IPC / env-var size limits the array form would.
//
// The count is read from STATIC_EXPORT_MANY_COUNT so the spec — and
// any contributor stress-testing the exporter manually — can crank
// the number without editing this file.
const COUNT = Number(process.env.STATIC_EXPORT_MANY_COUNT ?? 1000);

export default {
  async *export() {
    for (let i = 0; i < COUNT; i++) {
      yield { path: `/p/${i}`, rsc: false };
    }
  },
  prerender: false,
};
