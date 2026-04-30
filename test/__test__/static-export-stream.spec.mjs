import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createWriteStream } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { fanout } from "@lazarv/react-server/lib/build/fanout.mjs";
import { pMapStream } from "@lazarv/react-server/lib/build/p-map-stream.mjs";
import {
  buildPathStream,
  toPathStream,
  validatedPathStream,
} from "@lazarv/react-server/lib/build/path-source.mjs";

// These tests cover the load-bearing properties of the new streaming
// static-export pipeline. Each property is tested as a standalone unit
// so a regression points cleanly at the primitive that broke:
//
//   pMapStream    - bounded concurrency, no eager closure materialization
//   toPathStream  - normalization of every supported input shape
//   buildPathStream - generator-function streaming + array back-compat
//   validatedPathStream - fail-fast on bad entries
//   fanout        - one-chunk-in-flight fan-out, backpressure honored
//
// End-to-end (running an actual export against a large fixture and
// checking heap_used) is the right complement, but lives in a separate
// integration spec — the build phase is too heavyweight for this file.

describe("pMapStream", () => {
  test("processes every item exactly once", async () => {
    const seen = [];
    await pMapStream(
      (function* () {
        for (let i = 0; i < 100; i++) yield i;
      })(),
      async (i) => {
        seen.push(i);
      },
      4
    );
    expect(seen.toSorted((a, b) => a - b)).toEqual(
      Array.from({ length: 100 }, (_, i) => i)
    );
  });

  test("respects concurrency bound (never exceeds N in flight)", async () => {
    let inflight = 0;
    let peak = 0;
    const concurrency = 4;
    await pMapStream(
      (function* () {
        for (let i = 0; i < 200; i++) yield i;
      })(),
      async () => {
        inflight++;
        if (inflight > peak) peak = inflight;
        await new Promise((r) => setTimeout(r, 1));
        inflight--;
      },
      concurrency
    );
    expect(peak).toBeLessThanOrEqual(concurrency);
    // Should saturate the pool — not just run sequentially.
    expect(peak).toBeGreaterThanOrEqual(concurrency - 1);
  });

  test("consumes async iterables lazily (source pull only when worker free)", async () => {
    let pulled = 0;
    const concurrency = 3;
    const total = 50;

    async function* source() {
      for (let i = 0; i < total; i++) {
        pulled++;
        yield i;
      }
    }

    let completed = 0;
    await pMapStream(
      source(),
      async () => {
        // The invariant we care about: the source is not pulled ahead
        // of the consumer by more than `concurrency` items.
        expect(pulled - completed).toBeLessThanOrEqual(concurrency);
        await new Promise((r) => setTimeout(r, 0));
        completed++;
      },
      concurrency
    );
    expect(completed).toBe(total);
  });

  test("propagates the first mapper error and stops further pulls", async () => {
    const seen = [];
    await expect(
      pMapStream(
        (function* () {
          for (let i = 0; i < 100; i++) yield i;
        })(),
        async (i) => {
          seen.push(i);
          if (i === 5) throw new Error("boom");
        },
        2
      )
    ).rejects.toThrow("boom");
    // After the error, in-flight workers may finish their current item
    // but no new items should be pulled. Sanity check: we shouldn't
    // have processed all 100.
    expect(seen.length).toBeLessThan(100);
  });

  test("rejects concurrency < 1", async () => {
    await expect(pMapStream([1, 2], async () => {}, 0)).rejects.toThrow(
      /concurrency must be >= 1/
    );
  });
});

describe("toPathStream", () => {
  async function collect(asyncIter) {
    const out = [];
    for await (const x of asyncIter) out.push(x);
    return out;
  }

  test("normalizes string to descriptor", async () => {
    expect(await collect(toPathStream("/foo"))).toEqual([{ path: "/foo" }]);
  });

  test("yields nothing for null / undefined", async () => {
    expect(await collect(toPathStream(null))).toEqual([]);
    expect(await collect(toPathStream(undefined))).toEqual([]);
  });

  test("normalizes descriptor as-is", async () => {
    const d = { path: "/x", outlet: "y" };
    expect(await collect(toPathStream(d))).toEqual([d]);
  });

  test("flattens arrays of mixed shapes", async () => {
    const out = await collect(toPathStream(["/a", { path: "/b" }, () => "/c"]));
    expect(out).toEqual([{ path: "/a" }, { path: "/b" }, { path: "/c" }]);
  });

  test("consumes sync generator", async () => {
    const out = await collect(
      toPathStream(
        (function* () {
          yield "/a";
          yield { path: "/b" };
        })()
      )
    );
    expect(out).toEqual([{ path: "/a" }, { path: "/b" }]);
  });

  test("consumes async generator", async () => {
    async function* gen() {
      yield "/a";
      yield { path: "/b" };
    }
    expect(await collect(toPathStream(gen()))).toEqual([
      { path: "/a" },
      { path: "/b" },
    ]);
  });

  test("calls function and re-normalizes its result", async () => {
    expect(await collect(toPathStream(() => ["/a", "/b"]))).toEqual([
      { path: "/a" },
      { path: "/b" },
    ]);
    expect(
      await collect(
        toPathStream(async () =>
          (async function* () {
            yield "/c";
          })()
        )
      )
    ).toEqual([{ path: "/c" }]);
  });

  test("throws on invalid entry", async () => {
    await expect(collect(toPathStream(42))).rejects.toThrow(
      /Invalid export path entry/
    );
    await expect(collect(toPathStream({}))).rejects.toThrow(
      /Invalid export path entry/
    );
  });
});

describe("buildPathStream", () => {
  async function collect(asyncIter) {
    const out = [];
    for await (const x of asyncIter) out.push(x);
    return out;
  }

  test("array-form configRoot.export prepends to options.exportPaths", async () => {
    const out = await collect(
      buildPathStream(
        { exportPaths: ["/from-options"] },
        { export: ["/from-config"] }
      )
    );
    expect(out).toEqual([{ path: "/from-config" }, { path: "/from-options" }]);
  });

  test("regular-function configRoot.export gets array, returns array", async () => {
    let received;
    const out = await collect(
      buildPathStream(
        { exportPaths: ["/a", "/b"] },
        {
          // Plain (non-generator) function — legacy contract.
          export: (paths) => {
            received = paths;
            return [...paths, { path: "/c" }];
          },
        }
      )
    );
    expect(received).toEqual([{ path: "/a" }, { path: "/b" }]);
    expect(out).toEqual([{ path: "/a" }, { path: "/b" }, { path: "/c" }]);
  });

  test("async-generator configRoot.export streams (no materialization)", async () => {
    // Source yields paths one at a time; the generator transform must
    // produce its first output before the source is exhausted. We assert
    // this by interleaving the source with a flag the transform reads.
    const sourceSeen = [];
    let firstYielded = false;

    async function* source() {
      for (let i = 0; i < 5; i++) {
        sourceSeen.push(i);
        // After we yield the first item, the transform should be able to
        // produce its first output before we loop again. If
        // buildPathStream materialized the source for the function,
        // `firstYielded` would still be false here at i=1.
        if (i === 1) {
          // Yield to event loop so the consumer can advance.
          await new Promise((r) => setImmediate(r));
          expect(firstYielded).toBe(true);
        }
        yield { path: `/p${i}` };
      }
    }

    async function* transform(paths) {
      for await (const p of paths) {
        firstYielded = true;
        yield { ...p, transformed: true };
      }
    }

    const out = await collect(
      buildPathStream({ exportPaths: source() }, { export: transform })
    );
    expect(out.length).toBe(5);
    expect(out.every((p) => p.transformed)).toBe(true);
    expect(sourceSeen).toEqual([0, 1, 2, 3, 4]);
  });

  test("sync-generator configRoot.export also streams", async () => {
    // function* (not async function*) is also detected as streaming.
    function* transform(_paths) {
      // Sync generators can't `for await`, but they can pass through
      // the iterable. Verify the constructor.name detection is by class.
      // Here we just yield a sentinel without consuming paths to prove
      // the transform was called with the live AsyncIterable.
      yield { path: "/sentinel" };
    }
    const out = await collect(
      buildPathStream({ exportPaths: ["/skipped"] }, { export: transform })
    );
    expect(out).toEqual([{ path: "/sentinel" }]);
  });

  test("generator export passes through router paths and lazily yields more", async () => {
    // The documented "level up" pattern from docs/router/static#streaming-export:
    //   for await (const p of paths) yield p;     // passthrough
    //   for (const item of <fetch...>) yield ...; // append more, lazily
    //
    // We assert two things:
    //   (1) every router-side path appears in the output before the appended ones
    //   (2) the generator was driven lazily (the appended ones aren't pre-collected
    //       before the passthrough completes)
    let appendedYieldedAt = -1;
    let passthroughDoneAt = -1;
    let consumed = 0;

    async function* transform(paths) {
      for await (const p of paths) {
        yield { ...p, source: "router" };
      }
      passthroughDoneAt = consumed;
      for (let i = 0; i < 3; i++) {
        if (appendedYieldedAt === -1) appendedYieldedAt = consumed;
        yield { path: `/cms/${i}`, source: "cms" };
      }
    }

    const stream = buildPathStream(
      { exportPaths: ["/r1", "/r2"] },
      { export: transform }
    );
    const out = [];
    for await (const p of stream) {
      consumed++;
      out.push(p);
    }

    expect(out).toEqual([
      { path: "/r1", source: "router" },
      { path: "/r2", source: "router" },
      { path: "/cms/0", source: "cms" },
      { path: "/cms/1", source: "cms" },
      { path: "/cms/2", source: "cms" },
    ]);
    // Lazy proof: the first appended item was yielded *after* the consumer
    // had already pulled both router paths — not pre-collected.
    expect(passthroughDoneAt).toBe(2);
    expect(appendedYieldedAt).toBe(2);
  });

  test("generator export composes with validatedPathStream end-to-end", async () => {
    // Mirrors the production pipeline shape: buildPathStream → validatedPathStream
    // → consumer. Generator output must flow through validation unchanged when
    // every yielded item has `path` or `filename`.
    async function* transform(paths) {
      for await (const p of paths) yield p;
      yield { path: "/added" };
      yield { filename: "404.html" };
    }
    const out = [];
    for await (const p of validatedPathStream(
      buildPathStream({ exportPaths: ["/r"] }, { export: transform })
    )) {
      out.push(p);
    }
    expect(out).toEqual([
      { path: "/r" },
      { path: "/added" },
      { filename: "404.html" },
    ]);
  });

  test("generator export errors propagate as rejections (fail-fast)", async () => {
    // A user generator that throws mid-stream must surface the error to the
    // consumer rather than being swallowed by the iterable plumbing.
    async function* transform(paths) {
      let i = 0;
      for await (const p of paths) {
        if (i++ === 1) throw new Error("boom from user export()");
        yield p;
      }
    }
    const stream = buildPathStream(
      { exportPaths: ["/a", "/b", "/c"] },
      { export: transform }
    );
    await expect(
      (async () => {
        // eslint-disable-next-line no-unused-vars
        for await (const _item of stream) {
          /* drain */
        }
      })()
    ).rejects.toThrow(/boom from user export/);
  });
});

describe("streaming pipeline outstanding-window invariant", () => {
  // The load-bearing property of the streaming exporter is that the
  // source is never pulled more than `concurrency` items ahead of the
  // consumer — if that ever breaks, an arbitrarily large source can no
  // longer be exported in bounded memory. We assert this *structural*
  // invariant rather than measure RSS (V8 GC is non-deterministic in CI).
  //
  // The end-to-end behaviour at very high N (100k+ paths through a real
  // build) lives in `__test__/apps/static-export-many.spec.mjs`, which
  // only runs under `pnpm test-build-start`. Here we run the same
  // structural check at a much smaller N: the invariant is N-independent,
  // and keeping N small keeps `test-dev-base` fast — these specs run on
  // every dev iteration.

  const N = 2000;

  test("generator-yielded paths flow through buildPathStream with bounded outstanding window", async () => {
    const concurrency = 8;
    let pulled = 0;
    let completed = 0;
    let maxOutstanding = 0;

    async function* routerSource() {
      for (let i = 0; i < N; i++) {
        pulled++;
        // Track the largest gap we ever observe between source pulls and
        // consumer completions. If the streaming contract holds, this
        // stays <= concurrency for the entire run, regardless of `N`.
        const outstanding = pulled - completed;
        if (outstanding > maxOutstanding) maxOutstanding = outstanding;
        yield { path: `/p/${i}` };
      }
    }

    // User-defined async generator export: passes through router paths
    // and tags each — exactly the documented `config.export` shape.
    async function* userExport(paths) {
      for await (const p of paths) yield { ...p, tag: "x" };
    }

    await pMapStream(
      validatedPathStream(
        buildPathStream({ exportPaths: routerSource() }, { export: userExport })
      ),
      async () => {
        // Trivial mapper — the test is about the path source, not work
        // done per item. A microtask-yielding await is enough to make
        // the outstanding-window invariant non-trivial to satisfy.
        await Promise.resolve();
        completed++;
      },
      concurrency
    );

    expect(completed).toBe(N);
    expect(pulled).toBe(N);
    // The structural invariant: outstanding never exceeds the worker pool.
    // This is what makes the exporter usable for "infinite" path sources.
    expect(maxOutstanding).toBeLessThanOrEqual(concurrency);
  });

  test("single-worker consumer holds the outstanding window at <= 1", async () => {
    // concurrency = 1 should reduce to "pull one, process one" behaviour —
    // the outstanding window collapses to <= 1 at all times. Captures the
    // single-process exporter path (`exportConcurrency: 1`).
    let pulled = 0;
    let completed = 0;
    let maxOutstanding = 0;

    async function* source() {
      for (let i = 0; i < N; i++) {
        pulled++;
        const outstanding = pulled - completed;
        if (outstanding > maxOutstanding) maxOutstanding = outstanding;
        yield { path: `/p/${i}` };
      }
    }

    await pMapStream(
      validatedPathStream(buildPathStream({ exportPaths: source() }, {})),
      async () => {
        completed++;
      },
      1
    );

    expect(completed).toBe(N);
    expect(maxOutstanding).toBeLessThanOrEqual(1);
  });
});

describe("validatedPathStream", () => {
  async function collect(asyncIter) {
    const out = [];
    for await (const x of asyncIter) out.push(x);
    return out;
  }

  test("yields valid descriptors as-is", async () => {
    const out = await collect(
      validatedPathStream(
        (async function* () {
          yield "/a";
          yield { path: "/b" };
          yield { filename: "404.html" };
        })()
      )
    );
    expect(out).toEqual([
      { path: "/a" },
      { path: "/b" },
      { filename: "404.html" },
    ]);
  });

  test("throws fail-fast on first invalid entry", async () => {
    await expect(
      collect(
        validatedPathStream(
          (async function* () {
            yield "/a";
            yield { outlet: "no-path-or-filename" };
          })()
        )
      )
    ).rejects.toThrow(/missing "path"/);
  });
});

describe("fanout", () => {
  async function tmpFile(name) {
    const dir = await mkdtemp(join(tmpdir(), "rs-fanout-"));
    return {
      path: join(dir, name),
      cleanup: () => rm(dir, { recursive: true, force: true }),
    };
  }

  function chunkStream(chunks) {
    return new ReadableStream({
      start(controller) {
        for (const c of chunks) {
          controller.enqueue(
            typeof c === "string" ? new TextEncoder().encode(c) : c
          );
        }
        controller.close();
      },
    });
  }

  test("delivers every chunk to every sink in order", async () => {
    const f1 = await tmpFile("a.txt");
    const f2 = await tmpFile("b.txt");
    try {
      await fanout(chunkStream(["hello ", "world", "!"]), [
        createWriteStream(f1.path),
        createWriteStream(f2.path),
      ]);
      expect(await readFile(f1.path, "utf8")).toBe("hello world!");
      expect(await readFile(f2.path, "utf8")).toBe("hello world!");
    } finally {
      await f1.cleanup();
      await f2.cleanup();
    }
  });

  test("handles empty stream by closing sinks cleanly", async () => {
    const f = await tmpFile("empty.txt");
    try {
      await fanout(chunkStream([]), [createWriteStream(f.path)]);
      expect(await readFile(f.path, "utf8")).toBe("");
    } finally {
      await f.cleanup();
    }
  });

  test("waits for slow sink (backpressure honored)", async () => {
    const f = await tmpFile("slow.txt");
    try {
      // 1 MB of data, written through a normal file stream. With proper
      // backpressure, fanout finishes only after the file is fully
      // flushed — the assertion below hits real bytes on disk.
      const big = "x".repeat(1024 * 1024);
      await fanout(chunkStream([big]), [createWriteStream(f.path)]);
      const stat = await readFile(f.path, "utf8");
      expect(stat.length).toBe(big.length);
    } finally {
      await f.cleanup();
    }
  });

  test("handles null body (no source) by closing sinks", async () => {
    const f = await tmpFile("null.txt");
    try {
      await fanout(null, [createWriteStream(f.path)]);
      expect(await readFile(f.path, "utf8")).toBe("");
    } finally {
      await f.cleanup();
    }
  });
});
