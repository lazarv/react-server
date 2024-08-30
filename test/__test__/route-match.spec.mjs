import { useMatch } from "@lazarv/react-server/router";
import { useUrl } from "@lazarv/react-server/server/request.mjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the useUrl function
vi.mock("@lazarv/react-server/server/request.mjs", () => ({
  useUrl: vi.fn(),
}));

describe("useMatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const testCases = [
    // Static routes
    { path: "/users", url: "/users", expected: {} },
    { path: "/users/profile", url: "/users/profile", expected: {} },
    { path: "/users/profile", url: "/users", expected: null },

    // Exact route
    { path: "/users", url: "/users", expected: {}, options: { exact: true } },
    {
      path: "/users",
      url: "/users/profile",
      expected: null,
      options: { exact: true },
    },

    // Single parameter
    { path: "/users/[id]", url: "/users/123", expected: { id: "123" } },
    { path: "/users/[id]", url: "/users", expected: null },

    // Optional parameter
    { path: "/users/[[id]]", url: "/users/123", expected: { id: "123" } },
    { path: "/users/[[id]]", url: "/users", expected: {} },

    // Multiple parameters
    {
      path: "/users/[id]/posts/[postId]",
      url: "/users/123/posts/456",
      expected: { id: "123", postId: "456" },
    },
    {
      path: "/users/[id]/posts/[postId]",
      url: "/users/123/posts",
      expected: null,
    },

    // Catch-all
    {
      path: "/docs/[...slug]",
      url: "/docs/a/b/c",
      expected: { slug: ["a", "b", "c"] },
    },
    { path: "/docs/[...slug]", url: "/docs", expected: null },

    // Optional catch-all
    {
      path: "/docs/[[...slug]]",
      url: "/docs/a/b/c",
      expected: { slug: ["a", "b", "c"] },
    },
    { path: "/docs/[[...slug]]", url: "/docs", expected: { slug: [] } },

    // Escaped brackets
    { path: "/users/{[id]}", url: "/users/[id]", expected: {} },
    { path: "/users/{[id]}", url: "/users/123", expected: null },

    // Escaped dots
    { path: "/users/{...more}", url: "/users/...more", expected: {} },

    // Mixed static and dynamic segments
    {
      path: "/users/[id]-[name]",
      url: "/users/123-john",
      expected: { id: "123", name: "john" },
    },
    {
      path: "/posts/[year]-[month]-[day]",
      url: "/posts/2023-05-15",
      expected: { year: "2023", month: "05", day: "15" },
      options: { exact: true },
    },

    // Complex patterns
    {
      path: "/[category]/[[subcategory]]/items/[id]-[slug]",
      url: "/electronics/smartphones/items/123-iphone-12",
      expected: {
        category: "electronics",
        subcategory: "smartphones",
        id: "123",
        slug: "iphone-12",
      },
    },
    {
      path: "/[category]/[[subcategory]]/items/[id]-[slug]",
      url: "/electronics/items/123-laptop",
      expected: { category: "electronics", id: "123", slug: "laptop" },
    },
    {
      path: "/[category]/[[subcategory1]]/[[subcategory2]]/items/[id]-[slug]",
      url: "/electronics/items/123-laptop",
      expected: { category: "electronics", id: "123", slug: "laptop" },
    },
    {
      path: "/[category]/[[subcategory1]]/[[subcategory2]]/items/[id]-[slug]",
      url: "/electronics/subcategory1/items/123-laptop",
      expected: {
        category: "electronics",
        subcategory1: "subcategory1",
        id: "123",
        slug: "laptop",
      },
    },
    {
      path: "/[category]/[[subcategory1]]/[[subcategory2]]/items/[id]-[slug]",
      url: "/electronics/subcategory1/subcategory2/items/123-laptop",
      expected: {
        category: "electronics",
        subcategory1: "subcategory1",
        subcategory2: "subcategory2",
        id: "123",
        slug: "laptop",
      },
    },
    {
      path: "/[category]/[[subcategory1]]/[[subcategory2=category]]/items/[id]-[slug]",
      url: "/electronics/subcategory1/items/123-laptop",
      expected: {
        category: "electronics",
        subcategory1: "subcategory1",
        id: "123",
        slug: "laptop",
      },
      options: { matchers: { category: (value) => value === "category" } },
    },
    {
      path: "/[category]/[[subcategory1]]/[[subcategory2=category]]/items/[id]-[slug]",
      url: "/electronics/subcategory1/category/items/123-laptop",
      expected: {
        category: "electronics",
        subcategory1: "subcategory1",
        subcategory2: "category",
        id: "123",
        slug: "laptop",
      },
      options: { matchers: { category: (value) => value === "category" } },
    },
    {
      path: "/[category]/[[subcategory1]]/[[subcategory2=category]]/items/[id]-[slug]",
      url: "/electronics/subcategory1/subcategory2/items/123-laptop",
      expected: null,
      options: { matchers: { category: (value) => value === "category" } },
    },

    // Edge cases
    { path: "/", url: "/", expected: {} },
    { path: "/[[...all]]", url: "/", expected: { all: [] } },
    {
      path: "/[[...all]]",
      url: "/any/path/here",
      expected: { all: ["any", "path", "here"] },
    },
    // Optional catch-all with additional segments
    { path: "/[[...slug]]/end", url: "/end", expected: { slug: [] } },
    {
      path: "/[[...slug]]/end",
      url: "/a/b/end",
      expected: { slug: ["a", "b"] },
    },
    {
      path: "/[[...slug]]/end",
      url: "/a/b/c/end",
      expected: { slug: ["a", "b", "c"] },
    },
    { path: "/[[...slug]]/end", url: "/a/b/c/d", expected: null },

    // More complex patterns with optional catch-all
    {
      path: "/[category]/[[...subcategories]]/items",
      url: "/electronics/items",
      expected: { category: "electronics", subcategories: [] },
    },
    {
      path: "/[category]/[[...subcategories]]/items",
      url: "/electronics/laptops/gaming/items",
      expected: {
        category: "electronics",
        subcategories: ["laptops", "gaming"],
      },
    },
    {
      path: "/[category]/[[...subcategories]]/items/[id]",
      url: "/electronics/laptops/gaming/items/123",
      expected: {
        category: "electronics",
        subcategories: ["laptops", "gaming"],
        id: "123",
      },
    },

    // Edge cases
    { path: "/[[...a]]/b/[[...c]]", url: "/b", expected: { a: [], c: [] } },
    {
      path: "/[[...a]]/b/[[...c]]",
      url: "/x/y/b",
      expected: { a: ["x", "y"], c: [] },
    },
    {
      path: "/[[...a]]/b/[[...c]]",
      url: "/x/y/b/z",
      expected: { a: ["x", "y"], c: ["z"] },
    },
    {
      path: "/[[...a]]/b/[[...c]]",
      url: "/b/z",
      expected: { a: [], c: ["z"] },
    },
    {
      path: "/[[lang]]/[category]/[...slug]",
      url: "/team",
      expected: null,
    },
  ];

  testCases.forEach(({ path, url, expected, options }) => {
    it(`should match ${path} against ${url}${options?.exact ? " (exact)" : ""}`, () => {
      useUrl.mockReturnValue({ pathname: url });
      const result = useMatch(path, options);
      expect(result).toEqual(expected);
    });
  });

  it("should return an empty object for fallback routes", () => {
    useUrl.mockReturnValue({ pathname: "/any/path" });
    const result = useMatch("*", { fallback: true });
    expect(result).toEqual({});
  });

  it("should return null for non-matching routes", () => {
    useUrl.mockReturnValue({ pathname: "/non/matching/path" });
    const result = useMatch("/specific/path");
    expect(result).toBeNull();
  });
});
