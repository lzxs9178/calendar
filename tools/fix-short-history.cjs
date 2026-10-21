/* 修补：把只有庙号的短条目补成「姓名，朝代+身份」，更清楚 */
'use strict';
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'js', 'history.js');

const FIX = [
  ['宋太祖', '赵匡胤，宋朝开国皇帝'],
  ['宋神宗', '赵顼，宋朝皇帝'],
  ['唐德宗', '李适，唐朝皇帝'],
  ['宋仁宗', '赵祯，宋朝皇帝'],
  ['汉高祖', '刘邦，汉朝开国皇帝'],
  ['唐僖宗', '李儇，唐朝皇帝'],
  ['唐睿宗', '李旦，唐朝皇帝'],
  ['唐玄宗', '李隆基，唐朝皇帝'],
  ['梁元帝', '萧绎，南朝梁皇帝'],
  ['辽太宗', '耶律德光，辽朝皇帝'],
  ['宋孝宗', '赵昚，宋朝皇帝'],
  // 顺手修掉自动翻译里残留的省略号
  ['旧金山下令为日本…设立隔离学校，引发美日外交危机。', '旧金山下令为日本学童设立隔离学校，引发美日外交危机。']
];

let text = fs.readFileSync(F, 'utf8');
let n = 0;
FIX.forEach(([from, to]) => {
  const needle = 't:"' + from + '"';
  if (text.indexOf(needle) >= 0) {
    text = text.split(needle).join('t:"' + to.replace(/"/g, '\\"') + '"');
    n++;
  } else {
    // 也可能带标点
    const re = new RegExp('t:"' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^"]*"');
    if (re.test(text)) { text = text.replace(re, 't:"' + to + '"'); n++; }
    else console.log('未找到:', from);
  }
});

// 去掉中文里残留的 "…"（单独出现的省略号）
text = text.replace(/t:"([^"]*)…([^"]*)"/g, function (m, a, b) {
  if (b.trim() === '') return 't:"' + a + '"';
  return m;
});

fs.writeFileSync(F, text, 'utf8');
console.log('已修补', n, '条');
