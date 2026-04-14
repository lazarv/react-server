/**
 * Shared fixture factories for Flight protocol benchmarks.
 *
 * These produce React trees and data structures of varying shape and size.
 * Factories are called once in beforeAll and the result reused across
 * iterations so we benchmark serialization, not fixture construction.
 */

import React from "react";

// ── React Tree Fixtures ─────────────────────────────────────────

/** Single <div> with text child */
export function minimalElement() {
  return React.createElement("div", null, "hello");
}

/** 1000 sibling <span> elements under one <div> */
export function shallowWide() {
  const children = Array.from({ length: 1000 }, (_, i) =>
    React.createElement("span", { key: i }, `item ${i}`)
  );
  return React.createElement("div", null, ...children);
}

/** 100-level deep nesting: div > div > ... > span */
export function deepNested(depth = 100) {
  let el = React.createElement("span", null, "leaf");
  for (let i = 0; i < depth; i++) {
    el = React.createElement("div", { key: i }, el);
  }
  return el;
}

/** Realistic product list with structured children */
export function productList(count = 50) {
  const items = Array.from({ length: count }, (_, i) =>
    React.createElement(
      "li",
      { key: i, className: "product" },
      React.createElement("h3", null, `Product ${i}`),
      React.createElement(
        "p",
        null,
        `Description for product ${i} with some details about features and specifications.`
      ),
      React.createElement(
        "span",
        { className: "price" },
        `$${(i * 9.99).toFixed(2)}`
      ),
      React.createElement(
        "span",
        { className: "rating" },
        `${(3 + Math.random() * 2).toFixed(1)} stars`
      )
    )
  );
  return React.createElement("ul", { className: "product-list" }, ...items);
}

/** 500-row x 10-column table */
export function largeTable(rows = 500, cols = 10) {
  const headerCells = Array.from({ length: cols }, (_, c) =>
    React.createElement("th", { key: c }, `Col ${c}`)
  );
  const header = React.createElement(
    "thead",
    null,
    React.createElement("tr", null, ...headerCells)
  );

  const bodyRows = Array.from({ length: rows }, (_, r) => {
    const cells = Array.from({ length: cols }, (_, c) =>
      React.createElement("td", { key: c }, `r${r}c${c}`)
    );
    return React.createElement("tr", { key: r }, ...cells);
  });
  const body = React.createElement("tbody", null, ...bodyRows);

  return React.createElement("table", null, header, body);
}

// ── Data Type Fixtures ──────────────────────────────────────────

/** Primitive values: string, number, boolean, null */
export function primitives() {
  return {
    str: "hello world",
    num: 42,
    float: Math.PI,
    bool: true,
    nil: null,
    negZero: -0,
    inf: Infinity,
    negInf: -Infinity,
    nan: NaN,
  };
}

/** 100KB string payload */
export function largeString() {
  return "x".repeat(100_000);
}

/** 20-level deep nested object */
export function nestedObjects() {
  const build = (depth) =>
    depth === 0
      ? { leaf: true, value: "terminal" }
      : { child: build(depth - 1), value: depth, label: `level-${depth}` };
  return build(20);
}

/** 10,000-element array of objects */
export function largeArray() {
  return Array.from({ length: 10_000 }, (_, i) => ({
    id: i,
    name: `item-${i}`,
    active: i % 2 === 0,
  }));
}

/** Map with 100 entries, Set with 100 entries */
export function mapAndSet() {
  return {
    map: new Map(
      Array.from({ length: 100 }, (_, i) => [
        `key-${i}`,
        { index: i, data: `val-${i}` },
      ])
    ),
    set: new Set(Array.from({ length: 100 }, (_, i) => i * 7)),
  };
}

/** Date, BigInt, Infinity, NaN, Symbol.for, RegExp */
export function specialTypes() {
  return {
    date: new Date("2024-06-15T12:00:00Z"),
    bigint: BigInt("12345678901234567890"),
    sym: Symbol.for("bench.symbol"),
  };
}

/** Typed arrays: Uint8Array (10KB), Int32Array (20KB), Float64Array (20KB) */
export function typedArrays() {
  const uint8 = new Uint8Array(10_000);
  const int32 = new Int32Array(5_000);
  const float64 = new Float64Array(2_500);
  // Fill with non-zero data to avoid compression shortcuts
  for (let i = 0; i < uint8.length; i++) uint8[i] = i & 0xff;
  for (let i = 0; i < int32.length; i++) int32[i] = i * 17;
  for (let i = 0; i < float64.length; i++) float64[i] = i * 0.123;
  return { uint8, int32, float64 };
}

/** Mixed payload combining React elements, collections, and binary data */
export function mixedPayload() {
  return {
    tree: productList(10),
    data: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item-${i}` })),
    map: new Map([
      ["alpha", 1],
      ["beta", 2],
      ["gamma", 3],
    ]),
    date: new Date("2025-01-01T00:00:00Z"),
    bigint: BigInt(999),
    buffer: new Uint8Array(1000).fill(42),
  };
}

// ── Scenario registry ───────────────────────────────────────────

/**
 * All scenarios keyed by name.
 * Each bench file iterates this to generate benchmarks programmatically.
 */
export const scenarios = {
  // React trees
  "react: minimal element": minimalElement,
  "react: shallow wide (1000)": shallowWide,
  "react: deep nested (100)": deepNested,
  "react: product list (50)": productList,
  "react: large table (500x10)": largeTable,
  // Data types
  "data: primitives": primitives,
  "data: large string (100KB)": largeString,
  "data: nested objects (20)": nestedObjects,
  "data: large array (10K)": largeArray,
  "data: Map & Set": mapAndSet,
  "data: Date/BigInt/Symbol": specialTypes,
  "data: typed arrays": typedArrays,
  "data: mixed payload": mixedPayload,
};
