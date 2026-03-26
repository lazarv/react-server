// Inject captured scope variables as destructured props for client components.
function injectCapturedParams(fnSource, targetFn, capturedVars) {
  const capturedList = capturedVars.join(", ");

  if (targetFn.params.length === 0) {
    // () → ({ x, y })
    const openParen = fnSource.indexOf("(");
    const closeParen = fnSource.indexOf(")", openParen);
    if (openParen !== -1 && closeParen !== -1) {
      fnSource =
        fnSource.slice(0, openParen + 1) +
        "{ " +
        capturedList +
        " }" +
        fnSource.slice(closeParen);
    }
  } else if (targetFn.params.length === 1) {
    const param = targetFn.params[0];
    const relStart = param.start - targetFn.start;
    const relEnd = param.end - targetFn.start;
    if (param.type === "Identifier") {
      // (props) → ({ x, ...props })
      fnSource =
        fnSource.slice(0, relStart) +
        "{ " +
        capturedList +
        ", ..." +
        param.name +
        " }" +
        fnSource.slice(relEnd);
    } else if (param.type === "ObjectPattern") {
      // ({ a }) → ({ x, a })
      fnSource =
        fnSource.slice(0, relStart + 1) +
        " " +
        capturedList +
        "," +
        fnSource.slice(relStart + 1);
    }
  }

  return fnSource;
}

export const useClientInlineConfig = {
  directive: "use client",
  queryKey: "use-client-inline",
  skipIfModuleDirective: ["use client"],
  injectCapturedParams,
  buildCallSiteReplacement(importName, inlineId, capturedVars) {
    if (capturedVars.length === 0) return null; // use default (inline import)
    const capturedProps = capturedVars.join(", ");
    return {
      replacement: `(__props) => __useClientCreateElement(${importName}, { ...__props, ${capturedProps} })`,
      prependImport: `import ${importName} from "${inlineId}";`,
    };
  },
  getPrependImports() {
    return [
      'import { createElement as __useClientCreateElement } from "react";',
    ];
  },
};
