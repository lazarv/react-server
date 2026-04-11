import { applyParsers } from "@lazarv/react-server/lib/apply-parsers.mjs";
import { describe, expect, it } from "vitest";

describe("applyParsers", () => {
  it("returns raw when parsers is null or undefined", () => {
    const raw = { id: "42" };
    expect(applyParsers(raw, null)).toBe(raw);
    expect(applyParsers(raw, undefined)).toBe(raw);
  });

  it("returns raw when raw is null or undefined", () => {
    expect(applyParsers(null, { id: Number })).toBeNull();
    expect(applyParsers(undefined, { id: Number })).toBeUndefined();
  });

  it("applies Number constructor to coerce strings", () => {
    expect(applyParsers({ id: "42", name: "alice" }, { id: Number })).toEqual({
      id: 42,
      name: "alice",
    });
  });

  it("applies String constructor (identity for strings)", () => {
    expect(applyParsers({ slug: "hello" }, { slug: String })).toEqual({
      slug: "hello",
    });
  });

  it("applies Boolean constructor", () => {
    expect(applyParsers({ active: "true" }, { active: Boolean })).toEqual({
      active: true,
    });
    // Boolean("") is false, Boolean("false") is true — matches JS semantics
    expect(applyParsers({ active: "" }, { active: Boolean })).toEqual({
      active: false,
    });
  });

  it("applies custom parser functions", () => {
    const parseTab = (v) =>
      ["content", "comments", "related"].includes(v) ? v : "content";
    expect(
      applyParsers({ tab: "comments", q: "hello" }, { tab: parseTab })
    ).toEqual({ tab: "comments", q: "hello" });
    expect(applyParsers({ tab: "invalid" }, { tab: parseTab })).toEqual({
      tab: "content",
    });
  });

  it("applies multiple parsers to different keys", () => {
    expect(
      applyParsers(
        { id: "42", page: "3", name: "alice" },
        { id: Number, page: Number }
      )
    ).toEqual({ id: 42, page: 3, name: "alice" });
  });

  it("does not modify the original raw object", () => {
    const raw = { id: "42" };
    const result = applyParsers(raw, { id: Number });
    expect(result).not.toBe(raw);
    expect(raw.id).toBe("42");
    expect(result.id).toBe(42);
  });

  it("ignores parsers for keys not present in raw", () => {
    expect(
      applyParsers({ name: "alice" }, { id: Number, name: String })
    ).toEqual({ name: "alice" });
  });

  it("ignores non-function parser values", () => {
    expect(applyParsers({ id: "42" }, { id: "not a function" })).toEqual({
      id: "42",
    });
  });
});
