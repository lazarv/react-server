"use client";

/**
 * Index page — minimal SSR via client component path.
 * Same as / but rendered as a client component (no RSC Flight serialization).
 */
export default function Index() {
  return <h1>Benchmark</h1>;
}
