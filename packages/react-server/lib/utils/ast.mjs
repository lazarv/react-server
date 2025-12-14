import { generate, GENERATOR } from "astring";
import { parse as oxcParse } from "oxc-parser";
import { SourceMapGenerator } from "source-map";

import { getEnv } from "../sys.mjs";

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
  const { program: ast } = await oxcParse(id, code, {
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

// Statement types that need sourcemap mappings at their start position.
// astring only emits mappings for identifiers and literals by default,
// which leaves gaps in the sourcemap for keywords like throw, if, return, etc.
const STATEMENT_TYPES = [
  "BreakStatement",
  "ContinueStatement",
  "DebuggerStatement",
  "DoWhileStatement",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "IfStatement",
  "LabeledStatement",
  "ReturnStatement",
  "SwitchStatement",
  "ThrowStatement",
  "TryStatement",
  "VariableDeclaration",
  "WhileStatement",
  "WithStatement",
];

// Custom generator that wraps statement handlers to emit a sourcemap mapping
// at the start of each statement, then delegates to the original astring handler.
const statementMappingGenerator = Object.assign({}, GENERATOR);
for (const type of STATEMENT_TYPES) {
  const original = GENERATOR[type];
  if (original) {
    statementMappingGenerator[type] = function (node, state) {
      // Emit an empty string with the node to create a mapping at this position
      state.write("", node);
      // Delegate to the original astring handler
      return original.call(this, node, state);
    };
  }
}

const generator = new Proxy(statementMappingGenerator, {
  get(target, prop) {
    if (!(prop in target)) {
      throw new Error(`Unknown AST node type: ${prop}`);
    }
    return target[prop];
  },
});

export function codegen(ast, id) {
  const map = new SourceMapGenerator({
    file: id,
  });
  const gen = generate(ast, {
    sourceMap: map,
    generator: getEnv("REACT_SERVER_AST_DEBUG")
      ? generator
      : statementMappingGenerator,
  });

  return {
    code: gen,
    map: map.toJSON(),
  };
}

export function toAST(obj) {
  if (typeof obj !== "object" || obj === null) {
    return { type: "Literal", value: obj };
  }

  if (Array.isArray(obj)) {
    return {
      type: "ArrayExpression",
      elements: obj.map((item) => toAST(item)),
    };
  }

  return {
    type: "ObjectExpression",
    properties: Object.entries(obj).map(([key, value]) => ({
      type: "Property",
      kind: "init",
      key: { type: "Identifier", name: key },
      value: toAST(value),
      computed: false,
      method: false,
      shorthand: false,
    })),
  };
}
