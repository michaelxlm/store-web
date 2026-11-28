#!/usr/bin/env node
'use strict';
/* ==========================================================================
   minify.js · CSS / JS 保守压缩（零依赖）
   --------------------------------------------------------------------------
   产物（与源码同目录，后缀 .min）：
     assets/css/*.css            → *.min.css
     assets/css/pages/*.css      → *.min.css
     assets/js/*.js              → *.min.js   （跳过已存在的 .min / .json）
     assets/js/pages/*.js        → *.min.js
   CSS：去注释 + 折叠空白 + 去尾分号（不侵入字符串）。
   JS ：去整行/块注释与空行，不合并行、不改标识符（规避 ASI 风险）。
   用法：node scripts/minify.js   |   node scripts/minify.js --clean
   ========================================================================== */

const fs = require('fs');
const path = require('path');

// 站点根目录双态解析：被站点 build.js require 时（WO-164 ④ 私有包化，模块位于
// node_modules/@xuyiheng/static-build-kit）以进程入口为基准；直接 CLI 运行
// （各站 scripts/ 本地副本）时以自身位置为基准；无入口（node -e）时约定 cwd 即站点根。
const ROOT = require.main === module
  ? path.resolve(__dirname, '..')
  : require.main
    ? path.resolve(path.dirname(require.main.filename), '..')
    : process.cwd();
const ASSETS = path.join(ROOT, 'assets');
const TARGET_DIRS = ['css', 'js'].map((d) => path.join(ASSETS, d));

function walkSourceFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkSourceFiles(full, out);
    else if (/\.(css|js)$/i.test(ent.name) && !/\.min\.(css|js)$/i.test(ent.name)) out.push(full);
  }
  return out;
}

function minifyCss(src) {
  let out = '';
  let i = 0;
  const len = src.length;
  let quote = '';
  const prevChar = () => out.charAt(out.length - 1);
  while (i < len) {
    const c = src[i];
    if (quote) {
      out += c;
      if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; }
      if (c === quote) quote = '';
      i++;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < len && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (/\s/.test(c)) {
      while (i < len && /\s/.test(src[i])) i++;
      const p = prevChar();
      const n = src[i] || '';
      if (p && p !== '{' && p !== '}' && p !== ';' && p !== ',' && p !== ':' && p !== ' ' &&
        n && n !== '{' && n !== '}' && n !== ';' && n !== ',' && n !== ':') out += ' ';
      continue;
    }
    out += c;
    i++;
  }
  return out.replace(/;}/g, '}').replace(/;;+/g, ';').replace(/\s*{\s*/g, '{')
    .replace(/\s*}\s*/g, '}').replace(/;\s*$/, '').trim();
}

function minifyJs(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    let t = lines[i].trim();
    if (inBlock) {
      if (t.indexOf('*/') !== -1) inBlock = false;
      continue;
    }
    if (!t) continue;
    if (t.indexOf('/*') === 0) {
      const end = t.indexOf('*/');
      if (end === -1) { inBlock = true; continue; }
      t = t.slice(end + 2).trim();
      if (!t) continue;
    }
    if (t.indexOf('//') === 0) continue;
    out.push(t);
  }
  return out.join('\n');
}

function run() {
  const clean = process.argv.indexOf('--clean') !== -1;
  let touched = 0;
  let removed = 0;
  TARGET_DIRS.forEach((dir) => {
    if (clean) {
      (function cleanDir(current) {
        if (!fs.existsSync(current)) return;
        fs.readdirSync(current, { withFileTypes: true }).forEach((ent) => {
          const full = path.join(current, ent.name);
          if (ent.isDirectory()) cleanDir(full);
          else if (/\.min\.(css|js)$/.test(ent.name)) { fs.unlinkSync(full); removed++; }
        });
      })(dir);
      return;
    }
    walkSourceFiles(dir).forEach((file) => {
      const ext = path.extname(file).toLowerCase();
      const src = fs.readFileSync(file, 'utf8');
      const min = ext === '.css' ? minifyCss(src) : minifyJs(src);
      const target = file.replace(/\.(css|js)$/, '.min.$1');
      fs.writeFileSync(target, min + '\n');
      touched++;
    });
  });
  console.log(clean ? ('minify --clean：删除 ' + removed + ' 个 .min 产物') : ('minify：生成 ' + touched + ' 个 .min 产物'));
  return touched;
}

if (require.main === module) run();
module.exports = { run, minifyCss, minifyJs, walkSourceFiles };
