// Inject captured scope variables as prepended function parameters for server functions.
function injectCapturedParams(fnSource, targetFn, capturedVars) {
  const capturedList = capturedVars.join(", ");

  if (targetFn.params.length === 0) {
    // () → (x, y)
    const openParen = fnSource.indexOf("(");
    const closeParen = fnSource.indexOf(")", openParen);
    if (openParen !== -1 && closeParen !== -1) {
      fnSource =
        fnSource.slice(0, openParen + 1) +
        capturedList +
        fnSource.slice(closeParen);
    }
  } else {
    // (data) → (x, y, data)
    const firstParam = targetFn.params[0];
    const relStart = firstParam.start - targetFn.start;
    fnSource =
      fnSource.slice(0, relStart) +
      capturedList +
      ", " +
      fnSource.slice(relStart);
  }

  return fnSource;
}

export const useServerInlineConfig = {
  directive: "use server",
  queryKey: "use-server-inline",
  // Do NOT skip "use client" modules — we want "use server" inside "use client" to work
  skipIfModuleDirective: null,
  injectCapturedParams,
  buildCallSiteReplacement(importName, inlineId, capturedVars) {
    const prependImport = `import "${inlineId}";\nimport ${importName} from "${inlineId}";`;

    if (capturedVars.length === 0) {
      return {
        replacement: importName,
        prependImport,
      };
    }

    const capturedArgs = capturedVars.join(", ");
    return {
      replacement: `${importName}.bind(null, ${capturedArgs})`,
      prependImport,
    };
  },
};
