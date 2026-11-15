// KIRA_REACT_CHECKS_V1
// Erros de React que passam na análise de sintaxe mas quebram o preview em tempo de execução:
//  - <Componente/> usado sem import nem definição  → "X is not defined"
//  - useState/useEffect/useNavigate... sem import   → "useState is not defined"
//  - import Default de arquivo sem export default    → "does not provide an export named default"
//  - import { Nome } que o arquivo não exporta        → componente undefined / tela branca
import path from 'node:path';
import { parse } from '@babel/parser';

const CODE = /\.(?:jsx?|tsx?|mjs)$/i;
const RESOLVE_EXT = ['', '.jsx', '.js', '.tsx', '.ts', '.mjs', '/index.jsx', '/index.js', '/index.tsx', '/index.ts'];
const GLOBALS = new Set(['React', 'Fragment', 'Suspense', 'StrictMode', 'Object', 'Array', 'Math', 'Date', 'JSON', 'Promise', 'Number', 'String', 'Boolean', 'Map', 'Set', 'Intl', 'Error']);

function parseFile(file) {
  const ts = /\.tsx?$/i.test(file.path);
  return parse(file.content, {
    sourceType: 'module',
    errorRecovery: true,
    plugins: ['jsx', ...(ts ? ['typescript'] : [])]
  });
}

function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach(child => walk(child, visit, node));
    else if (value && typeof value.type === 'string') walk(value, visit, node);
  }
}

function bindingNames(pattern, out) {
  if (!pattern) return;
  switch (pattern.type) {
    case 'Identifier': out.add(pattern.name); break;
    case 'ObjectPattern': pattern.properties.forEach(p => bindingNames(p.type === 'RestElement' ? p.argument : p.value, out)); break;
    case 'ArrayPattern': pattern.elements.forEach(e => bindingNames(e, out)); break;
    case 'AssignmentPattern': bindingNames(pattern.left, out); break;
    case 'RestElement': bindingNames(pattern.argument, out); break;
    case 'TSParameterProperty': bindingNames(pattern.parameter, out); break;
  }
}

function analyze(file) {
  const ast = parseFile(file);
  const declared = new Set();
  const imports = [];
  const exportsInfo = { hasDefault: false, named: new Set(), star: false };
  const jsxNames = new Set();
  const hookCalls = new Set();

  walk(ast.program, (node, parent) => {
    switch (node.type) {
      case 'ImportDeclaration':
        for (const spec of node.specifiers) {
          declared.add(spec.local.name);
          imports.push({
            source: node.source.value,
            kind: spec.type === 'ImportDefaultSpecifier' ? 'default' : spec.type === 'ImportNamespaceSpecifier' ? 'namespace' : 'named',
            imported: spec.imported?.name ?? spec.imported?.value,
            local: spec.local.name,
            typeOnly: node.importKind === 'type' || spec.importKind === 'type'
          });
        }
        break;
      case 'VariableDeclarator': bindingNames(node.id, declared); break;
      case 'FunctionDeclaration': case 'ClassDeclaration': case 'TSEnumDeclaration':
        if (node.id) declared.add(node.id.name);
        node.params?.forEach(p => bindingNames(p, declared));
        break;
      case 'FunctionExpression': case 'ArrowFunctionExpression': case 'ObjectMethod': case 'ClassMethod':
        if (node.id) declared.add(node.id.name);
        node.params?.forEach(p => bindingNames(p, declared));
        break;
      case 'CatchClause': bindingNames(node.param, declared); break;
      case 'ExportDefaultDeclaration': exportsInfo.hasDefault = true; break;
      case 'ExportAllDeclaration': exportsInfo.star = true; break;
      case 'ExportNamedDeclaration':
        if (node.declaration) {
          const d = node.declaration;
          if (d.id?.name) exportsInfo.named.add(d.id.name);
          d.declarations?.forEach(v => { const names = new Set(); bindingNames(v.id, names); names.forEach(n => exportsInfo.named.add(n)); });
        }
        for (const spec of node.specifiers || []) {
          const name = spec.exported?.name ?? spec.exported?.value;
          if (name === 'default') exportsInfo.hasDefault = true; else if (name) exportsInfo.named.add(name);
        }
        break;
      case 'JSXOpeningElement': {
        let n = node.name;
        while (n.type === 'JSXMemberExpression') n = n.object;
        if (n.type === 'JSXIdentifier' && /^[A-Z]/.test(n.name)) jsxNames.add(n.name);
        break;
      }
      case 'CallExpression':
        if (node.callee.type === 'Identifier' && /^use[A-Z]\w*$/.test(node.callee.name)) hookCalls.add(node.callee.name);
        break;
    }
  });
  return { declared, imports, exportsInfo, jsxNames, hookCalls };
}

function resolveLocal(from, specifier, byPath) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier.split(/[?#]/)[0]));
  for (const ext of RESOLVE_EXT) if (byPath.has(base + ext)) return base + ext;
  return null;
}

export function inspectReactProject(files = []) {
  const issues = [];
  const byPath = new Map();
  for (const file of files || []) {
    if (file?.path && typeof file.content === 'string') byPath.set(String(file.path).replaceAll('\\', '/').replace(/^\.\//, ''), file);
  }
  const results = new Map();
  for (const [filePath, file] of byPath) {
    if (!CODE.test(filePath) || file.content.length > 200 * 1024) continue;
    try { results.set(filePath, analyze({ ...file, path: filePath })); } catch { /* sintaxe é avaliada pelo syntaxGate */ }
  }

  for (const [filePath, info] of results) {
    for (const name of info.jsxNames) {
      if (!info.declared.has(name) && !GLOBALS.has(name)) issues.push(`${filePath}: <${name}> é usado mas não foi importado nem definido`);
    }
    for (const hook of info.hookCalls) {
      if (!info.declared.has(hook)) issues.push(`${filePath}: ${hook}() é chamado mas não foi importado (ex.: import { ${hook} } from "react")`);
    }
    for (const imp of info.imports) {
      if (imp.typeOnly || !imp.source.startsWith('.')) continue;
      const target = resolveLocal(filePath, imp.source, byPath);
      const targetInfo = target && results.get(target);
      if (!targetInfo || targetInfo.exportsInfo.star) continue;
      if (imp.kind === 'default' && !targetInfo.exportsInfo.hasDefault) {
        issues.push(`${filePath}: importa default de ${imp.source}, mas ${target} não tem export default`);
      }
      if (imp.kind === 'named' && imp.imported && !targetInfo.exportsInfo.named.has(imp.imported)) {
        issues.push(`${filePath}: importa { ${imp.imported} } de ${imp.source}, mas ${target} não exporta esse nome`);
      }
    }
  }
  return { ok: issues.length === 0, issues: [...new Set(issues)].slice(0, 20) };
}
