/**
 * Parser for the `"use live"` directive (and its modifiers).
 *
 * Mirrors the shape of `parseClientDirective` (`use client[; modifier...]`).
 * Supported forms:
 *
 *   "use live"
 *   "use live; transport=sse"
 *   "use live; transport=socketio"
 *   "use live; transport=ws"
 *
 * Unknown modifiers/keys are tolerated for forward compatibility but
 * surfaced in the parsed result so callers may reject them.
 *
 * @typedef {Object} ParsedLiveDirective
 *   @property {boolean} isLive
 *   @property {import("./transport-registry.mjs").TransportName | undefined} transport
 *   @property {Record<string, string | true>} modifiers
 *   @property {string[]} unknownKeys
 */

import { CONCRETE_TRANSPORTS } from "./transport-registry.mjs";

const KNOWN_KEYS = new Set(["transport"]);

/**
 * Parse a single directive string. Returns `{ isLive: false }` for any
 * directive that isn't a `"use live"` form.
 *
 * @param {string} directive
 * @returns {ParsedLiveDirective}
 */
export function parseLiveDirectiveString(directive) {
  const empty = {
    isLive: false,
    transport: undefined,
    modifiers: {},
    unknownKeys: [],
  };
  if (typeof directive !== "string") return empty;
  const trimmed = directive.trim();
  if (!/^use\s+live\b/.test(trimmed)) return empty;

  const segments = trimmed
    .split(";")
    .slice(1)
    .map((s) => s.trim())
    .filter(Boolean);

  /** @type {Record<string, string | true>} */
  const modifiers = {};
  /** @type {string[]} */
  const unknownKeys = [];
  /** @type {import("./transport-registry.mjs").TransportName | undefined} */
  let transport;

  for (const seg of segments) {
    const eq = seg.indexOf("=");
    let key;
    /** @type {string | true} */
    let value;
    if (eq === -1) {
      key = seg;
      value = true;
    } else {
      key = seg.slice(0, eq).trim();
      value = seg.slice(eq + 1).trim();
    }
    if (!key) continue;
    modifiers[key] = value;

    if (key === "transport" && typeof value === "string") {
      if (
        value === "auto" ||
        CONCRETE_TRANSPORTS.includes(/** @type any */ (value))
      ) {
        transport = /** @type any */ (value);
      } else {
        unknownKeys.push(`transport:${value}`);
      }
    } else if (!KNOWN_KEYS.has(key)) {
      unknownKeys.push(key);
    }
  }

  return {
    isLive: true,
    transport,
    modifiers,
    unknownKeys,
  };
}

/**
 * Parse all top-level directives from an AST and pick the first that's
 * a `"use live"` form. Returns `null` when no live directive is present.
 *
 * @param {string[]} directives
 * @returns {ParsedLiveDirective | null}
 */
export function parseLiveDirectiveList(directives) {
  if (!Array.isArray(directives)) return null;
  for (const d of directives) {
    const parsed = parseLiveDirectiveString(d);
    if (parsed.isLive) return parsed;
  }
  return null;
}
