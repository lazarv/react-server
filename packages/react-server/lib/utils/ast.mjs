import { generate } from "astring";
import { parseAsync } from "oxc-parser";
import { SourceMapGenerator } from "source-map";

function computeLineOffsets(code) {
  const lineOffsets = [0];
  let offset = 0;
  let next;

  while ((next = code.indexOf("\n", offset)) !== -1) {
    lineOffsets.push(next + 1);
    offset = next + 1;
  }

  return lineOffsets;
}

function getLoc(offset, lineOffsets) {
  let low = 0;
  let high = lineOffsets.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const lineStart = lineOffsets[mid];
    const nextLineStart = lineOffsets[mid + 1] ?? Infinity;

    if (offset >= lineStart && offset < nextLineStart) {
      return {
        line: mid + 1,
        column: offset - lineStart,
      };
    } else if (offset < lineStart) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // fallback if something goes wrong
  return { line: 1, column: offset };
}

export function addLocation(ast, code) {
  const lines = computeLineOffsets(code);

  walk(ast, {
    enter(node) {
      node.loc = {
        start: getLoc(node.start, lines),
        end: getLoc(node.end, lines),
      };
    },
  });

  return ast;
}

export async function parse(code, id, options) {
  const { program: ast } = await parseAsync(id, code, {
    preserveParens: false,
    ...options,
  });

  if (ast.body.length === 0) {
    return null;
  }

  addLocation(ast, code);

  return ast;
}

function isNode(node) {
  return (
    node &&
    typeof node === "object" &&
    "type" in node &&
    typeof node.type === "string"
  );
}

export function walk(node, visitor, context = { visited: new Set() }) {
  if (context.visited.has(node)) {
    return;
  }
  context.visited.add(node);

  visitor.enter(node);

  let key;
  for (key in node) {
    const value = node[key];

    if (value && typeof value === "object") {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) {
          const item = value[i];
          if (isNode(item)) {
            walk(item, visitor, context);
          }
        }
      } else if (isNode(value)) {
        walk(value, visitor, context);
      }
    }
  }

  visitor.leave?.(node);
}

export function codegen(ast, id) {
  const map = new SourceMapGenerator({
    file: id,
  });
  const gen = generate(ast, {
    sourceMap: map,
  });

  return {
    code: gen,
    map: map.toJSON(),
  };
}
