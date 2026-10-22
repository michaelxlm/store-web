#!/usr/bin/env node
'use strict';
/* ==========================================================================
   serve.js · 本地静态预览（零依赖，Node 18+）
   用法：node scripts/serve.js  |  node scripts/serve.js --port=8080
   必须经 HTTP 访问：file:// 会拦 fetch，且埋点 SDK 主动跳过上报。
   站点为多页静态 HTML：直接访问 /shop/shop.html 等带 .html 后缀的链接。
   ========================================================================== */

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
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function resolveFile(pathname) {
  let filePath = path.join(ROOT, pathname);
  if (pathname.endsWith('/')) filePath = path.join(filePath, 'index.html');
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    return path.join(filePath, 'index.html');
  }
  return filePath;
}

http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname || '/');
  const filePath = resolveFile(pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      const nf = path.join(ROOT, '404.html');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : '404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('[serve] http://localhost:' + PORT + '  ←  ' + ROOT);
  console.log('[serve] Ctrl+C 停止；改完 data/*.json 或 templates/ 记得跑 node scripts/build.js');
});
