/* "历史上的今天"数据自检
 * 1. 覆盖：366 天（含 2/29）是否都有数据
 * 2. 结构：年份、描述、类别、类型是否合法
 * 3. 筛选：是否确实剔除了娱乐/体育类人物，是否限制在合理年份范围
 * 4. 质量：抽样打印，便于人工核对
 */
const path = require('path');
const HD = require(path.join(__dirname, '..', 'js', 'history.js'));

let pass = 0, fail = 0;
function check(c, l, x) { (c ? pass++ : fail++); console.log(`${c ? 'OK  ' : 'BAD '} ${l}${!c && x !== undefined ? ' -> ' + x : ''}`); }

console.log('=== 1. 覆盖情况 ===');
const monthDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const missing = [];
let total = 0;
for (let m = 1; m <= 12; m++) {
  for (let d = 1; d <= monthDays[m - 1]; d++) {
    const arr = HD.of(m, d);
    if (!arr.length) missing.push(m + '/' + d);
    total += arr.length;
  }
}
check(missing.length === 0, '366 天每天都有历史事件', missing.length ? '缺失 ' + missing.slice(0, 10).join(',') : '');
check(total > 2000, `总条目数 ${total}`, total);

const perDay = [];
for (let m = 1; m <= 12; m++) for (let d = 1; d <= monthDays[m - 1]; d++) perDay.push(HD.of(m, d).length);
const min = Math.min(...perDay), max = Math.max(...perDay);
const avg = (total / 366).toFixed(1);
console.log(`  每天：平均 ${avg} 条，最少 ${min}，最多 ${max}`);
check(min >= 5, `每天至少 5 条（实际最少 ${min}）`);
check(max <= 22, `每天不超过 22 条（实际最多 ${max}）`);

console.log('\n=== 2. 字段合法性 ===');
let badField = 0, badYear = 0, badType = 0, badText = 0;
const cats = {}, kinds = {};
for (let m = 1; m <= 12; m++) {
  for (let d = 1; d <= monthDays[m - 1]; d++) {
    HD.of(m, d).forEach((e) => {
      if (typeof e.y !== 'number' || typeof e.t !== 'string' || typeof e.c !== 'string' || typeof e.k !== 'string') badField++;
      // 人工精选里含公元前事件（孔子 −551、凯撒 −44、玛雅纪元 −3114），用负数年份表示
      if (!(e.y > -8000 && e.y <= 2030)) badYear++;
      if (['event', 'birth', 'death'].indexOf(e.k) < 0) badType++;
      if (!e.t || e.t.length < 3) badText++;   // 中文里最短的合法条目是「宋太祖」这类三字名
      cats[e.c] = (cats[e.c] || 0) + 1;
      kinds[e.k] = (kinds[e.k] || 0) + 1;
    });
  }
}
check(badField === 0, '所有条目字段类型正确', badField);
check(badYear === 0, '年份都在合理范围内', badYear);
check(badType === 0, '类型只有 event/birth/death', badType);
check(badText === 0, '描述均非空', badText);
console.log('  按类别:', JSON.stringify(cats));
console.log('  按类型:', JSON.stringify(kinds));

console.log('\n=== 2b. 是否全部为中文 ===');
let stillEnglish = 0;
const englishSamples = [];
for (let m = 1; m <= 12; m++) {
  for (let d = 1; d <= monthDays[m - 1]; d++) {
    HD.of(m, d).forEach((e) => {
      if (!/[\u4e00-\u9fff]/.test(e.t)) { stillEnglish++; if (englishSamples.length < 5) englishSamples.push(m + '/' + d + ' ' + e.t.slice(0, 50)); }
    });
  }
}
englishSamples.forEach((x) => console.log('    × ' + x));
check(stillEnglish === 0, '全部条目已翻译为中文', stillEnglish + ' 条仍为英文');

console.log('\n=== 3. 筛选规则是否生效 ===');
const ENTERTAINMENT = ['actor', 'actress', 'singer', 'songwriter', 'musician', 'rapper', 'footballer',
  'soccer player', 'basketball player', 'baseball player', 'cricketer', 'tennis player', 'golfer',
  'boxer', 'racing driver', 'professional wrestler', 'model', 'comedian', 'television presenter'];
let dirtyCount = 0;
const dirtySamples = [];
for (let m = 1; m <= 12; m++) {
  for (let d = 1; d <= monthDays[m - 1]; d++) {
    HD.of(m, d).forEach((e) => {
      if (e.k !== 'birth' && e.k !== 'death') return;
      const t = e.t.toLowerCase();
      if (ENTERTAINMENT.some((w) => t.indexOf(w) >= 0)) {
        dirtyCount++;
        if (dirtySamples.length < 6) dirtySamples.push(`${m}/${d} ${e.y} ${e.t.slice(0, 60)}`);
      }
    });
  }
}
if (dirtySamples.length) dirtySamples.forEach((s) => console.log('    × ' + s));
check(dirtyCount === 0, '诞辰/忌日里没有娱乐体育类明星', dirtyCount + ' 条');

// 当代人物（1940 年后出生）不应出现在【自动抓取】的诞辰里；
// 人工精选条目（p:1，如乔布斯）是特意保留的
let modernBirth = 0;
for (let m = 1; m <= 12; m++) {
  for (let d = 1; d <= monthDays[m - 1]; d++) {
    HD.of(m, d).forEach((e) => { if (e.k === 'birth' && e.y > 1940 && !e.p) modernBirth++; });
  }
}
check(modernBirth === 0, '自动抓取的诞辰不含 1940 年后出生的当代人物', modernBirth + ' 条');

// 人工精选必须真的生效
let curated = 0;
for (let m = 1; m <= 12; m++) {
  for (let d = 1; d <= monthDays[m - 1]; d++) {
    HD.of(m, d).forEach((e) => { if (e.p) curated++; });
  }
}
check(curated >= 300, `人工精选条目已并入（${curated} 条）`, curated);

console.log('\n=== 4. 抽样核对 ===');
[[10, 11], [1, 1], [7, 4], [12, 25]].forEach(([m, d]) => {
  console.log(`\n  ── ${m} 月 ${d} 日 ──`);
  HD.of(m, d).slice(0, 8).forEach((e) => {
    const kind = e.k === 'birth' ? '[诞辰]' : (e.k === 'death' ? '[忌日]' : '');
    console.log(`    ${String(e.y).padStart(5)}  ${kind}${e.c}  ${e.t.slice(0, 78)}`);
  });
});

console.log(`\n历史数据：通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
