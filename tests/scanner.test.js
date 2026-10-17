import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanTools } from '../src/scanner.js';
import { createApp } from '../src/server.js';

test('config remnants are traces; PATH shims are candidates, never executed', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'allsetting-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.claude')); await fs.writeFile(path.join(root, '.claude', 'settings.json'), 'SECRET_DO_NOT_READ');
  await fs.writeFile(path.join(root, 'codex.cmd'), 'exit 99');
  const out = await scanTools([{ id: 'claude-code' }, { id: 'codex' }, { id: 'unknown-agent' }], { home: root, env: { PATH: root }, platform: 'win32' });
  assert.deepEqual(out.tools.map(t => t.status), ['trace-only', 'candidate', 'unsupported']);
  assert.ok(!JSON.stringify(out).includes('SECRET_DO_NOT_READ'));
});
test('manual paths require an existing absolute executable file', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'allsetting-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const executable = path.join(root, 'custom.exe'); await fs.writeFile(executable, 'not executed');
  const out = await scanTools([{ id: 'zcode' }, { id: 'pi' }], { home: root, env: {}, platform: 'win32', manualPaths: { zcode: [executable], pi: ['relative.exe'] } });
  assert.equal(out.tools[0].status, 'candidate'); assert.equal(out.tools[1].status, 'error');
  assert.equal(out.tools[1].errors[0].code, 'ABSOLUTE_PATH_REQUIRED');
});
test('extension identities use manifests and preserve host instances', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'allsetting-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const host of ['.vscode', '.cursor']) { const dir = path.join(root, host, 'extensions', 'arbitrary-folder'); await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ publisher: 'saoudrizwan', name: 'claude-dev', version: '1.0' })); }
  const out = await scanTools([{ id: 'cline' }, { id: 'copilot' }], { home: root, env: {} });
  assert.equal(out.tools[0].status, 'detected'); assert.equal(out.tools[0].evidence.length, 2); assert.equal(out.tools[1].status, 'not-found');
});
test('access errors are reported rather than silently called not found', async () => {
  const mock = { stat: async () => { throw Object.assign(Error(), { code: 'EACCES' }); }, readdir: async () => [] };
  const out = await scanTools([{ id: 'claude-code' }], { home: os.tmpdir(), env: {}, fs: mock });
  assert.equal(out.tools[0].status, 'error');
});
test('local API rejects foreign origins, missing tokens and invalid payloads', async t => {
  const server = createApp(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/session', { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(base + '/api/catalog')).status, 403);
  const { token } = await (await fetch(base + '/api/session')).json();
  const headers = { 'X-AllSetting-Token': token };
  const catalog = await (await fetch(base + '/api/catalog', { headers })).json(); assert.equal(catalog.tools.length, 31);
  assert.equal((await fetch(base + '/api/scan', { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await fetch(base + '/api/scan', { method: 'POST', headers, body: '{"manualPaths":{"codex":"bad"}}' })).status, 400);
  assert.equal((await fetch(base + '/catalog/tools.json')).status, 404);
  const page = await fetch(base); assert.equal(page.status, 200); assert.match(await page.text(), /星桥/);
});

