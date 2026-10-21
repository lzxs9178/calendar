/* 翻译结果校验与合并
 * 1. 读取 tools/tr/out/chunk-XX.json（或 .b.json 第二遍），校验序号与数量
 * 2. 两遍不一致的条目挑出来
 * 3. 全部通过后写入 tools/history-zh.json（"英文原文 → 中文"映射）与 js/history.js
 *
 * 用法：
 *   node tools/apply-translations.cjs check   只校验，不写文件
 *   node tools/apply-translations.cjs apply   校验通过后写入
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'tr');
const OUT = path.join(DIR, 'out');
const mode = process.argv[2] || 'check';

const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const pending = JSON.parse(fs.readFileSync(path.join(__dirname, 'history-pending.json'), 'utf8')).pending;
const byIndex = new Map(pending.map((p) => [p.i, p.t]));
// 反向映射：英文原文 → 全局序号（回填时用）
const byIndexReverse = new Map(pending.map((p) => [p.t, p.i]));

function loadVariant(chunkFile, variant) {
  const base = chunkFile.replace(/\.json$/, '') + (variant === 'b' ? '.b' : '') + '.json';
  const p = path.join(OUT, base);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const arr = Array.isArray(raw) ? raw : (raw.items || raw.translations || []);
    const map = new Map();
    arr.forEach((it) => {
      if (it && typeof it.i === 'number' && typeof it.zh === 'string') map.set(it.i, it.zh.trim());
    });
    return map;
  } catch (e) {
    return { error: e.message };
  }
}

let problems = [];
let missingChunks = [];
let disputed = [];
const zh = new Map();

manifest.chunks.forEach((c) => {
  const a = loadVariant(c.file, 'a');
  const b = loadVariant(c.file, 'b');
  if (!a || a.error) { missingChunks.push(c.file + '(A)'); return; }
  const source = JSON.parse(fs.readFileSync(path.join(DIR, c.file), 'utf8'));
  // 校验 A 的完整性
  const bad = source.filter((s) => !a.has(s.i) || !/[一-鿿]/.test(a.get(s.i) || ''));
  if (bad.length) problems.push(`${c.file}: ${bad.length} 条缺失或未翻译（如 i=${bad[0].i}）`);
  source.forEach((s) => { if (a.has(s.i)) zh.set(s.i, a.get(s.i)); });

  // 与 B 对比
  if (b && !b.error) {
    source.forEach((s) => {
      const x = a.get(s.i), y = b.get(s.i);
      if (!x || !y) return;
      // 差异判定：去除标点后长度差异超过 40% 视为不一致
      const nx = x.replace(/[，。、；：（）《》·,.]/g, '');
      const ny = y.replace(/[，。、；：（）《》·,.]/g, '');
      const diff = Math.abs(nx.length - ny.length) / Math.max(1, Math.max(nx.length, ny.length));
      if (diff > 0.4) disputed.push({ i: s.i, en: s.t, a: x, b: y });
    });
  }
});

console.log('块总数:', manifest.chunks.length);
console.log('缺失/读取失败的块:', missingChunks.length ? missingChunks.slice(0, 10).join(', ') + (missingChunks.length > 10 ? ' …' : '') : '无');
console.log('已获得翻译条目:', zh.size, '/', pending.length);
console.log('完整性/格式问题:', problems.length);
problems.slice(0, 10).forEach((p) => console.log('  ! ' + p));
console.log('两遍翻译明显不一致:', disputed.length);
disputed.slice(0, 8).forEach((d) => {
  console.log(`  #${d.i} ${d.en.slice(0, 60)}`);
  console.log(`      A: ${d.a.slice(0, 60)}`);
  console.log(`      B: ${d.b.slice(0, 60)}`);
});

const complete = missingChunks.length === 0 && problems.length === 0 && zh.size === pending.length;
console.log('\n是否可用于合并:', complete ? '是' : '否');

if (mode === 'apply') {
  if (!complete) { console.error('未通过校验，拒绝写入。'); process.exit(1); }
  const map = {};
  zh.forEach((v, k) => { map[k] = v; });
  fs.writeFileSync(path.join(__dirname, 'history-zh.json'), JSON.stringify(map), 'utf8');
  console.log('已写入 tools/history-zh.json');

  // 直接把中文回填进 js/history.js：把 t 换成中文，英文原文保留在 e 字段
  const jsPath = path.join(__dirname, '..', 'js', 'history.js');
  let text = fs.readFileSync(jsPath, 'utf8');
  let replaced = 0, missed = 0;
  text = text.replace(/\{y:(-?\d+),t:("(?:[^"\\]|\\.)*"),c:("(?:[^"\\]|\\.)*"),k:("(?:[^"\\]|\\.)*")(,p:1)?\}/g,
    function (whole, y, tLit, cLit, kLit, p) {
      const en = JSON.parse(tLit);
      if (/[\u4e00-\u9fff]/.test(en)) return whole;      // 已经是中文（人工精选）
      const idx = byIndexReverse.get(en);
      const zhText = idx !== undefined ? map[idx] : undefined;
      if (!zhText) { missed++; return whole; }
      replaced++;
      return '{y:' + y + ',t:' + JSON.stringify(zhText) + ',c:' + cLit + ',k:' + kLit + (p || '') + ',e:' + tLit + '}';
    });
  fs.writeFileSync(jsPath, text, 'utf8');
  console.log(`已回填中文 ${replaced} 条，未找到译文 ${missed} 条`);
  if (missed) { console.error('有条目没拿到译文，请检查。'); process.exit(1); }
}
if (disputed.length) {
  fs.writeFileSync(path.join(DIR, 'disputed.json'), JSON.stringify(disputed, null, 1), 'utf8');
  console.log('不一致清单已写入 tools/tr/disputed.json');
}
