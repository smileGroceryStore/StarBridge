import http from 'node:http';
import fs from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './catalog.js';
import { scanTools } from './scanner.js';

export function createApp() {
  const token = randomBytes(32).toString('hex');
  let scanning = false;
  return http.createServer(async (req, res) => {
    const address = `127.0.0.1:${req.socket.localPort}`;
    const origin = `http://${address}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    if (req.headers.host !== address || (req.headers.origin && req.headers.origin !== origin) || ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) return send(403, { error: '仅允许本机同源访问' });
    try {
      const pathname = new URL(req.url, origin).pathname;
      if (pathname === '/api/session' && req.method === 'GET') return send(200, { token });
      if (pathname.startsWith('/api/')) {
        const supplied = Buffer.from(req.headers['x-allsetting-token'] ?? '');
        if (supplied.length !== token.length || !timingSafeEqual(supplied, Buffer.from(token))) return send(403, { error: '会话已失效，请刷新页面' });
        if (pathname === '/api/catalog' && req.method === 'GET') return send(200, await loadCatalog());
        if (pathname === '/api/scan' && req.method === 'POST') {
          if (scanning) return send(409, { error: '扫描正在进行' });
          let body = '', bytes = 0;
          for await (const chunk of req) { bytes += chunk.length; if (bytes > 32768) return send(413, { error: '请求过大' }); body += chunk; }
          let payload;
          try { payload = JSON.parse(body || '{}'); } catch { return send(400, { error: '请求格式错误' }); }
          const manualPaths = payload.manualPaths ?? {};
          if (!manualPaths || typeof manualPaths !== 'object' || Array.isArray(manualPaths) || Object.values(manualPaths).some(v => !Array.isArray(v) || v.length > 10 || v.some(p => typeof p !== 'string' || p.length > 4096))) return send(400, { error: '路径格式错误' });
          scanning = true;
          try { return send(200, await scanTools((await loadCatalog()).tools, { manualPaths })); }
          finally { scanning = false; }
        }
        return send(404, { error: '接口不存在' });
      }
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
      if (req.method !== 'GET' || !files[pathname]) return send(404, { error: '页面不存在' });
      const [file, type] = files[pathname];
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      res.end(await fs.readFile(new URL(`../public/${file}`, import.meta.url)));
    } catch { if (!res.headersSent) send(500, { error: '扫描服务发生错误，请重试' }); else res.end(); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createApp();
  server.on('error', error => { console.error(`启动失败：${error.code}`); process.exitCode = 1; });
  server.listen(Number(process.env.ALLSETTING_PORT ?? 4317), '127.0.0.1', () => console.log(`AllSetting 已启动：http://127.0.0.1:${server.address().port}`));
}
