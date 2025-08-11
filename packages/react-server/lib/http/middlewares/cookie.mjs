import { parse as __cookieParse, serialize as __cookieSerialize } from "cookie";

// Generic runtime-agnostic cookie middleware.
// Responsibilities:
//  - Ensure ctx.cookie is a parsed object.
//  - Provide ctx.setCookie / ctx.deleteCookie helpers (seconds maxAge normalization).
//  - After downstream response, append Set-Cookie headers.
export function cookie(defaults) {
  return async function cookieMiddleware(ctx) {
    // Ensure parsed cookies
    if (!ctx.cookie) {
      const raw = ctx.request.headers.get("cookie") || "";
      ctx.cookie = __cookieParse(raw);
    }
    // Ensure Set-Cookie collection exists
    if (!ctx._setCookies) ctx._setCookies = [];

    // Base setter: prefer existing ctx.setCookie (from adapter) else fallback
    const baseSet = ctx.setCookie
      ? ctx.setCookie.bind(ctx)
      : function (name, value, options = {}) {
          const o = { ...options };
          if (o.maxAge != null) o.maxAge = Math.floor(o.maxAge / 1000);
          ctx._setCookies.push(__cookieSerialize(name, value, o));
        };

    // Wrap with defaults merge
    ctx.setCookie = function (name, value, options = {}) {
      const merged = { ...(defaults || {}), ...(options || {}) };
      return baseSet(name, value, merged);
    };

    ctx.deleteCookie = function (name, options = {}) {
      const merged = {
        ...(defaults || {}),
        ...(options || {}),
        expires: new Date(0),
      };
      return baseSet(name, "", merged);
    };

    const res = (await ctx.next()) || new Response(null, { status: 404 });
    if (res instanceof Response && ctx._setCookies?.length) {
      for (const c of ctx._setCookies) res.headers.append("set-cookie", c);
    }
    return res;
  };
}
