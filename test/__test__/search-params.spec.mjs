import {
  applySearchObject,
  resolveSearchUpdater,
  searchParamsToObject,
  validateSearchParams,
} from "@lazarv/react-server/lib/search-params.mjs";
import { describe, expect, it } from "vitest";

// ── searchParamsToObject ──

describe("searchParamsToObject", () => {
  it("converts single-value keys to strings", () => {
    const sp = new URLSearchParams("sort=name&page=1");
    expect(searchParamsToObject(sp)).toEqual({ sort: "name", page: "1" });
  });

  it("converts multi-value keys to arrays", () => {
    const sp = new URLSearchParams("tag=a&tag=b&tag=c");
    expect(searchParamsToObject(sp)).toEqual({ tag: ["a", "b", "c"] });
  });

  it("returns empty object for empty params", () => {
    expect(searchParamsToObject(new URLSearchParams())).toEqual({});
  });

  it("handles mixed single and multi-value keys", () => {
    const sp = new URLSearchParams("q=hello&tag=a&tag=b&page=1");
    expect(searchParamsToObject(sp)).toEqual({
      q: "hello",
      tag: ["a", "b"],
      page: "1",
    });
  });
});

// ── validateSearchParams ──

describe("validateSearchParams", () => {
  it("returns raw when route is null", () => {
    const raw = { sort: "name", page: "1" };
    expect(validateSearchParams(raw, null)).toBe(raw);
  });

  it("returns raw when route has no validate or parse", () => {
    const raw = { sort: "name" };
    expect(validateSearchParams(raw, {})).toBe(raw);
  });

  it("applies validate.search.safeParse when available", () => {
    const route = {
      validate: {
        search: {
          safeParse: (data) => ({
            success: true,
            data: {
              sort: data.sort || "default",
              page: Number(data.page) || 1,
            },
          }),
        },
      },
    };
    expect(validateSearchParams({ sort: "price", page: "3" }, route)).toEqual({
      sort: "price",
      page: 3,
    });
  });

  it("returns raw when safeParse fails", () => {
    const raw = { bad: "data" };
    const route = {
      validate: {
        search: {
          safeParse: () => ({ success: false }),
        },
      },
    };
    expect(validateSearchParams(raw, route)).toBe(raw);
  });

  it("applies parse.search functions", () => {
    const route = {
      parse: {
        search: {
          page: Number,
          active: (v) => v === "true",
        },
      },
    };
    expect(
      validateSearchParams({ page: "5", active: "true", q: "hello" }, route)
    ).toEqual({ page: 5, active: true, q: "hello" });
  });

  it("prefers validate over parse when both are present", () => {
    const route = {
      validate: {
        search: {
          safeParse: () => ({ success: true, data: { validated: true } }),
        },
      },
      parse: {
        search: { page: Number },
      },
    };
    expect(validateSearchParams({ page: "1" }, route)).toEqual({
      validated: true,
    });
  });
});

// ── resolveSearchUpdater ──

describe("resolveSearchUpdater", () => {
  it("returns the object as-is when search is not a function", () => {
    const search = { sort: "price", page: 2 };
    const result = resolveSearchUpdater(search, new URLSearchParams());
    expect(result).toBe(search);
  });

  it("calls the function with current params as prev", () => {
    const current = new URLSearchParams("sort=name&page=1");
    const updater = (prev) => ({ ...prev, page: Number(prev.page) + 1 });
    const result = resolveSearchUpdater(updater, current);
    expect(result).toEqual({ sort: "name", page: 2 });
  });

  it("applies decodeSearch before passing to updater", () => {
    const current = new URLSearchParams("price=50-150");
    const decode = (sp) => {
      const result = new URLSearchParams(sp);
      const price = result.get("price");
      if (price) {
        const [min, max] = price.split("-");
        result.delete("price");
        result.set("min_price", min);
        result.set("max_price", max);
      }
      return result;
    };
    const updater = (prev) => prev;
    const result = resolveSearchUpdater(updater, current, decode);
    expect(result).toEqual({ min_price: "50", max_price: "150" });
  });

  it("applies route validation to decoded params before passing to updater", () => {
    const current = new URLSearchParams("page=2&sort=name");
    const route = {
      validate: {
        search: {
          safeParse: (data) => ({
            success: true,
            data: { page: Number(data.page), sort: data.sort },
          }),
        },
      },
    };
    const updater = (prev) => ({ ...prev, page: prev.page + 1 });
    const result = resolveSearchUpdater(updater, current, null, route);
    expect(result).toEqual({ page: 3, sort: "name" });
  });

  it("chains decode and validate before passing to updater", () => {
    const current = new URLSearchParams("price=0-100&sort=name");
    const decode = (sp) => {
      const result = new URLSearchParams(sp);
      const price = result.get("price");
      if (price) {
        const [min, max] = price.split("-");
        result.delete("price");
        result.set("min_price", min);
        result.set("max_price", max);
      }
      return result;
    };
    const route = {
      validate: {
        search: {
          safeParse: (data) => ({
            success: true,
            data: {
              sort: data.sort || "name",
              min_price: Number(data.min_price) || 0,
              max_price: Number(data.max_price) || 10000,
            },
          }),
        },
      },
    };
    const updater = (prev) => ({
      ...prev,
      min_price: prev.min_price + 10,
    });
    const result = resolveSearchUpdater(updater, current, decode, route);
    expect(result).toEqual({ sort: "name", min_price: 10, max_price: 100 });
  });
});

// ── applySearchObject ──

describe("applySearchObject", () => {
  it("sets string values", () => {
    const target = new URLSearchParams();
    applySearchObject(target, { sort: "price", page: "2" });
    expect(target.get("sort")).toBe("price");
    expect(target.get("page")).toBe("2");
  });

  it("converts non-string values to strings", () => {
    const target = new URLSearchParams();
    applySearchObject(target, { page: 3, active: true });
    expect(target.get("page")).toBe("3");
    expect(target.get("active")).toBe("true");
  });

  it("deletes keys with null values", () => {
    const target = new URLSearchParams("sort=name&page=1");
    applySearchObject(target, { sort: null });
    expect(target.has("sort")).toBe(false);
    expect(target.get("page")).toBe("1");
  });

  it("deletes keys with undefined values", () => {
    const target = new URLSearchParams("sort=name&page=1");
    applySearchObject(target, { sort: undefined });
    expect(target.has("sort")).toBe(false);
    expect(target.get("page")).toBe("1");
  });

  it("overwrites existing keys", () => {
    const target = new URLSearchParams("sort=name");
    applySearchObject(target, { sort: "price" });
    expect(target.get("sort")).toBe("price");
  });
});
