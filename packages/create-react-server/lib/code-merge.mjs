import { Project, ts } from "ts-morph";

import { format } from "./formatter.mjs";

export async function mergeCodeFiles(...fileContents) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      esModuleInterop: true,
    },
  });

  const mergedSourceFile = project.createSourceFile("mergedFile.ts", "", {
    overwrite: true,
  });

  const importDeclarations = [];
  const otherStatementsMap = new Map();

  fileContents.forEach((content, index) => {
    const sourceFile = project.createSourceFile(`file${index}.ts`, content, {
      overwrite: true,
    });

    sourceFile.getImportDeclarations().forEach((importDecl) => {
      importDeclarations.push(importDecl);
    });

    sourceFile.getStatements().forEach((stmt) => {
      if (!stmt.isKind(ts.SyntaxKind.ImportDeclaration)) {
        const key = getStatementKey(stmt);
        if (!otherStatementsMap.has(key)) {
          otherStatementsMap.set(key, stmt);
        } else {
          const existingStmt = otherStatementsMap.get(key);
          mergeNodes(existingStmt, stmt);
        }
      }
    });
  });

  const groupedImports = groupAndSortImports(importDeclarations);
  groupedImports.forEach((importDecl) => {
    mergedSourceFile.addImportDeclaration({
      moduleSpecifier: importDecl.getModuleSpecifierValue(),
      defaultImport: importDecl.getDefaultImport()?.getText(),
      namedImports: importDecl.getNamedImports().map((ni) => ni.getText()),
    });
  });

  otherStatementsMap.forEach((stmt) => {
    mergedSourceFile.addStatements(stmt.getFullText());
  });

  const mergedCode = mergedSourceFile.getFullText();
  return format(mergedCode, "typescript");
}

function getStatementKey(stmt) {
  if (stmt.isKind(ts.SyntaxKind.VariableStatement)) {
    const declarations = stmt.getDeclarationList().getDeclarations();
    return declarations.map((decl) => decl.getName()).join(",");
  } else if (stmt.isKind(ts.SyntaxKind.FunctionDeclaration)) {
    return `Function:${stmt.getName()}`;
  } else if (stmt.isKind(ts.SyntaxKind.ClassDeclaration)) {
    return `Class:${stmt.getName()}`;
  } else if (stmt.isKind(ts.SyntaxKind.ExpressionStatement)) {
    const expression = stmt.getExpression();
    return `Expression:${expression.getText()}`;
  } else if (stmt.isKind(ts.SyntaxKind.ExportAssignment)) {
    return `ExportAssignment`;
  }
  return `Kind:${stmt.getKindName()}:${stmt.getText()}`;
}

function mergeNodes(target, source) {
  if (
    ts.isObjectLiteralExpression(target.compilerNode) &&
    ts.isObjectLiteralExpression(source.compilerNode)
  ) {
    mergeObjectLiterals(target, source);
  } else if (target.getChildCount() > 0 && source.getChildCount() > 0) {
    const targetChildren = target.getChildren();
    const sourceChildren = source.getChildren();
    const length = Math.max(targetChildren.length, sourceChildren.length);

    for (let i = 0; i < length; i++) {
      const targetChild = targetChildren[i];
      const sourceChild = sourceChildren[i];

      if (targetChild && sourceChild) {
        mergeNodes(targetChild, sourceChild);
      } else if (sourceChild) {
        target.addChildText(sourceChild.getFullText());
      }
    }
  } else {
    target.replaceWithText(source.getFullText());
  }
}

function mergeObjectLiterals(target, source) {
  const targetProperties = target.getProperties();
  const sourceProperties = source.getProperties();

  const targetPropertyMap = new Map();
  targetProperties.forEach((prop) => {
    const name = prop.getName();
    if (name) {
      targetPropertyMap.set(name, prop);
    }
  });

  sourceProperties.forEach((sourceProp) => {
    const name = sourceProp.getName();
    if (name) {
      const targetProp = targetPropertyMap.get(name);

      if (targetProp) {
        const targetInitializer = getInitializer(targetProp);
        const sourceInitializer = getInitializer(sourceProp);

        if (
          targetInitializer &&
          sourceInitializer &&
          ts.isObjectLiteralExpression(targetInitializer.compilerNode) &&
          ts.isObjectLiteralExpression(sourceInitializer.compilerNode)
        ) {
          mergeObjectLiterals(targetInitializer, sourceInitializer);
        } else if (
          targetInitializer &&
          sourceInitializer &&
          ts.isArrayLiteralExpression(targetInitializer.compilerNode) &&
          ts.isArrayLiteralExpression(sourceInitializer.compilerNode)
        ) {
          mergeArrays(targetInitializer, sourceInitializer);
        } else {
          targetProp.replaceWithText(sourceProp.getFullText());
        }
      } else {
        target.addProperty(sourceProp.getFullText());
      }
    } else {
      target.addProperty(sourceProp.getFullText());
    }
  });
}

function mergeArrays(targetArray, sourceArray) {
  const targetElements = targetArray.getElements();
  const sourceElements = sourceArray.getElements();

  const targetTexts = targetElements.map((el) => el.getText());
  const sourceTexts = sourceElements.map((el) => el.getText());

  const mergedTexts = [...targetTexts, ...sourceTexts];

  const mergedArrayText = `[${mergedTexts.join(", ")}]`;
  targetArray.replaceWithText(mergedArrayText);
}

function getInitializer(prop) {
  if (prop.isKind(ts.SyntaxKind.PropertyAssignment)) {
    return prop.getInitializer();
  } else if (prop.isKind(ts.SyntaxKind.ShorthandPropertyAssignment)) {
    return prop.getNameNode();
  } else if (prop.isKind(ts.SyntaxKind.MethodDeclaration)) {
    return prop;
  }
  return null;
}

function groupAndSortImports(importDeclarations) {
  const externalImports = [];
  const builtInImports = [];
  const relativeImports = [];

  const importMap = new Map();

  importDeclarations.forEach((importDecl) => {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    const importKey = moduleSpecifier;

    if (importMap.has(importKey)) {
      const existingImport = importMap.get(importKey);
      mergeImportDeclarations(existingImport, importDecl);
    } else {
      importMap.set(importKey, importDecl);

      if (isRelativeImport(moduleSpecifier)) {
        relativeImports.push(importDecl);
      } else if (isBuiltInImport(moduleSpecifier)) {
        builtInImports.push(importDecl);
      } else {
        externalImports.push(importDecl);
      }
    }
  });

  builtInImports.sort(compareModuleSpecifiers);
  externalImports.sort(compareModuleSpecifiers);
  relativeImports.sort(compareModuleSpecifiers);

  return [...builtInImports, ...externalImports, ...relativeImports];
}

function isRelativeImport(moduleSpecifier) {
  return (
    moduleSpecifier.startsWith("./") ||
    moduleSpecifier.startsWith("../") ||
    moduleSpecifier === "." ||
    moduleSpecifier === ".."
  );
}

function isBuiltInImport(moduleSpecifier) {
  return moduleSpecifier.startsWith("node:");
}

function compareModuleSpecifiers(a, b) {
  const specA = a.getModuleSpecifierValue();
  const specB = b.getModuleSpecifierValue();
  return specA.localeCompare(specB);
}

function mergeImportDeclarations(targetImport, sourceImport) {
  const targetNamedImports = new Set(
    targetImport.getNamedImports().map((ni) => ni.getText())
  );
  sourceImport.getNamedImports().forEach((ni) => {
    const name = ni.getText();
    if (!targetNamedImports.has(name)) {
      targetImport.addNamedImport(name);
      targetNamedImports.add(name);
    }
  });

  const targetDefaultImport = targetImport.getDefaultImport()?.getText();
  const sourceDefaultImport = sourceImport.getDefaultImport()?.getText();

  if (!targetDefaultImport && sourceDefaultImport) {
    targetImport.setDefaultImport(sourceDefaultImport);
  }
}
