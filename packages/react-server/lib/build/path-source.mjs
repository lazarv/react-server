/**
 * Streaming path-source primitives for the static exporter.
 *
 * The exporter consumes paths via a single AsyncIterable<ExportPath>. This
 * file normalizes everything users may pass — strings, descriptors,
 * functions, sync/async iterables, generators — into that uniform stream
 * without ever materializing the path list. With a generator path source,
 * memory cost is O(one path descriptor) regardless of total path count.
 *
 * Back-compat:
 *   - `options.exportPaths` accepts the historical array shape, plus new
 *     async-iterable / generator shapes.
 *   - `configRoot.export` as a *regular* function keeps array-in/array-out
 *     semantics (we materialize for it). As an `async function*` (or sync
 *     generator function) it receives the live AsyncIterable and is
 *     expected to yield ExportPath items lazily — true streaming transform.
 *     The constructor-name check (`AsyncGeneratorFunction` /
 *     `GeneratorFunction`) is the explicit opt-in: if you write
 *     `async function*`, you get streaming.
 */

/**
 * Normalize anything path-source-shaped into AsyncIterable<ExportPath>.
 *
 * Accepts:
 *   - `null` / `undefined` (yields nothing)
 *   - `string` (yields `{ path: string }`)
 *   - descriptor object (yields it as-is if it has `path` or `filename`)
 *   - function returning any of the above (called, result re-normalized)
 *   - sync iterable (Array, Set, generator) of any of the above
 *   - async iterable (async generator, ReadableStream-like) of any of the
 *     above
 *
 * Recursive: arrays-of-functions-returning-arrays etc. are flattened lazily.
 */
export async function* toPathStream(source) {
  if (source == null) return;

  if (typeof source === "string") {
    yield { path: source };
    return;
  }

  if (typeof source === "function") {
    yield* toPathStream(await source());
    return;
  }

  // Async iterables take precedence over sync iterables — some objects
  // implement both (e.g. ReadableStream in newer Node).
  if (typeof source[Symbol.asyncIterator] === "function") {
    for await (const item of source) {
      yield* toPathStream(item);
    }
    return;
  }

  if (typeof source[Symbol.iterator] === "function") {
    for (const item of source) {
      yield* toPathStream(item);
    }
    return;
  }

  if (typeof source === "object" && (source.path || source.filename)) {
    yield source;
    return;
  }

  throw new Error(
    `Invalid export path entry: ${JSON.stringify(source)} — expected string, descriptor object with "path" or "filename", function, or (async) iterable thereof.`
  );
}

/**
 * Detect whether a function is a generator or async generator. Detection is
 * by `constructor.name`, which is well-defined for the language's built-in
 * generator function constructors. Wrappers (e.g. memoization layers) that
 * return ordinary functions will fall through to the array-transform path —
 * users who need streaming should write `async function*` directly.
 */
function isGeneratorFunction(fn) {
  if (typeof fn !== "function") return false;
  const name = fn.constructor?.name;
  return name === "AsyncGeneratorFunction" || name === "GeneratorFunction";
}

/**
 * Compose `options.exportPaths` and `configRoot.export` into a single
 * AsyncIterable<ExportPath>. This is what the exporter consumes.
 *
 * Rules:
 *   - `options.exportPaths` is always normalized via `toPathStream` —
 *     anything goes, including async generators.
 *   - `configRoot.export` of array form is a static prelude that yields
 *     before user paths.
 *   - `configRoot.export` of regular-function form preserves the
 *     historical array-in/array-out contract: we materialize the user
 *     stream into an array, hand it to the function, then re-stream the
 *     return value. This is back-compat — the user opted into array
 *     semantics by writing a non-generator function.
 *   - `configRoot.export` of generator-function form (`async function*`)
 *     receives the live AsyncIterable<ExportPath> and is itself a
 *     streaming transform. No materialization.
 */
export async function* buildPathStream(options, configRoot) {
  const userStream = toPathStream(options.exportPaths);

  if (typeof configRoot.export === "function") {
    if (isGeneratorFunction(configRoot.export)) {
      // Streaming transform. The user yields paths derived from `userStream`
      // (or independent sources) without materializing.
      const transformed = configRoot.export(userStream);
      yield* toPathStream(transformed);
      return;
    }

    // Legacy array-transform contract: materialize, hand over, re-stream.
    // Users with millions of paths should switch to a generator form to
    // skip this materialization.
    const collected = [];
    for await (const p of userStream) collected.push(p);
    const result = await configRoot.export(collected);
    yield* toPathStream(result);
    return;
  }

  if (Array.isArray(configRoot.export)) {
    yield* toPathStream(configRoot.export);
  }
  yield* userStream;
}

/**
 * Validate-as-you-go. Wraps an AsyncIterable<ExportPath> with per-item
 * normalization (string → descriptor) and fail-fast validation. Any item
 * lacking both `path` and `filename` throws immediately, naming the
 * offending item — no count-and-report-at-end pass needed.
 */
export async function* validatedPathStream(stream) {
  for await (const item of stream) {
    const descriptor = typeof item === "string" ? { path: item } : item;
    if (!descriptor || (!descriptor.path && !descriptor.filename)) {
      throw new Error(
        `Export path entry is missing "path" (or "filename"): ${JSON.stringify(item)}`
      );
    }
    yield descriptor;
  }
}
