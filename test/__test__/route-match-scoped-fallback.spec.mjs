import { match } from "@lazarv/react-server/lib/route-match.mjs";
import { describe, expect, it } from "vitest";

describe("match — scoped fallback routes", () => {
  // Global fallback "*"
  it('matches any path with "*"', () => {
    expect(match("*", "/")).toEqual({});
    expect(match("*", "/anything")).toEqual({});
    expect(match("*", "/deep/nested/path")).toEqual({});
  });

  it('matches any path with "/*"', () => {
    expect(match("/*", "/")).toEqual({});
    expect(match("/*", "/anything")).toEqual({});
  });

  // Scoped fallback "/prefix/*"
  it("matches paths under the scoped prefix", () => {
    expect(match("/user/*", "/user/abc")).toEqual({});
    expect(match("/user/*", "/user/abc/xyz")).toEqual({});
    expect(match("/user/*", "/user/123")).toEqual({});
  });

  it("does not match paths outside the scoped prefix", () => {
    expect(match("/user/*", "/")).toBeNull();
    expect(match("/user/*", "/about")).toBeNull();
    expect(match("/user/*", "/users/123")).toBeNull();
    expect(match("/user/*", "/userprofile")).toBeNull();
  });

  it("matches the bare prefix path as well", () => {
    // /user/* matches /user (prefix segments match exactly)
    expect(match("/user/*", "/user")).toEqual({});
  });

  it("handles deeply nested scoped fallbacks", () => {
    expect(match("/api/v2/*", "/api/v2/users")).toEqual({});
    expect(match("/api/v2/*", "/api/v2/users/123/posts")).toEqual({});
    expect(match("/api/v2/*", "/api/v1/users")).toBeNull();
    expect(match("/api/v2/*", "/api")).toBeNull();
  });
});

describe("match — exact option", () => {
  it("rejects paths with extra segments when exact is true", () => {
    expect(match("/users", "/users/123", { exact: true })).toBeNull();
    expect(match("/users", "/users", { exact: true })).toEqual({});
  });

  it("allows sub-paths when exact is false (prefix match)", () => {
    expect(match("/users", "/users/123")).toEqual({});
    expect(match("/users", "/users/123/posts")).toEqual({});
  });
});

describe("match — matchers option", () => {
  it("accepts when matcher returns true", () => {
    const result = match("/user/[id=numeric]", "/user/42", {
      matchers: { numeric: (v) => /^\d+$/.test(v) },
    });
    expect(result).toEqual({ id: "42" });
  });

  it("rejects when matcher returns false", () => {
    const result = match("/user/[id=numeric]", "/user/abc", {
      matchers: { numeric: (v) => /^\d+$/.test(v) },
    });
    expect(result).toBeNull();
  });
});
