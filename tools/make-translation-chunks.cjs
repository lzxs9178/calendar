/* 把待翻译条目切成块，供翻译使用
 * 产出：tools/tr/chunk-01.json … （每块 N 条，带全局序号 i，便于按序号回填）
 * 用法：node tools/make-translation-chunks.cjs [每块条数]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const size = parseInt(process.argv[2], 10) || 150;
const src = JSON.parse(fs.readFileSync(path.join(__dirname, 'history-pending.json'), 'utf8'));
const dir = path.join(__dirname, 'tr');
fs.mkdirSync(dir, { recursive: true });

const chunks = [];
for (let i = 0; i < src.pending.length; i += size) {
  const part = src.pending.slice(i, i + size);
  const n = chunks.length + 1;
  const name = 'chunk-' + String(n).padStart(2, '0') + '.json';
  fs.writeFileSync(path.join(dir, name), JSON.stringify(part, null, 0), 'utf8');
  chunks.push({ file: name, count: part.length, from: part[0].i, to: part[part.length - 1].i });
}
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ size: size, total: src.pending.length, chunks: chunks }, null, 2), 'utf8');

console.log(`共 ${chunks.length} 块，每块约 ${size} 条，总计 ${src.pending.length} 条`);
console.log(`输出目录：${dir}`);
console.log('前 3 块:', chunks.slice(0, 3).map((c) => `${c.file}(${c.count}条, ${c.from}-${c.to})`).join('  '));
