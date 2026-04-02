import { buildHref } from "@lazarv/react-server/lib/build-href.mjs";
import { describe, expect, it } from "vitest";

describe("buildHref", () => {
  it("returns / for falsy path", () => {
    expect(buildHref(null)).toBe("/");
    expect(buildHref(undefined)).toBe("/");
    expect(buildHref("")).toBe("/");
  });

  it("returns the path as-is when no params needed", () => {
    expect(buildHref("/")).toBe("/");
    expect(buildHref("/about")).toBe("/about");
    expect(buildHref("/users/list")).toBe("/users/list");
  });

  it("interpolates a single param", () => {
    expect(buildHref("/user/[id]", { id: "42" })).toBe("/user/42");
  });

  it("interpolates multiple params", () => {
    expect(
      buildHref("/user/[id]/post/[postId]", { id: "5", postId: "99" })
    ).toBe("/user/5/post/99");
  });

  it("handles catch-all params as arrays", () => {
    expect(buildHref("/files/[...path]", { path: ["a", "b", "c"] })).toBe(
      "/files/a/b/c"
    );
  });

  it("handles catch-all with single segment", () => {
    expect(buildHref("/docs/[...slug]", { slug: ["intro"] })).toBe(
      "/docs/intro"
    );
  });

  it("handles catch-all with empty array", () => {
    expect(buildHref("/docs/[...slug]", { slug: [] })).toBe("/docs/");
  });

  it("URI-encodes param values", () => {
    expect(buildHref("/search/[q]", { q: "hello world" })).toBe(
      "/search/hello%20world"
    );
  });

  it("URI-encodes catch-all segments individually", () => {
    expect(buildHref("/path/[...parts]", { parts: ["a b", "c/d"] })).toBe(
      "/path/a%20b/c%2Fd"
    );
  });

  it("leaves placeholder when param is missing", () => {
    expect(buildHref("/user/[id]", {})).toBe("/user/[id]");
    expect(buildHref("/user/[id]")).toBe("/user/[id]");
  });

  it("converts non-string values to strings", () => {
    expect(buildHref("/user/[id]", { id: 42 })).toBe("/user/42");
    expect(buildHref("/page/[num]", { num: 0 })).toBe("/page/0");
  });

  it("handles null/undefined param values by keeping the placeholder", () => {
    expect(buildHref("/user/[id]", { id: null })).toBe("/user/[id]");
    expect(buildHref("/user/[id]", { id: undefined })).toBe("/user/[id]");
  });
});
