import { readFile } from "node:fs/promises";
import { parse, walk } from "../utils/ast.mjs";

// ── AST helpers ──────────────────────────────────────────────────────────────

// Collect all identifiers referenced inside a node
export function collectIdentifiers(node) {
  const ids = new Set();
  walk(node, {
    enter(n) {
      if (n.type === "Identifier" || n.type === "JSXIdentifier") {
        ids.add(n.name);
      }
    },
  });
  return ids;
}

// Collect declared names from a pattern node (handles destructuring)
export function collectDeclaredNames(pattern, set) {
  if (!pattern) return;
  if (pattern.type === "Identifier") {
    set.add(pattern.name);
  } else if (pattern.type === "ObjectPattern") {
    for (const prop of pattern.properties) {
      collectDeclaredNames(
        prop.type === "RestElement" ? prop.argument : prop.value,
        set
      );
    }
  } else if (pattern.type === "ArrayPattern") {
    for (const el of pattern.elements) {
      if (el) collectDeclaredNames(el, set);
    }
  } else if (pattern.type === "RestElement") {
    collectDeclaredNames(pattern.argument, set);
  } else if (pattern.type === "AssignmentPattern") {
    collectDeclaredNames(pattern.left, set);
  }
}

// Find variables captured from parent function scopes
// (not imports, not top-level declarations, not the function's own locals)
export function findCapturedVars(ast, targetFn) {
  const importBindings = new Set();
  for (const node of ast.body) {
    if (node.type === "ImportDeclaration") {
      for (const s of node.specifiers) {
        importBindings.add(s.local.name);
      }
    }
  }

  const topLevelNames = new Set();
  for (const node of ast.body) {
    const decl =
      node.type === "ExportDefaultDeclaration" ||
      node.type === "ExportNamedDeclaration"
        ? node.declaration
        : node;
    if (!decl) continue;
    if (decl.type === "VariableDeclaration") {
      for (const d of decl.declarations) {
        if (d.id) collectDeclaredNames(d.id, topLevelNames);
      }
    } else if (
      (decl.type === "FunctionDeclaration" ||
        decl.type === "ClassDeclaration") &&
      decl.id?.name
    ) {
      topLevelNames.add(decl.id.name);
    }
  }

  const scopeStack = [];
  let result = [];
  let found = false;

  walk(ast, {
    enter(node) {
      if (found) return;
      const isFn =
        node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression";
      if (!isFn) return;

      if (node === targetFn) {
        const usedIds = collectIdentifiers(targetFn);
        // Exclude the function's own declaration name — it's not a captured variable
        if (targetFn.type === "FunctionDeclaration" && targetFn.id?.name) {
          usedIds.delete(targetFn.id.name);
        }
        const scopeVars = new Set();
        for (const scope of scopeStack) {
          for (const name of scope) scopeVars.add(name);
        }
        result = [...scopeVars].filter(
          (name) =>
            usedIds.has(name) &&
            !importBindings.has(name) &&
            !topLevelNames.has(name)
        );
        found = true;
        return;
      }

      const scope = new Set();
      for (const param of node.params || []) {
        collectDeclaredNames(param, scope);
      }
      for (const stmt of node.body?.body || []) {
        if (stmt.type === "VariableDeclaration") {
          for (const d of stmt.declarations) {
            if (d.id) collectDeclaredNames(d.id, scope);
          }
        } else if (
          (stmt.type === "FunctionDeclaration" ||
            stmt.type === "ClassDeclaration") &&
          stmt.id?.name
        ) {
          scope.add(stmt.id.name);
        }
      }
      scopeStack.push(scope);
    },
    leave(node) {
      if (found) return;
      const isFn =
        node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression";
      if (isFn && node !== targetFn) {
        scopeStack.pop();
      }
    },
  });

  return result;
}

// Find all functions that contain the given directive string
function findDirectiveFunctions(ast, directive) {
  const results = [];
  walk(ast, {
    enter(node) {
      const body =
        node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression"
          ? node.body?.body
          : null;
      if (!Array.isArray(body)) return;
      const hasDirective = body.some(
        (n) => n.type === "ExpressionStatement" && n.directive === directive
      );
      if (hasDirective) {
        results.push(node);
      }
    },
  });
  return results;
}

// Find only OUTERMOST directive functions across ALL directives.
// A function with "use server" nested inside a function with "use client"
// is NOT outermost — the "use client" wrapper is.
function findOutermostDirectiveFunctions(ast, directives) {
  // Collect all directive functions with their directive info
  const allFns = [];
  for (const directive of directives) {
    for (const fn of findDirectiveFunctions(ast, directive)) {
      allFns.push({ fn, directive });
    }
  }

  if (allFns.length === 0) return [];

  const allFnSet = new Set(allFns.map((f) => f.fn));

  // Filter out any function that is nested inside another directive function
  return allFns.filter(({ fn }) => {
    for (const other of allFnSet) {
      if (other === fn) continue;
      // Check if `fn` is contained within `other`
      if (fn.start >= other.start && fn.end <= other.end) {
        return false; // fn is nested inside other — not outermost
      }
    }
    return true;
  });
}

// Build the extracted module source for a single directive function
function buildExtractedModule(
  code,
  ast,
  targetFn,
  directive,
  capturedVars,
  injectCapturedParams,
  originalPath
) {
  const imports = [];
  for (const node of ast.body) {
    if (node.type === "ImportDeclaration") {
      imports.push({
        specifiers: node.specifiers.map((s) => ({
          localName: s.local.name,
        })),
        sourceText: code.slice(node.start, node.end),
      });
    }
  }

  const importBindings = new Map();
  for (const imp of imports) {
    for (const spec of imp.specifiers) {
      importBindings.set(spec.localName, imp);
    }
  }

  const topLevelDecls = new Map();
  for (const node of ast.body) {
    if (node.type === "VariableDeclaration") {
      for (const decl of node.declarations) {
        if (decl.id?.name) {
          topLevelDecls.set(decl.id.name, {
            sourceText: code.slice(node.start, node.end),
          });
        }
      }
    } else if (
      (node.type === "FunctionDeclaration" ||
        node.type === "ClassDeclaration") &&
      node.id?.name &&
      node !== targetFn
    ) {
      topLevelDecls.set(node.id.name, {
        sourceText: code.slice(node.start, node.end),
      });
    }
  }

  const usedIdentifiers = collectIdentifiers(targetFn);

  const usedImportSet = new Set();
  for (const [name, imp] of importBindings) {
    if (usedIdentifiers.has(name)) {
      usedImportSet.add(imp);
    }
  }

  const usedDeclNames = [];
  for (const [name] of topLevelDecls) {
    if (usedIdentifiers.has(name)) {
      usedDeclNames.push(name);
    }
  }

  // Get the function source, removing the directive statement
  let fnSource = code.slice(targetFn.start, targetFn.end);
  const body = targetFn.body?.body;
  const directiveNode = body?.find(
    (n) => n.type === "ExpressionStatement" && n.directive === directive
  );
  if (directiveNode) {
    const relStart = directiveNode.start - targetFn.start;
    const relEnd = directiveNode.end - targetFn.start;
    let endPos = relEnd;
    while (
      endPos < fnSource.length &&
      (fnSource[endPos] === "\n" || fnSource[endPos] === "\r")
    ) {
      endPos++;
    }
    fnSource = fnSource.slice(0, relStart) + fnSource.slice(endPos);
  }

  // Inject captured scope variables into the function signature
  if (capturedVars.length > 0 && injectCapturedParams) {
    fnSource = injectCapturedParams(fnSource, targetFn, capturedVars);
  }

  const importStatements = Array.from(usedImportSet)
    .map((imp) => imp.sourceText)
    .join("\n");

  // Import top-level declarations from the original module to preserve
  // shared module state (e.g. mutable variables) instead of copying them.
  const declImportStatement =
    usedDeclNames.length > 0
      ? `import { ${usedDeclNames.join(", ")} } from "${originalPath}";`
      : "";

  return [
    `"${directive}";`,
    "",
    importStatements,
    declImportStatement,
    importStatements || declImportStatement ? "" : null,
    `export default ${fnSource}`,
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

// ── Plugin factory ───────────────────────────────────────────────────────────

/**
 * Create a single Vite plugin that extracts ALL inline directive functions
 * ("use client", "use server", etc.) from outermost to innermost across
 * multiple transform passes.
 *
 * @param {Array<{
 *   directive: string,
 *   queryKey: string,
 *   skipIfModuleDirective?: string[],
 *   injectCapturedParams: function,
 *   buildCallSiteReplacement?: function,
 *   getPrependImports?: function,
 * }>} configs - One config per supported directive
 */
export default function useDirectiveInline(configs) {
  const moduleCache = new Map();
  let root = "";

  // Build lookup maps
  const configByDirective = new Map();
  const configByQueryKey = new Map();
  for (const cfg of configs) {
    configByDirective.set(cfg.directive, cfg);
    configByQueryKey.set(cfg.queryKey, cfg);
  }

  const allDirectives = configs.map((c) => c.directive);

  // Test whether an id contains any of our query keys
  function matchQueryKey(id) {
    // Return the config whose marker appears LAST in the id.
    // For nested extraction like file.jsx?use-client-inline=Counter&use-server-inline=increment
    // we must return the last segment (use-server-inline), not the first.
    let lastMatch = null;
    let lastPos = -1;
    for (const cfg of configs) {
      // Match both ?key= (first param) and &key= (chained param)
      for (const sep of ["?", "&"]) {
        const marker = `${sep}${cfg.queryKey}=`;
        const pos = id.indexOf(marker);
        if (pos !== -1 && pos > lastPos) {
          lastPos = pos;
          lastMatch = { cfg, marker };
        }
      }
    }
    return lastMatch;
  }

  return {
    name: "react-server:use-directive-inline",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
    },

    async resolveId(source, importer) {
      if (matchQueryKey(source)) return source;

      // Resolve relative imports from our extracted virtual modules.
      // Vite can't determine the correct directory for virtual module IDs
      // with query params, so we strip the query and re-resolve.
      if (
        importer &&
        matchQueryKey(importer) &&
        (source.startsWith("./") || source.startsWith("../"))
      ) {
        const cleanImporter = importer.slice(0, importer.indexOf("?"));
        return this.resolve(source, cleanImporter, { skipSelf: true });
      }
    },

    async load(id) {
      const match = matchQueryKey(id);
      if (!match) return;

      const cached = moduleCache.get(id);
      if (cached) return cached;
      const { cfg, marker } = match;
      const qIdx = id.indexOf(marker);
      const rawPath = id.slice(0, qIdx);
      const fnName = id.slice(qIdx + marker.length);

      // Strip ALL query params to get the real file path on disk
      const basePath = rawPath.includes("?")
        ? rawPath.slice(0, rawPath.indexOf("?"))
        : rawPath;
      const filePath = basePath.startsWith(root) ? basePath : root + basePath;
      const sourceCode = await readFile(filePath, "utf-8");
      const ast = await parse(sourceCode, filePath);
      if (!ast) return;

      const directiveFunctions = findDirectiveFunctions(ast, cfg.directive);

      let targetFn;
      if (fnName.startsWith("anonymous_")) {
        const index = parseInt(fnName.replace("anonymous_", ""), 10);
        const anonymousFunctions = directiveFunctions.filter(
          (fn) => !(fn.type === "FunctionDeclaration" && fn.id?.name)
        );
        targetFn = anonymousFunctions[index];
      } else {
        targetFn = directiveFunctions.find(
          (fn) => fn.type === "FunctionDeclaration" && fn.id?.name === fnName
        );
      }

      if (!targetFn) return;

      const capturedVars = findCapturedVars(ast, targetFn);
      const extractedCode = buildExtractedModule(
        sourceCode,
        ast,
        targetFn,
        cfg.directive,
        capturedVars,
        cfg.injectCapturedParams,
        rawPath
      );
      moduleCache.set(id, extractedCode);
      return extractedCode;
    },

    transform: {
      filter: {
        id: /\.m?[jt]sx?/,
      },
      async handler(code, id) {
        // Quick check: does the code contain ANY of the directive strings?
        if (!allDirectives.some((d) => code.includes(d))) return null;

        // Strip query params so the parser can determine file type from extension
        const parseId = id.includes("?") ? id.slice(0, id.indexOf("?")) : id;
        const ast = await parse(code, parseId);
        if (!ast) return null;

        // Collect module-level directives
        const moduleDirectives = ast.body
          .filter((node) => node.type === "ExpressionStatement")
          .map(({ directive }) => directive);

        // If this is one of our extracted modules, determine which directive
        // it was extracted for so we don't re-extract the same directive.
        const ownMatch = matchQueryKey(id);
        const ownDirective = ownMatch ? ownMatch.cfg.directive : null;

        // Find only outermost directive functions across ALL directives
        let outermost = findOutermostDirectiveFunctions(ast, allDirectives);

        // Skip functions whose directive matches the one this module was
        // extracted for (e.g. don't re-extract "use client" from a
        // ?use-client-inline= or &use-client-inline= module, but DO extract "use server" from it)
        if (ownDirective) {
          outermost = outermost.filter(
            ({ directive }) => directive !== ownDirective
          );
        }

        if (outermost.length === 0) return null;

        // Filter out functions whose directive is configured to be skipped
        // when the module itself has a certain directive
        const toProcess = outermost.filter(({ directive }) => {
          const cfg = configByDirective.get(directive);
          if (cfg.skipIfModuleDirective) {
            for (const skip of cfg.skipIfModuleDirective) {
              if (moduleDirectives.includes(skip)) return false;
            }
          }
          return true;
        });

        if (toProcess.length === 0) return null;

        const fnSet = new Set(toProcess.map((e) => e.fn));

        // Collect identifiers used by remaining (non-directive, non-import) code
        const usedByRemainingCode = new Set();
        let skipDepth = 0;
        walk(ast, {
          enter(node) {
            if (fnSet.has(node) || node.type === "ImportDeclaration") {
              skipDepth++;
              return;
            }
            if (
              skipDepth === 0 &&
              (node.type === "Identifier" || node.type === "JSXIdentifier")
            ) {
              usedByRemainingCode.add(node.name);
            }
          },
          leave(node) {
            if (fnSet.has(node) || node.type === "ImportDeclaration") {
              skipDepth--;
            }
          },
        });

        // Determine which imports become unused
        const importsToRemove = new Set();
        for (const node of ast.body) {
          if (node.type === "ImportDeclaration") {
            const allUnused = node.specifiers.every(
              (s) => !usedByRemainingCode.has(s.local.name)
            );
            if (allUnused && node.specifiers.length > 0) {
              importsToRemove.add(node);
            }
          }
        }

        // Detect captured scope variables per function
        const capturedVarsMap = new Map();
        const hasCapturedByDirective = new Map();
        for (const { fn: fnNode, directive } of toProcess) {
          const captured = findCapturedVars(ast, fnNode);
          if (captured.length > 0) {
            capturedVarsMap.set(fnNode, captured);
            hasCapturedByDirective.set(directive, true);
            for (const name of captured) {
              usedByRemainingCode.add(name);
            }
          }
        }

        // Build source edits
        const edits = [];
        const anonymousIndexByDirective = new Map();

        for (const { fn: fnNode, directive } of toProcess) {
          const cfg = configByDirective.get(directive);

          let fnName;
          if (fnNode.type === "FunctionDeclaration" && fnNode.id?.name) {
            fnName = fnNode.id.name;
          } else {
            const idx = anonymousIndexByDirective.get(directive) || 0;
            fnName = `anonymous_${idx}`;
            anonymousIndexByDirective.set(directive, idx + 1);
          }

          const sep = id.includes("?") ? "&" : "?";
          const inlineId = `${id}${sep}${cfg.queryKey}=${fnName}`;
          const captured = capturedVarsMap.get(fnNode) || [];

          // Build and cache extracted module
          const extractedCode = buildExtractedModule(
            code,
            ast,
            fnNode,
            directive,
            captured,
            cfg.injectCapturedParams,
            id
          );
          moduleCache.set(inlineId, extractedCode);

          if (fnNode.type === "FunctionDeclaration") {
            const isTopLevel = ast.body.includes(fnNode);
            let customResult = null;
            if (cfg.buildCallSiteReplacement) {
              const importName = `__useDirectiveInline_${fnName}`;
              customResult = cfg.buildCallSiteReplacement(
                importName,
                inlineId,
                captured
              );
            }

            if (customResult) {
              edits.push({
                start: fnNode.start,
                end: fnNode.end,
                replacement: `const ${fnNode.id.name} = ${customResult.replacement};`,
                prependImport: customResult.prependImport,
              });
            } else if (isTopLevel) {
              edits.push({
                start: fnNode.start,
                end: fnNode.end,
                replacement: `import ${fnNode.id.name} from "${inlineId}";`,
              });
            } else {
              const importName = `__useDirectiveInline_${fnName}`;
              edits.push({
                start: fnNode.start,
                end: fnNode.end,
                replacement: `const ${fnNode.id.name} = ${importName};`,
                prependImport: `import ${importName} from "${inlineId}";`,
              });
            }
          } else {
            let customResult = null;
            if (cfg.buildCallSiteReplacement) {
              const importName = `__useDirectiveInline_${fnName}`;
              customResult = cfg.buildCallSiteReplacement(
                importName,
                inlineId,
                captured
              );
            }

            if (customResult) {
              edits.push({
                start: fnNode.start,
                end: fnNode.end,
                replacement: customResult.replacement,
                prependImport: customResult.prependImport,
              });
            } else {
              const importName = `__useDirectiveInline_${fnName}`;
              edits.push({
                start: fnNode.start,
                end: fnNode.end,
                replacement: importName,
                prependImport: `import ${importName} from "${inlineId}";`,
              });
            }
          }
        }

        // Remove unused imports
        for (const node of importsToRemove) {
          let end = node.end;
          while (
            end < code.length &&
            (code[end] === "\n" || code[end] === "\r")
          ) {
            end++;
          }
          edits.push({ start: node.start, end, replacement: "" });
        }

        // Sort descending so string offsets stay valid
        edits.sort((a, b) => b.start - a.start);

        let modifiedCode = code;
        const prependImports = [];
        for (const edit of edits) {
          modifiedCode =
            modifiedCode.slice(0, edit.start) +
            edit.replacement +
            modifiedCode.slice(edit.end);
          if (edit.prependImport) {
            prependImports.push(edit.prependImport);
          }
        }

        // Add directive-specific extra imports
        for (const cfg of configs) {
          if (
            hasCapturedByDirective.get(cfg.directive) &&
            cfg.getPrependImports
          ) {
            prependImports.unshift(...cfg.getPrependImports());
          }
        }

        if (prependImports.length > 0) {
          // Insert imports AFTER any leading directive (e.g. "use client";)
          // so the directive stays at the top and is detected by other plugins.
          const directiveMatch = modifiedCode.match(
            /^(\s*(?:"use (?:client|server)"|'use (?:client|server)');\s*\n?)/
          );
          if (directiveMatch) {
            const directivePart = directiveMatch[1];
            const rest = modifiedCode.slice(directivePart.length);
            modifiedCode =
              directivePart + prependImports.join("\n") + "\n" + rest;
          } else {
            modifiedCode = prependImports.join("\n") + "\n" + modifiedCode;
          }
        }

        // Export top-level declarations used by extracted functions so that the
        // extracted virtual modules can import them (sharing module state).
        const topLevelDeclNamesForExport = new Map();
        for (const node of ast.body) {
          if (node.type === "VariableDeclaration") {
            for (const decl of node.declarations) {
              if (decl.id?.name)
                topLevelDeclNamesForExport.set(decl.id.name, true);
            }
          } else if (
            (node.type === "FunctionDeclaration" ||
              node.type === "ClassDeclaration") &&
            node.id?.name
          ) {
            topLevelDeclNamesForExport.set(node.id.name, true);
          }
        }

        const declsUsedByExtracted = new Set();
        for (const { fn: fnNode } of toProcess) {
          const usedIds = collectIdentifiers(fnNode);
          for (const name of usedIds) {
            if (topLevelDeclNamesForExport.has(name)) {
              declsUsedByExtracted.add(name);
            }
          }
        }

        if (declsUsedByExtracted.size > 0) {
          // Avoid duplicating existing exports
          const existingExports = new Set();
          for (const node of ast.body) {
            if (node.type === "ExportNamedDeclaration") {
              if (
                node.declaration?.type === "FunctionDeclaration" &&
                node.declaration.id?.name
              ) {
                existingExports.add(node.declaration.id.name);
              }
              if (node.declaration?.type === "VariableDeclaration") {
                for (const d of node.declaration.declarations) {
                  if (d.id?.name) existingExports.add(d.id.name);
                }
              }
              for (const spec of node.specifiers || []) {
                existingExports.add(spec.exported?.name || spec.local?.name);
              }
            }
          }

          const toExport = [...declsUsedByExtracted].filter(
            (n) => !existingExports.has(n)
          );
          if (toExport.length > 0) {
            modifiedCode += `\nexport { ${toExport.join(", ")} };\n`;
          }
        }

        return modifiedCode;
      },
    },
  };
}
