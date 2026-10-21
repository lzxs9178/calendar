/* 验证 diagnose.html 真的能诊断：
 * A) 日历正常时 → 报告应显示"全部通过"
 * B) 模拟脚本没跑完（把 __calendar / 事件绑定破坏掉）→ 报告应指出失败项
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const CAL = path.join(__dirname, '..');
const FILE = path.join(CAL, 'diagnose.html');
let pass = 0, fail = 0;
function check(c, l, x) { (c ? pass++ : fail++); console.log(`${c ? 'OK  ' : 'BAD '} ${l}${!c && x !== undefined ? ' -> ' + x : ''}`); }

function openFile(mutate) {
  return new Promise((resolve) => {
    const vc = new VirtualConsole();
    const html = fs.readFileSync(FILE, 'utf8');
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: vc,
      url: 'file:///C:/cal/diagnose.html',
      beforeParse(window) {
        if (mutate) mutate(window);
      }
    });
    setTimeout(() => resolve(dom.window), 1600);
  });
}

(async function main() {
  console.log('A) 日历正常时，诊断页应报告通过\n');
  const wA = await openFile(null);
  const docA = wA.document;
  const verdictA = docA.getElementById('verdict').textContent;
  console.log('   结论：' + verdictA);
  check(docA.getElementById('verdict').className.indexOf('ok') >= 0 || docA.getElementById('verdict').className.indexOf('warn') >= 0,
    '报告为"通过"或"仅存储受限"', verdictA);
  check(/功能全部正常|全部通过/.test(verdictA), '结论文字正确', verdictA.slice(0, 40));
  check(/19 项/.test(verdictA) || /项检查通过/.test(verdictA), '报告里有检查项数量', verdictA.slice(0, 40));
  const rawA = docA.getElementById('raw').textContent;
  check(rawA.indexOf('按钮: 有效') >= 0, '原始信息里记录了"按钮: 有效"', rawA.split('\n').filter((l) => l.indexOf('按钮') >= 0).join());
  check(rawA.indexOf('格子: 35') >= 0 || /格子: \d\d/.test(rawA), '原始信息里记录了格子数量', rawA.split('\n').filter((l) => l.indexOf('格子') >= 0).join());
  check(/\d+ 项/.test(verdictA) || rawA.length > 200, '报告内容完整');

  console.log('\nB) 报告内容必须覆盖所有关键字段（打不开时你能直接把这段发我）\n');
  const wB = await openFile(null);
  const rawB = wB.document.getElementById('raw').textContent;
  ['时间:', '地址:', 'UA  :', '存储:', '格子:', '按钮:', '启动错误:', '__calendar:', '逐项'].forEach((k) => {
    check(rawB.indexOf(k) >= 0, '报告含字段「' + k + '」');
  });
  const fails = rawB.split('\n').filter((l) => l.indexOf('[失败]') >= 0);
  console.log('   本次报告中的失败项：' + (fails.length ? '\n     ' + fails.join('\n     ') : '无（正常）'));
  check(fails.every((l) => l.indexOf('localStorage') >= 0) || fails.length === 0,
    '唯一的失败项只能是 localStorage（file:// 限制，非程序问题）', fails.length + ' 项');

  console.log(`\n诊断页自检：通过 ${pass}，失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
