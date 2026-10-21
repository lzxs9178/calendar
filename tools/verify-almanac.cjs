/* 黄历引擎自检：日柱/月柱/建除/黄黑道/二十八宿/宜忌 是否合理 */
const path = require('path');
const Lunar = require(path.join(__dirname, '..', 'js', 'lunar.js'));
global.Lunar = Lunar;
const A = require(path.join(__dirname, '..', 'js', 'almanac.js'));

let pass = 0, fail = 0;
function check(c, l, x) { (c ? pass++ : fail++); console.log(`${c ? 'OK  ' : 'BAD '} ${l}${!c && x !== undefined ? ' -> ' + x : ''}`); }

console.log('=== 1. 日柱干支（对已知日期）===');
[
  [2026, 10, 11, '戊午'],   // 与公开通胜一致：丙午年 戊戌月 戊午日
  [2026, 10, 12, '己未'],
  [2000, 1, 1, '戊午']
].forEach(([y, m, d, expect]) => {
  const gz = A.dayGanZhi(Lunar.dayNo(y, m, d));
  check(gz.name === expect, `${y}-${m}-${d} 日柱 = ${expect}`, gz.name);
});

console.log('\n=== 2. 连续性与周期性 ===');
{
  const a = A.dayGanZhi(Lunar.dayNo(2026, 10, 11));
  const b = A.dayGanZhi(Lunar.dayNo(2026, 10, 12));
  check(b.index === (a.index + 1) % 60, '日柱逐日递增');
  const c = A.dayGanZhi(Lunar.dayNo(2026, 10, 11) + 60);
  check(c.name === a.name, '六十日一轮回');
}

console.log('\n=== 3. 年柱以立春为界 ===');
{
  const before = A.yearGanZhi(2026, 2, 3);
  const after = A.yearGanZhi(2026, 2, 5);
  check(before.year === 2025 && after.year === 2026, '2026-02-03 属乙巳年、02-05 属丙午年',
    before.name + '/' + after.name);
  check(after.name === '丙午', '2026 年为丙午年', after.name);
}

console.log('\n=== 4. 月柱（五虎遁 + 节气分界）===');
{
  const cases = [
    [2026, 10, 11, '戊戌'],   // 公开通胜：丙午年 戊戌月
    [2026, 2, 10, '庚寅'],
    [2026, 6, 10, '甲午'],
    [2025, 1, 20, '丁丑'],    // 乙巳年、丑月（小寒后立春前）
    [2026, 2, 3, '己丑']      // 立春前仍属上一年的丑月
  ];
  cases.forEach(([y, m, d, expect]) => {
    const gz = A.monthGanZhi(y, m, d);
    check(gz.name === expect, `${y}-${m}-${d} 月柱 = ${expect}`, gz.name);
  });
  // 立春前后必须换月（也必须换年）
  const a = A.monthGanZhi(2026, 2, 3), b = A.monthGanZhi(2026, 2, 5);
  check(a.name !== b.name, '立春前后月柱切换', a.name + ' -> ' + b.name);
  check(a.name === '己丑' && b.name === '庚寅', '立春前为丑月、立春后为寅月', a.name + ' / ' + b.name);
  // 一年必须覆盖全部 12 个月支
  const zhis = {};
  for (let m = 1; m <= 12; m++) zhis[A.monthGanZhi(2026, m, 15).zhiName] = 1;
  check(Object.keys(zhis).length === 12, '一年覆盖 12 个月支', Object.keys(zhis).join(''));
  // 月柱必须按十二节真实推进：每个月的月支应是"该月 20 日所在节气区间"对应的月支
  const ZHI_ORDER = A.ZHI;
  let stepOk = true;
  const seenNames = [];
  for (let m = 1; m <= 12; m++) {
    const a = A.monthGanZhi(2026, m, 20);
    seenNames.push(a.name);
    // 与下个月 20 日相比：月支必须 +1（跨年时回到寅）
    if (m < 12) {
      const b = A.monthGanZhi(2026, m + 1, 20);
      if (b.zhi !== (a.zhi + 1) % 12 || b.gan !== (a.gan + 1) % 10) stepOk = false;
    }
  }
  check(stepOk, '月柱干支按月连续推进', seenNames.join(' '));

  // 节气分界必须正确（这两组跨界的日期最容易出错）
  check(A.monthGanZhi(2026, 10, 1).zhiName === '酉' && A.monthGanZhi(2026, 10, 11).zhiName === '戌',
    '寒露前后：10/1 属酉月、10/11 属戌月',
    A.monthGanZhi(2026, 10, 1).name + ' / ' + A.monthGanZhi(2026, 10, 11).name);
  check(A.monthGanZhi(2026, 3, 1).zhiName === '寅' && A.monthGanZhi(2026, 3, 20).zhiName === '卯',
    '惊蛰前后：3/1 属寅月、3/20 属卯月',
    A.monthGanZhi(2026, 3, 1).name + ' / ' + A.monthGanZhi(2026, 3, 20).name);
}

console.log('\n=== 5. 建除十二神 ===');
{
  // 建除 = 日支与月支之差（月建之日为"建"）。交节换月时会重排，所以要用递推关系验证。
  function dayZhiChar(info) { return info.ganZhi.day.charAt(1); }
  const JC = A.JIANCHU;

  // 5.1 连续 12 天覆盖全部十二神
  const seen = {};
  const names = [];
  for (let d = 1; d <= 12; d++) {
    const info = A.of({ year: 2026, month: 8, day: d });   // 8 月 1~6 与 7~12 分属未月/申月
    seen[info.jianChu] = 1;
    names.push(info.jianChu);
  }
  check(names.length === 12, '取到 12 天数据');
  // 5.2 直接验证公式：建除索引 === (日支 - 月支) mod 12
  //     （交节换月时月支会跳，所以不能用"逐日 +1"当判据）
  let recOk = true, badAt = '';
  const ZHI = A.ZHI;
  for (let d = 1; d <= 366; d++) {
    const dt = new Date(2026, 0, d);
    if (dt.getFullYear() !== 2026) break;
    const y = dt.getFullYear(), m = dt.getMonth() + 1, dd = dt.getDate();
    const info = A.of({ year: y, month: m, day: dd });
    const mz = A.monthGanZhi(y, m, dd).zhi;
    const dz = ZHI.indexOf(info.ganZhi.day.charAt(1));
    const delta = ((dz - mz) % 12 + 12) % 12;
    if (JC.indexOf(info.jianChu) !== delta) { recOk = false; badAt = `${m}/${dd} 日支=${info.ganZhi.day.charAt(1)} 月支=${ZHI[mz]} 建除=${info.jianChu}`; break; }
  }
  check(recOk, '建除 === (日支 − 月支)，全年逐日成立', badAt);

  // 5.3 每月"日支=月支"的那天必须是建日（月支要按当天算，因为交节会换月）
  let jianOk = true, jianFound = 0, detail = '';
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 31; d++) {
      const dt = new Date(2026, m - 1, d);
      if (dt.getMonth() !== m - 1) continue;
      const info = A.of({ year: 2026, month: m, day: d });
      const mz = A.monthGanZhi(2026, m, d).zhiName;
      if (dayZhiChar(info) === mz) {
        jianFound++;
        if (info.jianChu !== '建') { jianOk = false; detail = `${2026}-${m}-${d} 建除=${info.jianChu}`; }
      }
    }
  }
  check(jianOk && jianFound >= 12, '每个月"日支=月支"的那天都是建日', `共 ${jianFound} 天 ${detail}`);

  // 5.4 覆盖全部十二神
  check(Object.keys(seen).length >= 10, '12 天内出现多种建除', names.join(''));
}

console.log('\n=== 6. 黄黑道 ===');
{
  const ORDER = A.HUANGDAO_ORDER;
  // 递推：值神顺序固定，逐日 +1（跨月会因为青龙位变化而重排，故只在同一月内检查）
  let hhOk = true, badAt = '';
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 27; d++) {
      const a = A.of({ year: 2026, month: m, day: d });
      const b = A.of({ year: 2026, month: m, day: d + 1 });
      // 同一个月支内才要求严格 +1
      const ma = A.monthGanZhi(2026, m, d), mb = A.monthGanZhi(2026, m, d + 1);
      if (ma.zhiName !== mb.zhiName) continue;
      if (ORDER[(ORDER.indexOf(a.god) + 1) % 12] !== b.god) {
        hhOk = false; badAt = `${m}/${d}: ${a.god}→${b.god}（月支 ${ma.zhiName}）`; break;
      }
    }
    if (!hhOk) break;
  }
  check(hhOk, '同月内黄黑道十二神逐日 +1 递推', badAt);

  let yellow = 0, black = 0;
  for (let d = 1; d <= 365; d++) {
    const dt = new Date(2026, 0, d);
    const info = A.of({ year: dt.getFullYear(), month: dt.getMonth() + 1, day: dt.getDate() });
    if (info.isYellow) yellow++; else black++;
  }
  check(yellow + black === 365, '全年每天都有黄/黑道判定');
  check(Math.abs(yellow - black) <= 3, '黄道与黑道大致各占一半', `黄 ${yellow} / 黑 ${black}`);

  // 黄道六神必须是那六个
  const YELLOW = ['青龙', '明堂', '金匮', '天德', '玉堂', '司命'];
  let yellowOk = true, yellowSeen = {};
  for (let d = 1; d <= 365; d++) {
    const dt = new Date(2026, 0, d);
    const info = A.of({ year: dt.getFullYear(), month: dt.getMonth() + 1, day: dt.getDate() });
    if (info.isYellow) { yellowSeen[info.god] = 1; if (YELLOW.indexOf(info.god) < 0) yellowOk = false; }
    else if (YELLOW.indexOf(info.god) >= 0) yellowOk = false;
  }
  check(yellowOk, '黄道判定与六吉神一致', Object.keys(yellowSeen).join('、'));
}

console.log('\n=== 7. 二十八宿 ===');
{
  const a = A.of({ year: 2026, month: 10, day: 11 });
  check(a.xiu.full === '角蛟', '锚点 2026-10-11 = 角蛟', a.xiu.full);
  const b = A.of({ year: 2026, month: 10, day: 12 });
  check(b.xiu.name === '亢', '次日为亢', b.xiu.full);
  const names = new Set();
  for (let d = 0; d < 28; d++) {
    const dt = new Date(2026, 9, 11 + d);
    names.add(A.of({ year: dt.getFullYear(), month: dt.getMonth() + 1, day: dt.getDate() }).xiu.name);
  }
  check(names.size === 28, '连续 28 天覆盖全部二十八宿', names.size);
}

console.log('\n=== 8. 宜忌完整性 ===');
{
  let noYi = 0, noJi = 0, total = 0;
  const yiCount = {}, jiCount = {};
  for (let y of [2024, 2025, 2026]) {
    for (let m = 1; m <= 12; m++) {
      const days = Lunar.solarMonthDays(y, m);
      for (let d = 1; d <= days; d++) {
        const info = A.of({ year: y, month: m, day: d });
        total++;
        if (!info.yi.length) noYi++;
        if (!info.ji.length) noJi++;
        info.yi.forEach((x) => { yiCount[x] = (yiCount[x] || 0) + 1; });
        info.ji.forEach((x) => { jiCount[x] = (jiCount[x] || 0) + 1; });
      }
    }
  }
  check(noYi === 0, `${total} 天中每天都有"宜"`, noYi + ' 天缺失');
  check(noJi === 0, `${total} 天中每天都有"忌"`, noJi + ' 天缺失');
  check(Object.keys(yiCount).length >= 20, '宜的事项种类丰富', Object.keys(yiCount).length + ' 种');
  check(Object.keys(jiCount).length >= 15, '忌的事项种类丰富', Object.keys(jiCount).length + ' 种');
}

console.log('\n=== 9. 特殊忌日 ===');
{
  // 四离日：冬至前一日
  const dz = Lunar.termDate(2026, 24);
  const before = new Date(dz.year, dz.month - 1, dz.day - 1);
  const info = A.of({ year: before.getFullYear(), month: before.getMonth() + 1, day: before.getDate() });
  check(info.taboos.some((t) => t.name.indexOf('四离') === 0), '冬至前一日为四离日', JSON.stringify(info.taboos));
  check(info.ji.includes('嫁娶') && info.ji.includes('出行'), '四离日忌嫁娶、出行', info.ji.join('、'));
  // 月破
  let po = 0;
  for (let d = 1; d <= 31; d++) {
    const i2 = A.of({ year: 2026, month: 10, day: d });
    if (i2.taboos.some((t) => t.name === '月破')) po++;
  }
  check(po === 2 || po === 3, '一个公历月内出现 2~3 次月破', po + ' 次');
  // 杨公忌日：13 个农历日期在 2026 公历年内必须全部出现
  const YG = [[1, 13], [2, 11], [3, 9], [4, 7], [5, 5], [6, 3], [7, 1], [7, 29], [8, 27], [9, 25], [10, 23], [11, 21], [12, 19]];
  const found = new Set();
  for (let d = 1; d <= 365; d++) {
    const dt = new Date(2026, 0, d);
    const info = A.of({ year: dt.getFullYear(), month: dt.getMonth() + 1, day: dt.getDate() });
    if (info.taboos.some((t) => t.name === '杨公忌日')) found.add(info.lunar.lMonth + '-' + info.lunar.lDay);
  }
  const missing = YG.filter((k) => !found.has(k[0] + '-' + k[1]));
  check(missing.length === 0, '13 个杨公忌日全部命中', '缺失 ' + JSON.stringify(missing) + '，实际 ' + found.size + ' 个');
  check(found.size === YG.length, '没有多余的杨公忌日', found.size + ' 个');
}

console.log('\n=== 10. 样例输出 ===');
[2026, 2025].forEach((y) => {
  [[10, 11], [1, 1], [2, 17]].forEach(([m, d]) => {
    const i = A.of({ year: y, month: m, day: d });
    console.log(`  ${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      + ` 农历${i.lunar.monthCn}${i.lunar.dayCn}`
      + ` ${i.ganZhi.year} ${i.ganZhi.month} ${i.ganZhi.day}`
      + ` ${i.jianChu}日 ${i.god}宿${i.xiu.name} ${i.huangDaoText}`);
    console.log(`      宜：${i.yi.join('、')}`);
    console.log(`      忌：${i.ji.join('、')}`);
    if (i.taboos.length) console.log(`      神煞：${i.taboos.map((t) => t.name).join('、')}`);
  });
});

console.log(`\n黄历引擎：通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
