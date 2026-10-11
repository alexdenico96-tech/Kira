import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Passive diagnostics only. Never executes user-generated project code.
export function inspectProjectSyntax(files = []) {
  const issues = [], warnings = [];
  const all = Array.isArray(files) ? files : [];
  const names = new Set(all.map(f => String(f?.path || '').replaceAll('\\', '/').replace(/^\.\//, '')));
  let checked = 0, skipped = 0;
  const packageFile = all.find(f => String(f?.path || '').replace(/^\.\//, '') === 'package.json');
  let pkg;
  try { if (packageFile) pkg = JSON.parse(packageFile.content); } catch { /* handled by existing gate */ }
  const type = pkg?.type === 'module' ? 'module' : 'commonjs';
  for (const f of all) {
    const name = String(f?.path || '').replaceAll('\\', '/');
    if (!/\.(?:js|mjs|cjs)$/i.test(name)) continue;
    if (checked >= 25 || typeof f.content !== 'string' || Buffer.byteLength(f.content, 'utf8') > 128 * 1024) { skipped++; continue; }
    // Vite carrega vite.config.js por um loader que suporta ESM mesmo sem package.json type=module.
    // A checagem via stdin deve refletir essa semântica, sem executar código.
    const viteConfig = /(?:^|\/)vite\.config\.js$/i.test(name);
    const mode = name.endsWith('.mjs') ? 'module' : name.endsWith('.cjs') ? 'commonjs' : viteConfig ? 'module' : type;
    // Node's --check parses stdin but never evaluates the source.
    const run = spawnSync(process.execPath, ['--input-type=' + mode, '--check'], {
      input: f.content, encoding: 'utf8', timeout: 1800, maxBuffer: 32 * 1024,
      windowsHide: true
    });
    checked++;
    if (run.error) { warnings.push(`${name}: não foi possível verificar sintaxe (${run.error.code || 'erro'})`); continue; }
    if (run.status !== 0) {
      const stderr = String(run.stderr || '');
      const match = stderr.match(/(?:SyntaxError|Error):\s*([^\r\n]+)/);
      issues.push(`${name}: ${match ? match[1].slice(0, 140) : 'sintaxe JavaScript inválida'}`);
    }
  }
  if (pkg?.scripts && typeof pkg.scripts === 'object' && !Array.isArray(pkg.scripts)) {
    for (const [script, command] of Object.entries(pkg.scripts)) {
      if (typeof command !== 'string') continue;
      // Only direct Node entrypoints, no shell evaluation or guessing npm/vite scripts.
      const match = command.trim().match(/^node\s+(?:--[\w-]+(?:=\S+)?\s+)*([\w./-]+\.(?:js|mjs|cjs))(?:\s|$)/);
      if (!match) continue;
      const entry = path.posix.normalize(match[1].replace(/^\.\//, ''));
      if (entry.startsWith('../') || entry.startsWith('/')) { warnings.push(`script ${script}: caminho fora do projeto`); continue; }
      if (!names.has(entry)) issues.push(`script ${script}: arquivo não encontrado: ${entry}`);
    }
  }
  return { checked, skipped, issues: [...new Set(issues)], warnings: [...new Set(warnings)] };
}
