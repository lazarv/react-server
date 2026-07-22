import { parse } from "../utils/ast.mjs";

function getCalleeName(callee) {
  if (callee?.type === "Identifier") return callee.name;
  if (callee?.type === "SequenceExpression") {
    return getCalleeName(callee.expressions.at(-1));
  }
  if (callee?.type !== "MemberExpression") return null;
  return callee.property?.name ?? callee.property?.value ?? null;
}

async function hasServerReference(code, id, name) {
  const parseId = id.includes("?") ? id.slice(0, id.indexOf("?")) : id;
  const ast = await parse(code, parseId);
  return (
    ast?.body.some((node) => {
      const call = node.type === "ExpressionStatement" && node.expression;
      if (
        call?.type !== "CallExpression" ||
        getCalleeName(call.callee) !== "registerServerReference"
      ) {
        return false;
      }
      const moduleId = call.arguments?.[1];
      const exportName = call.arguments?.[2];
      return moduleId?.value === id && exportName?.value === name;
    }) ?? false
  );
}

export default function createServerReferenceValidator(environment) {
  return async function validateServerReference(id, name) {
    try {
      // transformRequest applies the complete Vite plugin pipeline to source
      // text without evaluating the target module. The final AST contains a
      // registerServerReference call only for transformed Server Functions.
      const transformed = await environment.transformRequest(id);
      if (!transformed) return false;
      return await hasServerReference(transformed.code, id, name);
    } catch {
      return false;
    }
  };
}
