#!/usr/bin/env node
/* ==========================================================================
   serve.js · 本地静态预览（零依赖，Node 18+）
   用法：
     node scripts/serve.js            默认 http://localhost:4173
     node scripts/serve.js --port=8080

   必须通过 HTTP 访问：file:// 双击打开时浏览器会拦掉 fetch，且埋点 SDK 会主动跳过上报。
   ========================================================================== */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argPort = (process.argv.find((a) => a.startsWith('--port=')) || '').split('=')[1];
const PORT = Number(argPort) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  // 用 WHATWG URL 而不是已废弃的 url.parse（Node 会打 CVE 相关弃用告警）
  let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname || '/');
  if (pathname.endsWith('/')) pathname += 'index.html';

  // 防目录穿越：解析后必须仍在项目根目录内
  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      const notFound = path.join(ROOT, '404.html');
      const body = fs.existsSync(notFound) ? fs.readFileSync(notFound) : '404 Not Found';
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[serve] http://localhost:${PORT}  ←  ${ROOT}`);
  console.log('[serve] Ctrl+C 停止；改完 data/*.json 记得跑 node scripts/build.js');
});
