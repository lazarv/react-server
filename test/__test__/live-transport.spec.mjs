import { describe, expect, it } from "vitest";

import {
  parseLiveDirectiveString,
  parseLiveDirectiveList,
} from "@lazarv/react-server/lib/live/directive.mjs";
import {
  resolveTransportName,
  validateTransportName,
  CONCRETE_TRANSPORTS,
} from "@lazarv/react-server/lib/live/transport-registry.mjs";

// ═══════════════════════════════════════════════════════════════════════════
//  Directive parser — "use live" with optional modifiers
// ═══════════════════════════════════════════════════════════════════════════

describe("parseLiveDirectiveString", () => {
  it("recognizes a bare 'use live' directive", () => {
    const r = parseLiveDirectiveString("use live");
    expect(r.isLive).toBe(true);
    expect(r.transport).toBeUndefined();
    expect(r.modifiers).toEqual({});
    expect(r.unknownKeys).toEqual([]);
  });

  it("rejects directives that aren't 'use live'", () => {
    expect(parseLiveDirectiveString("use client").isLive).toBe(false);
    expect(parseLiveDirectiveString("use server").isLive).toBe(false);
    expect(parseLiveDirectiveString("").isLive).toBe(false);
    expect(parseLiveDirectiveString("liveuse").isLive).toBe(false);
    expect(parseLiveDirectiveString(null).isLive).toBe(false);
    expect(parseLiveDirectiveString(undefined).isLive).toBe(false);
  });

  it("parses transport=sse override", () => {
    const r = parseLiveDirectiveString("use live; transport=sse");
    expect(r.isLive).toBe(true);
    expect(r.transport).toBe("sse");
    expect(r.unknownKeys).toEqual([]);
  });

  it("parses transport=socketio override", () => {
    const r = parseLiveDirectiveString("use live; transport=socketio");
    expect(r.transport).toBe("socketio");
  });

  it("parses transport=ws override", () => {
    const r = parseLiveDirectiveString("use live; transport=ws");
    expect(r.transport).toBe("ws");
  });

  it("accepts transport=auto (resolved later)", () => {
    const r = parseLiveDirectiveString("use live; transport=auto");
    expect(r.transport).toBe("auto");
  });

  it("rejects an unknown transport value but keeps isLive=true", () => {
    const r = parseLiveDirectiveString("use live; transport=quic");
    expect(r.isLive).toBe(true);
    expect(r.transport).toBeUndefined();
    expect(r.unknownKeys).toContain("transport:quic");
  });

  it("tolerates extra whitespace", () => {
    const r = parseLiveDirectiveString("  use live ;  transport = sse  ");
    expect(r.isLive).toBe(true);
    expect(r.transport).toBe("sse");
  });

  it("captures unknown flag-style modifiers without rejecting", () => {
    const r = parseLiveDirectiveString("use live; broadcast");
    expect(r.isLive).toBe(true);
    expect(r.modifiers.broadcast).toBe(true);
    expect(r.unknownKeys).toContain("broadcast");
  });
});

describe("parseLiveDirectiveList", () => {
  it("returns the first 'use live' directive in a directive list", () => {
    const r = parseLiveDirectiveList(["use strict", "use live; transport=sse"]);
    expect(r?.transport).toBe("sse");
  });

  it("returns null when no live directive is present", () => {
    expect(parseLiveDirectiveList(["use strict", "use client"])).toBeNull();
    expect(parseLiveDirectiveList([])).toBeNull();
    expect(parseLiveDirectiveList(null)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Transport registry — name resolution
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveTransportName", () => {
  it("returns the input unchanged for concrete names", () => {
    for (const name of CONCRETE_TRANSPORTS) {
      expect(resolveTransportName(name)).toBe(name);
      expect(resolveTransportName(name, { edge: true })).toBe(name);
    }
  });

  it("resolves 'auto' to socketio on Node", () => {
    expect(resolveTransportName("auto")).toBe("socketio");
    expect(resolveTransportName("auto", { edge: false })).toBe("socketio");
  });

  it("resolves 'auto' to sse on edge builds", () => {
    expect(resolveTransportName("auto", { edge: true })).toBe("sse");
  });

  it("treats undefined as 'auto'", () => {
    expect(resolveTransportName(undefined)).toBe("socketio");
    expect(resolveTransportName(undefined, { edge: true })).toBe("sse");
  });

  it("throws on unknown transport names", () => {
    expect(() => resolveTransportName("h2push")).toThrowError(/Unknown live/);
  });
});

describe("validateTransportName", () => {
  it("accepts known names", () => {
    expect(validateTransportName("auto")).toBe("auto");
    for (const name of CONCRETE_TRANSPORTS) {
      expect(validateTransportName(name)).toBe(name);
    }
  });

  it("throws for unknown names", () => {
    expect(() => validateTransportName("polling")).toThrowError(/Unknown live/);
  });
});
