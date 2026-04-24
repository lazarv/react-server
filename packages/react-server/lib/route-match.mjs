const tokenCache = new Map();
const parseCache = new Map();

export function tokenize(path) {
  if (tokenCache.has(path)) {
    return tokenCache.get(path);
  }

  const tokens = [];
  let current = "";
  let inEscape = false;
  let inParam = false;
  let openBrackets = 0;
  let start;

  let pos = 0;
  for (const char of path) {
    if (char === "{" && !inEscape) {
      if (current) tokens.push({ type: "static", value: current });
      current = "{";
      inEscape = true;
    } else if (char === "}" && inEscape) {
      tokens.push({ type: "escaped", value: current + "}" });
      current = "";
      inEscape = false;
    } else if (char === "[" && !inEscape && !inParam) {
      if (current) tokens.push({ type: "static", value: current });
      current = "[";
      inParam = true;
      start = pos;
      openBrackets++;
    } else if (char === "[" && inParam) {
      current += char;
      openBrackets++;
    } else if (char === "]" && inParam) {
      openBrackets--;
      if (openBrackets === 0) {
        tokens.push({
          type: "param",
          value: current + "]",
          start,
          end: pos + 1,
        });
        current = "";
        inParam = false;
        start = null;
      } else {
        current += char;
      }
    } else if (char === "/" && !inEscape && !inParam) {
      if (current) tokens.push({ type: "static", value: current });
      tokens.push({ type: "separator" });
      current = "";
    } else {
      current += char;
    }
    pos++;
  }

  if (current) tokens.push({ type: "static", value: current });

  tokenCache.set(path, tokens);
  return tokens;
}

export function parse(path) {
  if (parseCache.has(path)) {
    return parseCache.get(path);
  }

  const tokens = tokenize(path);
  const segments = [];
  let currentSegment = [];

  for (const token of tokens) {
    if (token.type === "separator") {
      if (currentSegment.length) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    } else if (token.type === "escaped") {
      currentSegment.push({ type: "static", value: token.value.slice(1, -1) });
    } else if (token.type === "param") {
      const value = token.value.slice(1, -1);
      if (value.startsWith("...")) {
        const [param, matcher] = value.slice(3).split("=");
        currentSegment.push({
          type: "catchAll",
          param,
          matcher,
          start: token.start,
          end: token.end,
        });
      } else if (value.startsWith("[...") && value.endsWith("]")) {
        const [param, matcher] = value.slice(4, -1).split("=");
        currentSegment.push({
          type: "optionalCatchAll",
          param,
          matcher,
          start: token.start,
          end: token.end,
        });
      } else if (value.startsWith("[") && value.endsWith("]")) {
        const [param, matcher] = value.slice(1, -1).split("=");
        currentSegment.push({
          type: "optionalParam",
          param,
          matcher,
          start: token.start,
          end: token.end,
        });
      } else {
        const [param, matcher] = value.split("=");
        currentSegment.push({
          type: "param",
          param,
          matcher,
          start: token.start,
          end: token.end,
        });
      }
    } else if (token.type === "static") {
      currentSegment.push({ type: "static", value: token.value });
    }
  }

  if (currentSegment.length) {
    segments.push(currentSegment);
  }

  parseCache.set(path, segments);
  return segments;
}

export function match(route, path, options = {}) {
  if (route === "*" || route === "/*") {
    return {};
  }

  // Scoped fallback — "/user/*" matches any path starting with "/user/"
  if (route.endsWith("/*")) {
    const prefix = route.slice(0, -2); // "/user/*" → "/user"
    const prefixSegments = prefix.split("/").filter(Boolean);
    const pathSegments = path.split("/").filter(Boolean);
    if (pathSegments.length < prefixSegments.length) return null;
    for (let i = 0; i < prefixSegments.length; i++) {
      if (pathSegments[i] !== prefixSegments[i]) return null;
    }
    return {};
  }

  const routeSegments = parse(route);
  const pathSegments = path.split("/").filter(Boolean);

  const params = {};
  let routeIndex = 0;
  let pathIndex = 0;
  let consumedOptionalParams = [];

  while (routeIndex < routeSegments.length) {
    const routeSegment = routeSegments[routeIndex];
    let pathSegment = pathSegments[pathIndex];
    let segmentMatch = true;
    let segmentParams = {};

    if (routeSegment.length > 1) {
      let currentPathIndex = 0;
      for (
        let segmentIndex = 0;
        segmentIndex < routeSegment.length;
        segmentIndex++
      ) {
        const part = routeSegment[segmentIndex];
        let nextPartIndex = segmentIndex + 1;
        let nextPart = routeSegment[nextPartIndex];
        while (nextPart?.type === "param") {
          nextPart = routeSegment[++nextPartIndex];
        }
        if (part.type === "static") {
          const pathValue = pathSegment.slice(
            currentPathIndex,
            currentPathIndex + part.value.length
          );
          if (pathValue !== part.value) {
            return null;
          }
          currentPathIndex += part.value.length;
        } else if (part.type === "param" || part.type === "optionalParam") {
          const nextPathIndex = nextPart
            ? (pathSegment?.indexOf(nextPart.value, currentPathIndex) ?? 0)
            : pathSegment.length;
          const paramValue =
            pathSegment?.slice(currentPathIndex, nextPathIndex) ?? "";
          if (!paramValue && part.type === "param") {
            return null;
          }
          if (
            part.matcher &&
            typeof options.matchers?.[part.matcher] === "function"
          ) {
            const matcher = options.matchers?.[part.matcher];
            if (!matcher(paramValue)) {
              if (part.type === "param") {
                return null;
              } else if (part.type === "optionalParam") {
                segmentMatch = false;
                continue;
              }
            }
          }
          segmentParams[part.param] = paramValue;
          currentPathIndex = nextPathIndex;
        }
      }
      pathIndex++;
    } else {
      for (const part of routeSegment) {
        if (part.type === "static") {
          if (pathSegment !== part.value) {
            segmentMatch = false;
            break;
          }
          pathIndex++;
        } else if (part.type === "param") {
          if (pathIndex >= pathSegments.length) {
            segmentMatch = false;
            break;
          }
          if (
            part.matcher &&
            typeof options.matchers?.[part.matcher] === "function"
          ) {
            const matcher = options.matchers?.[part.matcher];
            if (!matcher(pathSegments[pathIndex])) {
              segmentMatch = false;
              break;
            }
          }
          segmentParams[part.param] = pathSegments[pathIndex];
          pathIndex++;
        } else if (part.type === "optionalParam") {
          if (pathIndex < pathSegments.length) {
            if (
              !part.matcher ||
              (typeof options.matchers?.[part.matcher] === "function" &&
                options.matchers?.[part.matcher](pathSegments[pathIndex]))
            ) {
              consumedOptionalParams.push(part);
              segmentParams[part.param] = pathSegments[pathIndex];
              pathIndex++;
            }
          }
        } else if (
          part.type === "catchAll" ||
          part.type === "optionalCatchAll"
        ) {
          const catchAllStart = pathIndex;
          const remainingPath = pathSegments.slice(pathIndex);
          if (routeIndex < routeSegments.length - 1) {
            const nextStaticSegment = routeSegments
              .slice(routeIndex + 1)
              .find((seg) => seg.some((p) => p.type === "static"));
            if (nextStaticSegment) {
              const staticValue = nextStaticSegment.find(
                (p) => p.type === "static"
              ).value;
              const staticIndex = remainingPath.indexOf(staticValue);
              if (staticIndex !== -1) {
                segmentParams[part.param] = remainingPath.slice(0, staticIndex);
                pathIndex += staticIndex;
              } else if (part.type === "catchAll") {
                segmentMatch = false;
                break;
              }
            } else {
              segmentParams[part.param] = remainingPath;
              pathIndex = pathSegments.length;
            }
          } else {
            segmentParams[part.param] = remainingPath;
            pathIndex = pathSegments.length;
          }

          if (
            part.type === "catchAll" &&
            segmentParams[part.param].length === 0
          ) {
            segmentMatch = false;
            break;
          }

          if (
            part.matcher &&
            typeof options.matchers?.[part.matcher] === "function" &&
            Array.isArray(segmentParams[part.param]) &&
            segmentParams[part.param].length > 0 &&
            !options.matchers[part.matcher](segmentParams[part.param])
          ) {
            if (part.type === "catchAll") {
              segmentMatch = false;
              break;
            }
            // optionalCatchAll rejection: rewind and treat as absent
            segmentParams[part.param] = [];
            pathIndex = catchAllStart;
          }
        }
      }
    }

    if (segmentMatch) {
      Object.assign(params, segmentParams);
      routeIndex++;
    } else {
      if (
        routeSegment.some((part) => part.type === "static") &&
        consumedOptionalParams.length > 0
      ) {
        pathIndex--;
        const part = consumedOptionalParams.pop();
        if (part.type === "optionalParam") {
          params[part.param] = undefined;
        }
        continue;
      }
      const allOptional = routeSegment.every(
        (part) =>
          part.type === "optionalParam" || part.type === "optionalCatchAll"
      );
      if (allOptional) {
        routeSegments.forEach((part) => {
          params[part.param] =
            part.type === "optionalCatchAll" ? [] : undefined;
        });
        routeIndex++;
      } else {
        return null;
      }
    }
  }

  if (options.exact && pathIndex < pathSegments.length) {
    return null;
  }

  return params;
}
