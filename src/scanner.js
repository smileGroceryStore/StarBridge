import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { rules, extensionHomes } from './rules.js';

export async function scanTools(tools, options = {}) {
  const home = options.home ?? os.homedir();
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const manualPaths = options.manualPaths ?? {};
  const io = options.fs ?? fs;
  const paths = (env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean).map(p => p.replace(/^"|"$/g, ''));
  const suffixes = platform === 'win32' ? ['.exe', '.cmd', '.bat', '.com'] : [''];
  const roots = platform === 'win32' ? [env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs'), env.LOCALAPPDATA, env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean) : [];
  async function exists(target, kind, errors) {
    try { const s = await io.stat(target); return kind === 'file' ? s.isFile() : true; }
    catch (e) { if (!['ENOENT', 'ENOTDIR'].includes(e.code)) errors.push({ path: target, code: e.code ?? 'UNKNOWN' }); return false; }
  }
  // Inspect only extension manifests; never open agent configs or credentials.
  const extensions = [], extensionErrors = [];
  for (const relative of extensionHomes) {
    const root = path.join(home, relative);
    let entries;
    try { entries = await io.readdir(root, { withFileTypes: true }); }
    catch (e) { if (!['ENOENT', 'ENOTDIR'].includes(e.code)) extensionErrors.push({ path: root, code: e.code }); continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifest = path.join(root, entry.name, 'package.json');
      try {
        if ((await io.stat(manifest)).size > 1024 * 1024) continue;
        const pkg = JSON.parse(await io.readFile(manifest, 'utf8'));
        if (typeof pkg.publisher === 'string' && typeof pkg.name === 'string') extensions.push({ id: `${pkg.publisher}.${pkg.name}`.toLowerCase(), path: path.dirname(manifest), host: relative.split('/')[0], version: typeof pkg.version === 'string' ? pkg.version : null });
      } catch (e) { if (!['ENOENT', 'ENOTDIR'].includes(e.code)) extensionErrors.push({ path: manifest, code: e.code ?? 'INVALID_MANIFEST' }); }
    }
  }
  const results = await Promise.all(tools.map(async tool => {
    const rule = rules[tool.id] ?? {};
    const evidence = [], errors = rule.extension ? [...extensionErrors] : [];
    const seen = new Set();
    const add = item => { const key = platform === 'win32' ? item.path.toLowerCase() : item.path; if (!seen.has(key)) { seen.add(key); evidence.push(item); } };
    for (const command of rule.commands ?? []) for (const root of paths) for (const suffix of suffixes) {
      const target = path.join(root, command + suffix);
      if (await exists(target, 'file', errors)) add({ type: 'command-candidate', path: target, note: '命令候选，尚未运行或核验产品身份' });
    }
    for (const relative of rule.apps ?? []) for (const root of roots) {
      const target = path.join(root, relative);
      if (await exists(target, 'file', errors)) add({ type: 'app-candidate', path: target, note: '常见安装位置，待核验身份' });
    }
    for (const ext of extensions) if ((rule.extension ?? []).includes(ext.id)) add({ type: 'extension', path: ext.path, host: ext.host, version: ext.version, note: '已匹配扩展清单；宿主可用性未验证' });
    for (const relative of rule.traces ?? []) {
      const target = path.join(home, relative);
      if (await exists(target, 'any', errors)) add({ type: 'config-trace', path: target, note: '仅检查存在性，未读取内容' });
    }
    for (const target of manualPaths[tool.id] ?? []) {
      if (!path.isAbsolute(target)) { errors.push({ path: target, code: 'ABSOLUTE_PATH_REQUIRED' }); continue; }
      if (!/\.(exe|cmd|bat|com)$/i.test(target) && platform === 'win32') { errors.push({ path: target, code: 'EXECUTABLE_PATH_REQUIRED' }); continue; }
      if (await exists(target, 'file', errors)) add({ type: 'manual', path: target, note: '用户指定，未运行或核验身份' });
      else errors.push({ path: target, code: 'MANUAL_PATH_UNAVAILABLE' });
    }
    const status = evidence.some(e => e.type === 'extension') ? 'detected' : evidence.some(e => e.type !== 'config-trace') ? 'candidate' : evidence.length ? 'trace-only' : errors.length ? 'error' : Object.keys(rule).length ? 'not-found' : 'unsupported';
    return { ...tool, status, evidence, errors, automaticConfiguration: false };
  }));
  return { scannedAt: new Date().toISOString(), platform, scope: '当前用户、当前系统；未扫描 WSL、注册表、全部磁盘或运行工具', tools: results };
}
