import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--core-root")) {
  throw new Error("Usage: node scripts/check-core-portability.mjs [--core-root path]");
}
const root = fs.realpathSync(path.resolve(args[1] ?? "packages/core"));
const sourceRoot = path.join(root, "src");
const failures = [];
const allowedImports = new Set(["@js-temporal/polyfill", "ohash/crypto"]);
const forbiddenGlobals = new Set([
  "window", "document", "navigator", "localStorage", "sessionStorage",
  "Notification", "fetch", "process", "Buffer", "global", "globalThis",
  "require", "eval", "Function",
]);

function insideSource(file) {
  const relative = path.relative(sourceRoot, file);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function inspectImport(specifier, file) {
  if (allowedImports.has(specifier)) return;
  if (!specifier.startsWith(".")) {
    failures.push(`${file}: forbidden core import ${specifier}`);
    return;
  }
  const target = path.resolve(path.dirname(file), specifier);
  const resolved = [target, `${target}.ts`, `${target}.json`, path.join(target, "index.ts")]
    .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!insideSource(target) || (resolved && !insideSource(fs.realpathSync(resolved)))) {
    failures.push(`${file}: core import escapes src: ${specifier}`);
  }
}

const configFile = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
if (configFile.error) {
  failures.push(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
} else {
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
  if (!config.options.types || config.options.types.length ||
      !config.options.lib?.length || config.options.lib.some((lib) => !/^lib\.es\w*\.d\.ts$/i.test(lib))) {
    failures.push("Core must use only ES libraries and types: []; DOM and Node ambient types are forbidden.");
  }
  if (!config.options.strict || !config.options.noEmit || config.options.allowJs) {
    failures.push("Core requires strict, noEmit, and TypeScript source files.");
  }
  const sourceFiles = ts.sys.readDirectory(sourceRoot, [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);
  if (!sourceFiles.length) failures.push("Core source files are missing.");
  for (const file of sourceFiles) {
    if (!file.endsWith(".ts") || !config.fileNames.includes(file) || !insideSource(fs.realpathSync(file))) {
      failures.push(`${file}: core source must be an included TypeScript file inside src.`);
    }
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    if (source.libReferenceDirectives.length || source.typeReferenceDirectives.length || source.referencedFiles.length) {
      failures.push(`${file}: ambient library/type references are forbidden in core.`);
    }
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        inspectImport(node.moduleSpecifier.text, file);
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        inspectImport(node.argument.literal.text, file);
      }
      if (ts.isImportEqualsDeclaration(node)) failures.push(`${file}: require-style core imports are forbidden.`);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
          inspectImport(node.arguments[0].text, file);
        } else failures.push(`${file}: nonliteral dynamic import is forbidden in core.`);
      }
      if (ts.isIdentifier(node) && forbiddenGlobals.has(node.text)) {
        failures.push(`${file}: forbidden core global ${node.text}`);
      }
      if (ts.isPropertyAccessExpression(node) &&
          ((node.expression.getText(source) === "Date" && node.name.text === "now") ||
           (node.expression.getText(source) === "Temporal" && node.name.text === "Now"))) {
        failures.push(`${file}: core clock reads must receive an injected instant.`);
      }
      if (ts.isNewExpression(node) && node.expression.getText(source) === "Date" && !node.arguments?.length) {
        failures.push(`${file}: core clock reads must receive an injected instant.`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const program = ts.createProgram(config.fileNames, config.options);
  const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)];
  for (const diagnostic of diagnostics) {
    failures.push(`${diagnostic.file?.fileName ?? "tsconfig"}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`);
  }
}

if (failures.length) {
  console.error(`core:check failed:\n${[...new Set(failures)].map((message) => `- ${message}`).join("\n")}`);
  process.exit(1);
}
console.log("core:check passed (AST imports/globals and TypeScript without DOM or Node types).");
