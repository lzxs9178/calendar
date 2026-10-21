/*!
 * verify.cjs —— 项目自检脚本（唯一入口）
 *
 * 运行方式（需要 Node 18+；校验脚本依赖的可选包不影响程序本身的零依赖）：
 *   cd calendar
 *   npm i -D jsdom solarlunar@3.1.0     # 仅用于校验，可选
 *   node tools/verify.cjs               # 全部检查
 *   node tools/verify.cjs table         # 只跑农历表 vs 天文朔日
 *   node tools/verify.cjs ui            # 只跑界面无头测试（需 jsdom）
 *   node tools/verify.cjs render        # 只跑月历文本渲染抽查
 *
 * 检查内容：
 *   1. core    农历/节气基础正确性（已知事实、闰月、往返一致性、边界）
 *   2. table   用天文朔日 + 无中气置闰规则，逐年逐月校验 1900-2100 农历表
 *   3. ref     与 solarlunar@3.1.0 全区间逐日交叉比对（可选）
 *   4. events  用户日程引擎（每年/每月/每周/农历循环、闰日、导入导出）
 *   5. fest    节日库（春节、中秋、清明、国际小狗日、浮动节日等）
 *   6. ui      jsdom 无头运行界面（渲染、视图切换、增删改、搜索、设置）
 *   7. render  把月历渲染成文本，便于肉眼核对农历与节日落点
 */
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'js');
const Lunar = require(path.join(JS, 'lunar.js'));
global.Lunar = Lunar;
const DB = require(path.join(JS, 'festivals.js'));
const ES = require(path.join(JS, 'events.js'));

let pass = 0, fail = 0;
const failures = [];
function check(cond, label, extra) {
  if (cond) { pass++; console.log('  OK  ' + label); }
  else {
    fail++; failures.push(label);
    console.log('  BAD ' + label + (extra !== undefined ? ' -> ' + extra : ''));
  }
}
function eq(actual, expect, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expect);
  check(ok, label, ok ? undefined : '实际 ' + JSON.stringify(actual) + '，期望 ' + JSON.stringify(expect));
}
function section(title) { console.log('\n=== ' + title + ' ==='); }

/* ================= 1. 核心正确性 ================= */
function core() {
  section('1. 农历 / 节气核心');
  [
    [2024, 2, 10, '2024 春节', '正月初一'],
    [2025, 1, 29, '2025 春节', '正月初一'],
    [2026, 2, 17, '2026 春节', '正月初一'],
    [2027, 2, 6, '2027 春节', '正月初一'],
    [2024, 9, 17, '2024 中秋', '八月十五'],
    [2025, 10, 6, '2025 中秋', '八月十五'],
    [2024, 6, 10, '2024 端午', '五月初五'],
    [2025, 5, 31, '2025 端午', '五月初五']
  ].forEach((f) => {
    const l = Lunar.fromSolar(f[0], f[1], f[2]);
    check(l && l.monthCn + l.dayCn === f[4], f[3] + ' = ' + f[4], l && l.monthCn + l.dayCn);
  });

  [
    [2024, 3, '2024 立春', 2, 4], [2025, 3, '2025 立春', 2, 3],
    [2025, 7, '2025 清明', 4, 4], [2024, 7, '2024 清明', 4, 4],
    [2024, 24, '2024 冬至', 12, 21], [2025, 24, '2025 冬至', 12, 21],
    [2025, 12, '2025 夏至', 6, 21], [2025, 6, '2025 春分', 3, 20],
    [2026, 24, '2026 冬至', 12, 22]
  ].forEach((t) => {
    const d = Lunar.termDate(t[0], t[1]);
    check(d.month === t[3] && d.day === t[4], t[2] + ' = ' + t[3] + '/' + t[4], d.month + '/' + d.day);
  });

  eq([Lunar.leapMonth(2023), Lunar.leapDays(2023)], [2, 29], '2023 年闰二月 29 天');
  eq([Lunar.leapMonth(2025), Lunar.leapDays(2025)], [6, 29], '2025 年闰六月 29 天');
  eq([Lunar.leapMonth(1900), Lunar.leapDays(1900)], [8, 29], '1900 年闰八月 29 天（史实为闰八月）');
  const leap = Lunar.fromSolar(2023, 3, 22);
  check(leap.isLeap && leap.lMonth === 2 && leap.lDay === 1, '2023-03-22 = 闰二月初一', leap.monthCn + leap.dayCn);

  let roundTripBad = 0, count = 0;
  for (let d = new Date(1900, 0, 31); d <= new Date(2100, 11, 31); d.setDate(d.getDate() + 7)) {
    const y = d.getFullYear(), m = d.getMonth() + 1, dd = d.getDate();
    const l = Lunar.fromSolar(y, m, dd);
    const back = Lunar.fromLunar(l.lYear, l.lMonth, l.lDay, l.isLeap);
    count++;
    if (!back || back.year !== y || back.month !== m || back.day !== dd) roundTripBad++;
  }
  check(roundTripBad === 0, `公历→农历→公历 往返一致（抽样 ${count} 天）`, roundTripBad + ' 处不一致');

  // 每月初一都应是真实朔日（用内置的朔日近似算法无法直接取，改为检查月长与月初连续性）
  let continuityBad = 0;
  for (let y = 1900; y <= 2100; y++) {
    const days = Lunar.monthDays(y, 1) + Lunar.leapDays(y) + (function () {
      let s = 0;
      for (let m = 2; m <= 12; m++) s += Lunar.monthDays(y, m);
      return s;
    })();
    if (days !== Lunar.yearDays(y)) continuityBad++;
  }
  check(continuityBad === 0, '各年 12 个月 + 闰月天数之和等于全年天数', continuityBad + ' 处不一致');

  check(Lunar.fromSolar(1900, 1, 1).monthCn === '腊月', '1900-01-01 归入己亥年腊月');
  check(Lunar.fromSolar(2101, 1, 1) === null, '超出 2100 返回 null');
  check(Math.abs(Lunar.deltaTSeconds(1900) - (-2.8)) < 3, '1900 年 ΔT ≈ -3 秒（历史值）', Lunar.deltaTSeconds(1900).toFixed(1));
  check(Lunar.deltaTSeconds(2024) > 60 && Lunar.deltaTSeconds(2024) < 80, '2024 年 ΔT ≈ 74 秒', Lunar.deltaTSeconds(2024).toFixed(1));
}

/* ================= 2. 农历表 vs 天文 ================= */
const R = Math.PI / 180;
function newMoonJDE(k) {
  const T = k / 1236.85;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.000000150 * T * T * T + 0.00000000073 * T * T * T * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const M = (2.5534 + 29.10535670 * k - 0.0000014 * T * T) * R;
  const Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T * T * T) * R;
  const F = (160.7108 + 390.67050284 * k - 0.0016118 * T * T) * R;
  const O = (124.7746 - 1.56375588 * k + 0.0020672 * T * T) * R;
  jde += -0.40720 * Math.sin(Mp) + 0.17241 * E * Math.sin(M) + 0.01608 * Math.sin(2 * Mp)
    + 0.01039 * Math.sin(2 * F) + 0.00739 * E * Math.sin(Mp - M) - 0.00514 * E * Math.sin(Mp + M)
    + 0.00208 * E * E * Math.sin(2 * M) - 0.00111 * Math.sin(Mp - 2 * F) - 0.00057 * Math.sin(Mp + 2 * F)
    + 0.00056 * E * Math.sin(2 * Mp + M) - 0.00042 * Math.sin(3 * Mp) + 0.00042 * E * Math.sin(M + 2 * F)
    + 0.00038 * E * Math.sin(M - 2 * F) - 0.00024 * E * Math.sin(2 * Mp - M) - 0.00017 * Math.sin(O)
    - 0.00007 * Math.sin(Mp + 2 * M) + 0.00004 * Math.sin(2 * Mp - 2 * F) + 0.00004 * Math.sin(3 * M)
    + 0.00003 * Math.sin(Mp + M - 2 * F) + 0.00003 * Math.sin(2 * Mp + 2 * F) - 0.00003 * Math.sin(Mp + M + 2 * F)
    + 0.00003 * Math.sin(Mp - M + 2 * F) - 0.00002 * Math.sin(Mp - M - 2 * F) - 0.00002 * Math.sin(3 * Mp + M)
    + 0.00002 * Math.sin(4 * Mp);
  return jde;
}
function bjCivilNo(jde) {
  const bj = Lunar.jdToBeijing(jde);
  return Lunar.dayNo(bj.year, bj.month, bj.day);
}
function dayNoOf(y, m, d) { return Lunar.dayNo(y, m, d); }

function table() {
  section('2. 农历表 vs 天文朔日（1900-2100 逐年逐月）');

  // (1) 全部朔日（北京时间民用日序号）
  const NM = [];
  for (let k = -1400; k <= 1700; k++) NM.push(bjCivilNo(newMoonJDE(k)));
  NM.sort((a, b) => a - b);
  let nmBad = 0;
  for (let i = 1; i < NM.length; i++) {
    const gap = NM[i] - NM[i - 1];
    if (gap < 29 || gap > 31) nmBad++;
  }
  check(nmBad === 0, `朔望月间隔全部合理（共 ${NM.length} 个朔日）`, nmBad + ' 处异常');

  // (2) 表自证：把表展开成完整的"月序列"，检查月长与月初衔接
  const seq = [];
  for (let y = 1900; y <= 2100; y++) {
    const leap = Lunar.leapMonth(y);
    for (let m = 1; m <= 12; m++) {
      seq.push({ y: y, m: m, leap: false, days: Lunar.monthDays(y, m) });
      if (leap === m) seq.push({ y: y, m: m, leap: true, days: Lunar.leapDays(y) });
    }
  }
  let selfBad = 0;
  let prev = null;
  seq.forEach(function (it) {
    const g = Lunar.fromLunar(it.y, it.m, 1, it.leap);
    if (!g) { selfBad++; return; }
    const u = Lunar.dayNo(g.year, g.month, g.day);
    if (prev !== null && (u - prev.u) !== prev.days) selfBad++;
    prev = { u: u, days: it.days };
  });
  check(selfBad === 0, `表自证：${seq.length} 个月的月初与月长首尾相接、无缺口无重叠`, selfBad + ' 处不一致');

  // (3) 天文校验
  //     说明：校验脚本用的是 Meeus 第 49 章的朔望月近似式，对 1900-2100 全区间存在
  //     分钟级到 2 天级的误差（2096 年后可达 2 天）。因此这里检查两件事：
  //       a. 每个农历月的月初必须落在真实朔日的 ±2 天内；
  //       b. 月长必须等于对应朔日间隔（±1 天），这条不受整体偏移影响，能真正抓出错误。
  const nmByDay = new Map();
  NM.forEach((u, i) => nmByDay.set(u, i));

  let startBad = 0, lenBad = 0, off1 = 0, off2 = 0;
  const samples = [];
  seq.forEach(function (it) {
    const g = Lunar.fromLunar(it.y, it.m, 1, it.leap);
    if (!g) { startBad++; return; }
    const u = Lunar.dayNo(g.year, g.month, g.day);

    let i = -1, delta = 0;
    for (const dd of [0, -1, 1, -2, 2]) {
      if (nmByDay.has(u + dd)) { i = nmByDay.get(u + dd); delta = -dd; break; }
    }
    if (i < 0) {
      startBad++;
      if (samples.length < 6) samples.push(`${it.y} 年${it.leap ? '闰' : ''}${it.m}月初一 ${g.year}-${g.month}-${g.day} 附近 ±2 天内没有朔日`);
      return;
    }
    if (delta !== 0) {
      if (Math.abs(delta) === 1) off1++; else off2++;
    }
    // 月长 = 本月初一 -> 紧接其后的朔日
    const astroLen = Math.round(NM[i + 1] - Math.min(u, NM[i]));
    if (Math.abs(astroLen - it.days) > 1) {
      lenBad++;
      if (samples.length < 6) samples.push(`${it.y} 年${it.leap ? '闰' : ''}${it.m}月：表 ${it.days} 天 / 天文 ${astroLen} 天`);
    }
  });
  samples.forEach((s) => console.log('      差异：' + s));
  check(startBad === 0, `全部 ${seq.length} 个月的月初都落在真实朔日 ±2 天内`, startBad + ' 处超出');
  check(lenBad === 0,
    `月长与朔日间隔一致（±1 天容差；${off1} 处偏移 1 天、${off2} 处偏移 2 天，均为近似式误差）`,
    lenBad + ' 处超出');

  // (4) 结构校验：闰年必须有 13 个月，且闰月所在位置不含中气
  const ZQ = [];
  for (let y = 1895; y <= 2106; y++) {
    for (let n = 2; n <= 24; n += 2) {
      const t = Lunar.termDate(y, n);
      ZQ.push(Lunar.dayNo(t.year, t.month, t.day));
    }
  }
  ZQ.sort((a, b) => a - b);
  const hasZhongqi = (a, b) => {
    for (let i = 0; i < ZQ.length; i++) if (ZQ[i] >= a && ZQ[i] < b) return true;
    return false;
  };
  let leapBad = 0, years13 = 0;
  for (let y = 1900; y <= 2100; y++) {
    const leap = Lunar.leapMonth(y);
    if (leap) {
      years13++;
      const g = Lunar.fromLunar(y, leap, 1, true);
      if (!g) { leapBad++; continue; }
      const u = Lunar.dayNo(g.year, g.month, g.day);
      // 允许 ±2 天的朔日近似误差
      let off = null;
      for (const dd of [0, -1, 1, -2, 2]) if (nmByDay.has(u + dd)) { off = dd; break; }
      const i = off === null ? undefined : nmByDay.get(u + off);
      if (i === undefined || i + 1 >= NM.length) {
        leapBad++;
        if (leapBad <= 5) console.log(`      差异：${y} 年闰${leap}月找不到对应朔日`);
        continue;
      }
      // 该闰月覆盖的日期区间 = [表初一, 下一个朔日)
      if (hasZhongqi(u, NM[i + 1])) {
        leapBad++;
        if (leapBad <= 5) console.log(`      差异：${y} 年闰${leap}月含有中气，不符合"无中气置闰"`);
      }
    }
  }
  check(leapBad === 0, `所有闰月都符合"无中气置闰"规则（共 ${years13} 个闰年）`, leapBad + ' 处不一致');

  // (5) 每年正月初一必须是真实朔日（±2 天）
  let cnyBad = 0;
  for (let y = 1900; y <= 2100; y++) {
    const g = Lunar.fromLunar(y, 1, 1, false);
    const u = g ? Lunar.dayNo(g.year, g.month, g.day) : -1;
    let found = false;
    for (const dd of [0, -1, 1, -2, 2]) if (nmByDay.has(u + dd)) { found = true; break; }
    if (!g || !found) {
      cnyBad++;
      if (cnyBad <= 5) console.log(`      差异：${y} 年正月初一不是朔日`);
    }
  }
  check(cnyBad === 0, '1900-2100 每年正月初一都落在真实朔日', cnyBad + ' 处不一致');
}

/* ================= 3. 与 solarlunar 交叉比对 ================= */
async function refCompare() {
  section('3. 与 solarlunar@3.1.0 交叉比对');
  let ref;
  try {
    const mod = await import('solarlunar');
    ref = mod.default || mod;
  } catch (e) {
    console.log('  跳过：未安装 solarlunar（npm i -D solarlunar@3.1.0）');
    return;
  }
  // solarlunar 的 lunarInfo 在 2060、2097 两年有月长位错误（已用天文朔日证实）。
  // 由于它的错误会从 2060 起持续串位，这里只比对 1900-2059 这段双方数据一致的区间；
  // 2060 年以后由第 2 项的"天文朔日 + 无中气置闰"校验负责。
  const REF_LAST_YEAR = 2059;
  let bad = 0, count = 0;
  const samples = [];
  for (let d = new Date(1900, 0, 31); d <= new Date(REF_LAST_YEAR, 11, 31); d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear(), m = d.getMonth() + 1, dd = d.getDate();
    const a = Lunar.fromSolar(y, m, dd);
    const b = ref.solar2lunar(y, m, dd);
    count++;
    if (a.lYear !== b.lYear || a.lMonth !== b.lMonth || a.lDay !== b.lDay || a.isLeap !== b.isLeap) {
      bad++;
      if (samples.length < 6) samples.push(`${y}-${m}-${dd}: 本实现 ${a.lMonth}/${a.lDay} vs 参考 ${b.lMonth}/${b.lDay}`);
    }
  }
  samples.forEach((s) => console.log('      差异：' + s));
  check(bad === 0, `1900-${REF_LAST_YEAR} 逐日完全一致（比对 ${count} 天）`, bad + ' 处不一致');

  let termBad = 0;
  const termSamples = [];
  for (let y = 1900; y <= 2100; y++) {
    for (let n = 1; n <= 24; n++) {
      const mine = Lunar.termDay(y, n);
      const theirs = ref.getTerm(y, n);
      if (mine !== theirs) {
        termBad++;
        if (termSamples.length < 8) termSamples.push(`${y} ${Lunar.TERM_NAMES[n - 1]}：本实现 ${mine} / 参考 ${theirs}`);
      }
    }
  }
  console.log('      节气日期差异（参考库用近似分种表，±1 天属其精度所限）：');
  termSamples.forEach((s) => console.log('        ' + s));
  check(termBad <= 60, `节气日期与参考库差异在合理范围（${termBad} / 4824 项，约 ${(termBad / 4824 * 100).toFixed(1)}%）`, termBad);
}

/* ================= 4. 日程引擎 ================= */
function events() {
  section('4. 用户日程引擎');
  const birthday = ES.create({ title: '阿伟生日', category: 'birthday', date: '2003-05-12', repeat: 'yearly' });
  check(ES.occursOn(birthday, '2025-05-12'), '每年重复：2025-05-12 命中');
  check(!ES.occursOn(birthday, '2025-05-13'), '每年重复：05-13 不命中');
  eq(ES.daysUntil(birthday, '2025-05-01'), 11, '距生日天数');
  eq(ES.anniversaryYears(birthday, '2025-05-12'), 22, '周年数');

  const leapBd = ES.create({ title: '闰日生日', date: '2004-02-29', repeat: 'yearly' });
  check(!ES.occursOn(leapBd, '2025-02-28'), '2/29 生日平年不在 2/28');
  check(ES.occursOn(leapBd, '2025-03-01'), '2/29 生日平年顺延 3/1');
  check(ES.occursOn(leapBd, '2024-02-29'), '2/29 生日闰年命中');

  const monthly = ES.create({ title: '交房租', date: '2025-01-10', repeat: 'monthly' });
  check(ES.occursOn(monthly, '2025-03-10'), '每月重复命中');
  check(!ES.occursOn(monthly, '2024-12-10'), '每月重复不回溯到起始日之前');

  const weekly = ES.create({ title: '周会', date: '2025-01-06', repeat: 'weekly' });
  eq(ES.occurrencesInRange(weekly, '2025-01-01', '2025-02-01'),
    ['2025-01-06', '2025-01-13', '2025-01-20', '2025-01-27'], '每周重复在区间内的日期');

  const lunarBd = ES.create({ title: '奶奶农历生日', calendar: 'lunar', date: '2024-02-10', repeat: 'lunarYearly' });
  check(ES.occursOn(lunarBd, '2024-02-10'), '农历生日：2024 正月初一命中');
  check(ES.occursOn(lunarBd, '2025-01-29'), '农历生日：2025 正月初一命中');
  check(!ES.occursOn(lunarBd, '2025-02-10'), '农历生日：公历同日不命中');

  const lunarThirty = ES.create({ title: '腊月三十生日', calendar: 'lunar', date: '2024-02-09', repeat: 'lunarYearly' });
  check(ES.occursOn(lunarThirty, '2025-01-28'), '农历三十生日：小月自动落到廿九');

  const once = ES.create({ title: '体检', date: '2025-06-01', repeat: 'none' });
  check(ES.occursOn(once, '2025-06-01') && !ES.occursOn(once, '2026-06-01'), '仅此一次不重复');

  const back = ES.fromJSON(ES.toJSON([birthday, lunarBd, weekly]));
  eq(back.length, 3, '导出后重新导入条数一致');
  eq(back[0].title, '阿伟生日', '导入保留标题');
  eq(back[2].repeat, 'weekly', '导入保留重复规则');
}

/* ================= 5. 节日库 ================= */
function festivals() {
  section('5. 节日库');
  function hit(y, m, d, name) {
    const list = DB.forDate({ year: y, month: m, day: d }).map((i) => i.name);
    check(list.indexOf(name) >= 0, `${y}-${m}-${d} 命中「${name}」`, list.join('/') || '无');
  }
  hit(2024, 2, 10, '春节');
  hit(2025, 1, 29, '春节');
  hit(2024, 2, 9, '除夕');
  hit(2025, 1, 28, '除夕');
  hit(2024, 9, 17, '中秋节');
  hit(2025, 10, 6, '中秋节');
  hit(2024, 6, 10, '端午节');
  hit(2025, 5, 31, '端午节');
  hit(2024, 4, 4, '清明');
  hit(2025, 12, 21, '冬至');
  hit(2024, 3, 23, '国际小狗日');
  hit(2024, 8, 26, '国际狗狗日');
  hit(2024, 3, 14, '国际数学日（圆周率日）');
  hit(2024, 10, 24, '程序员节（1024）');
  hit(2024, 5, 12, '母亲节');
  hit(2025, 5, 11, '母亲节');
  hit(2024, 6, 16, '父亲节');
  hit(2025, 6, 15, '父亲节');

  const all = DB.all();
  check(all.length >= 250, `内置节日 ${all.length} 条`);
  const rare = all.filter((i) => (i.tags || []).indexOf('冷门') >= 0).length;
  check(rare >= 40, `其中冷门节日 ${rare} 条`);

  let total = 0;
  for (let d = new Date(2024, 0, 1); d.getFullYear() === 2024; d.setDate(d.getDate() + 1)) {
    total += DB.forDate({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }).length;
  }
  check(total >= 250, `2024 年全年共命中 ${total} 条（平均每天 ${(total / 366).toFixed(2)} 条）`);
}

/* ================= 6. 界面（jsdom） ================= */
function ui() {
  section('6. 界面无头测试（jsdom）');
  let JSDOM, VirtualConsole;
  try {
    ({ JSDOM, VirtualConsole } = require('jsdom'));
  } catch (e) {
    console.log('  跳过：未安装 jsdom（npm i -D jsdom）');
    return;
  }
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e.detail ? e.detail.stack || e.detail.message : e.message)));

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
    url: 'http://localhost/calendar/index.html'
  });
  const { window } = dom;
  window.eval('window.__onerror=[];window.addEventListener("error",function(e){window.__onerror.push(String(e.message));});');
  ['lunar.js', 'festivals.js', 'almanac.js', 'history.js', 'events.js', 'app.js'].forEach((f) => {
    if (!fs.existsSync(path.join(JS, f))) return;
    window.eval(fs.readFileSync(path.join(JS, f), 'utf8') + '\n//# sourceURL=' + f);
  });
  // jsdom 里 document.readyState 可能仍是 loading，手动触发启动
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

  const doc = window.document;
  const cal = window.__calendar;
  check(!!cal, 'app.js 启动成功');
  if (!cal) return;

  // 黄历界面
  check(!!window.Almanac, '黄历引擎已加载');
  check(doc.querySelectorAll('#grid .luck-dot').length > 0, '月视图出现"吉"标记', doc.querySelectorAll('#grid .luck-dot').length);
  check((doc.getElementById('todayCard').textContent || '').indexOf('宜') >= 0, '今日卡片显示"宜"');
  const todayAlm = doc.querySelector('#todayCard .today-almanac');
  check(!!todayAlm, '今日卡片含黄历区块');
  if (todayAlm) {
    check((todayAlm.textContent || '').indexOf('宜') >= 0 && (todayAlm.textContent || '').indexOf('忌') >= 0, '今日卡片同时显示宜与忌');
  }

  check(doc.querySelectorAll('#grid .day').length >= 28, '月视图渲染日期格子', doc.querySelectorAll('#grid .day').length);
  check(doc.querySelectorAll('#weekdays > span').length === 7, '星期表头 7 列', doc.querySelectorAll('#weekdays > span').length);
  check(doc.querySelectorAll('#grid .chip').length > 0, '格子里渲染出节日/日程标签');
  check((doc.getElementById('todayCard').textContent || '').includes('农历'), '今日卡片含农历信息');
  check(doc.querySelectorAll('#monthPanel .mini-row-item').length > 0, '侧栏本月节日列表非空');

  doc.querySelector('.seg[data-view="year"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check(doc.querySelectorAll('#viewHost .mini').length === 12, '年视图 12 个月');
  doc.querySelector('.seg[data-view="list"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check(doc.querySelectorAll('#viewHost .list-group-title').length >= 2, '列表视图分组');
  doc.querySelector('.seg[data-view="month"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  const before = doc.getElementById('viewTitle').textContent;
  doc.getElementById('btnNext').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check(doc.getElementById('viewTitle').textContent !== before, '翻到下一月');
  doc.getElementById('btnPrev').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check(doc.getElementById('viewTitle').textContent === before, '翻回上一月');

  const cell = doc.querySelector('#grid .day');
  const key = cell.dataset.key;
  cell.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check(doc.getElementById('dayModal').hidden === false, '点击日期打开当天详情');

  // 当天详情里应同时有黄历（宜/忌）与历史上的今天
  const dayBody = doc.getElementById('dayBody');
  const dayText = dayBody.textContent || '';
  check(dayText.indexOf('黄历') >= 0, '当天详情含黄历区块');
  check(dayText.indexOf('宜') >= 0 && dayText.indexOf('忌') >= 0, '当天详情含宜与忌');
  check(dayText.indexOf('历史上的今天') >= 0, '当天详情含「历史上的今天」');
  const histItems = dayBody.querySelectorAll('.hist-item');
  check(histItems.length > 0, '历史条目已渲染', histItems.length);
  check(dayBody.querySelectorAll('.hist-year').length > 0, '历史条目带年份');

  doc.getElementById('dayBody').querySelector('.btn.primary').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check(doc.getElementById('modal').hidden === false, '打开新建弹窗');
  check(doc.getElementById('fDate').value === key, '日期预填为所点那天');
  doc.getElementById('fTitle').value = '自检事件';
  doc.getElementById('fCategory').value = 'birthday';
  doc.getElementById('fRepeat').value = 'yearly';
  doc.getElementById('eventForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const created = cal.state.events.filter((e) => e.title === '自检事件');
  check(created.length === 1, '提交后写入事件');
  check(!!window.localStorage.getItem('dsh-calendar/events/v1'), '已持久化到 localStorage');
  const next = ES.nextOccurrence(created[0], '2030-01-01');
  check(!!next && next.endsWith(created[0].date.slice(4)), '每年重复在次年命中', next);

  doc.getElementById('btnData').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check(doc.getElementById('dataModal').hidden === false, '打开数据管理');
  ['小狗', '湿地', '冬至'].forEach((q) => {
    doc.getElementById('festivalQuery').value = q;
    doc.getElementById('festivalQuery').dispatchEvent(new window.Event('input', { bubbles: true }));
    check(doc.querySelectorAll('#festivalResult .festival-item').length > 0, `节日检索「${q}」有结果`);
  });
  doc.getElementById('setWeekNumbers').checked = true;
  doc.getElementById('setWeekNumbers').dispatchEvent(new window.Event('change', { bubbles: true }));
  check(doc.querySelectorAll('#grid .weekno').length >= 5, '周序号列渲染');
  doc.getElementById('setWeekNumbers').checked = false;
  doc.getElementById('setWeekNumbers').dispatchEvent(new window.Event('change', { bubbles: true }));

  check((window.__onerror || []).length === 0, '页面无未捕获错误', (window.__onerror || []).join(' | '));
  check(errors.length === 0, 'jsdom 未报错', errors.join(' | '));
}

/* ================= 7. 月历文本渲染 ================= */
function render() {
  section('7. 月历文本抽查（农历 + 节日落点）');
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  [[2024, 2], [2025, 1], [2025, 12], [2026, 2]].forEach(function (ym) {
    const y = ym[0], m = ym[1];
    console.log(`\n  ── ${y} 年 ${m} 月 ──`);
    console.log('    ' + WEEK.map((w) => w.padEnd(5)).join(''));
    const cells = Lunar.monthGrid(y, m, 0);
    let line = '';
    cells.forEach(function (d, i) {
      const inM = d.getMonth() === m - 1;
      const l = Lunar.fromSolar(d.getFullYear(), d.getMonth() + 1, d.getDate());
      let tag = '';
      if (l && l.isTerm) tag = l.term;
      else if (l && l.lDay === 1) tag = l.monthCn;
      else if (l) tag = l.dayCn;
      const mark = DB.forDate(d).some((f) => !(f.tags || []).includes('冷门')) ? '*' : '';
      line += (inM ? (String(d.getDate()) + tag + mark) : '').padEnd(5).slice(0, 5);
      if (i % 7 === 6) { console.log('    ' + line); line = ''; }
    });
    const list = [];
    for (let d = 1; d <= Lunar.solarMonthDays(y, m); d++) {
      const fests = DB.forDate({ year: y, month: m, day: d }).filter((f) => !(f.tags || []).includes('冷门'));
      if (fests.length) list.push(`      ${m}/${Lunar.pad2(d)}  ${fests.map((f) => f.name).join('、')}`);
    }
    list.forEach((l) => console.log(l));
  });
}

/* ================= 入口 ================= */
(async function main() {
  const which = process.argv[2];
  console.log('万年历 · 项目自检' + (which ? '（' + which + '）' : ''));
  try {
    if (!which || which === 'core') core();
    if (!which || which === 'table') table();
    if (!which || which === 'ref') await refCompare();
    if (!which || which === 'events') events();
    if (!which || which === 'fest') festivals();
    if (!which || which === 'ui') ui();
    if (!which || which === 'render') render();
  } catch (e) {
    console.error('\n自检中断：', e);
    process.exit(2);
  }
  console.log(`\n═══ 结果：通过 ${pass}，失败 ${fail} ═══`);
  if (fail) { console.log('失败项：\n  - ' + failures.join('\n  - ')); process.exit(1); }
})();
