export const RENDER_TYPE = {
  Unknown: "unknown",
  RSC: "rsc",
  Remote: "remote",
  HTML: "html",
};

export function createRenderContext(httpContext) {
  const { pathname } = httpContext.url;

  const match = pathname.match(
    /(@(?<outlet>[^.]+)\.)?(?<type>rsc|remote)\.x-component$/
  );

  const context = {
    type: RENDER_TYPE.Unknown,
    outlet: null,
  };
  if (!match) {
    context.type = httpContext.request.headers
      .get("accept")
      ?.includes("text/html")
      ? RENDER_TYPE.HTML
      : RENDER_TYPE.Unknown;
  } else {
    const { outlet, type } = match.groups;
    context.type = RENDER_TYPE.RSC;
    context.outlet = outlet ?? null;
    context.remote = type === RENDER_TYPE.Remote;

    httpContext.url.pathname = pathname.replace(match[0], "");
  }

  return {
    ...context,
    url: httpContext.url,
    flags: {
      isRSC: context.type === RENDER_TYPE.RSC,
      isHTML: context.type === RENDER_TYPE.HTML,
      isRemote: context.remote ?? false,
    },
  };
}
