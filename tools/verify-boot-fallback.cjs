/* 验证"页面没能正常启动"这个兜底提示：
 * 场景A：脚本缺失（模拟外部 js 被拦）→ 5 秒后必须弹出提示，而不是白屏
 * 场景B：全部脚本正常注入 → 不应该弹出提示
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const CAL = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(c, l, x) { (c ? pass++ : fail++); console.log(`${c ? 'OK  ' : 'BAD '} ${l}${!c && x !== undefined ? ' -> ' + x : ''}`); }

function load(withScripts) {
  return new Promise((resolve) => {
    const vc = new VirtualConsole();
    const html = fs.readFileSync(path.join(CAL, 'index.html'), 'utf8');
    const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc, url: 'file:///C:/cal/index.html' });
    const { window } = dom;
    // 只执行 index.html 里那段内联的"启动自检"
    const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    window.eval(inline);
    if (withScripts) {
      ['lunar.js', 'festivals.js', 'events.js', 'app.js'].forEach((f) => {
        window.eval(fs.readFileSync(path.join(CAL, 'js', f), 'utf8') + '\n//# sourceURL=' + f);
      });
      window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
    }
    setTimeout(() => resolve(window), 5400);
  });
}

(async function main() {
  console.log('兜底提示测试（等待 5 秒触发窗口）\n');

  console.log('场景A：外部 js 全部加载失败（模拟被浏览器拦截）');
  const wA = await load(false);
  const msgA = wA.document.getElementById('__bootmsg');
  check(!!msgA, '5 秒后弹出了启动失败提示（不是白屏）');
  if (msgA) {
    const t = msgA.textContent || '';
    check(t.includes('页面没能正常启动'), '提示标题正确', t.slice(0, 40));
    check(t.includes('calendar.html'), '提示里给出了自包含单文件的替代方案');
    check(t.includes('http.server'), '提示里给出了本地服务器的替代方案');
  }

  console.log('\n场景B：脚本全部正常');
  const wB = await load(true);
  const msgB = wB.document.getElementById('__bootmsg');
  check(!msgB, '没有误报启动失败');
  check(wB.document.querySelectorAll('#grid .day').length >= 28, '日历正常渲染', wB.document.querySelectorAll('#grid .day').length);

  console.log(`\n兜底提示：通过 ${pass}，失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
