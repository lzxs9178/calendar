/* 导出待翻译条目 → tools/history-pending.json
 * 结构：{ days: { "m-d": [ {y, t, c, k, p?} ] }, pending: [ {i, t} ... ] }
 * 只导出不含中文的条目，并建立 (day, index) → pending 全局序号 的映射。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const HD = require(path.join(__dirname, '..', 'js', 'history.js'));

const monthDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const days = {};
const pending = [];
const seen = new Map();   // 英文原文 → 全局序号（去重，相同句子只翻一次）

for (let m = 1; m <= 12; m++) {
  for (let d = 1; d <= monthDays[m - 1]; d++) {
    const key = m + '-' + d;
    days[key] = HD.of(m, d).map((e) => {
      const item = { y: e.y, t: e.t, c: e.c, k: e.k };
      if (e.p) item.p = 1;
      const isEnglish = !/[\u4e00-\u9fa5]/.test(e.t);
      if (isEnglish) {
        if (seen.has(e.t)) {
          item.r = seen.get(e.t);       // 复用已有序号的翻译
        } else {
          const idx = pending.length;
          seen.set(e.t, idx);
          pending.push({ i: idx, t: e.t });
          item.r = idx;
        }
      }
      return item;
    });
  }
}

const out = { generatedAt: new Date().toISOString(), days: days, pending: pending };
fs.writeFileSync(path.join(__dirname, 'history-pending.json'), JSON.stringify(out), 'utf8');
console.log('天数:', Object.keys(days).length);
console.log('待翻译唯一条目:', pending.length);
console.log('平均每条字符数:', Math.round(pending.reduce((s, p) => s + p.t.length, 0) / pending.length));
console.log('建议分块数（每块 220 条）:', Math.ceil(pending.length / 220));
