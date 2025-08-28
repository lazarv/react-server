import { dirname, resolve } from "node:path";

import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";

function calculateOffset() {
  try {
    new Function("throw new Error(1)")();
  } catch (error) {
    const match = /:(\d+):\d+\)$/.exec(error.stack.split("\n")[1]);
    return match ? +match[1] - 1 : 0;
  }
}
function rewriteStacktrace(stack, moduleGraph) {
  const offset = calculateOffset();
  return stack
    .split("\n")
    .map((line) => {
      return line.replace(
        /^ {4}at (?:(\S.*?)\s\()?(.+?):(\d+)(?::(\d+))?\)?/,
        (input, varName, id, line, column) => {
          if (id.startsWith("file://")) {
            id = id.replace(/^\s*file:\/\//, "");
          }
          if (!id) return input;
          const mod = moduleGraph.getModuleById(id);
          const rawSourceMap = mod?.transformResult?.map;
          if (!rawSourceMap) {
            return input;
          }
          const traced = new TraceMap(rawSourceMap);
          const pos = originalPositionFor(traced, {
            line: Number(line) - offset,
            column: Number(column) - 1,
          });
          if (!pos.source) {
            return input;
          }
          const trimmedVarName = varName?.trim();
          const sourceFile = resolve(dirname(id), pos.source);
          const source = `${sourceFile}:${pos.line}:${pos.column + 1}`;
          if (!trimmedVarName || trimmedVarName === "eval")
            return `    at ${source}`;
          else return `    at ${trimmedVarName} (${source})`;
        }
      );
    })
    .join("\n");
}
function rebindErrorStacktrace(error, stacktrace) {
  const { configurable, writable } = Object.getOwnPropertyDescriptor(
    error,
    "stack"
  );
  if (configurable)
    Object.defineProperty(error, "stack", {
      value: stacktrace,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  else if (writable) error.stack = stacktrace;
}
const rewroteStacktraces = new WeakSet();
export function fixStacktrace(error, moduleGraph) {
  if (!error.stack) return;
  if (rewroteStacktraces.has(error)) return;
  const stacktrace = rewriteStacktrace(error.stack, moduleGraph);
  rebindErrorStacktrace(error, stacktrace);
  rewroteStacktraces.add(error);
}
