/* 回归测试：最初"卡在开头"的复现场景（file:// + localStorage 访问即抛）
 * 修复前：bind() 里的 localStorage 访问中断 boot()，页面停在开头。
 * 修复后：必须完整渲染且可交互。 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const CAL = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(c, l, x) { (c ? pass++ : fail++); console.log(`${c ? 'OK  ' : 'BAD '} ${l}${!c && x !== undefined ? ' -> ' + x : ''}`); }

const logs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => logs.push(e.detail ? (e.detail.stack || e.detail.message) : e.message));

const html = fs.readFileSync(path.join(CAL, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc, url: 'file:///C:/cal/index.html' });
const { window } = dom;

// 完全复刻 Chrome file:// 的行为：访问即抛
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  get() { throw new window.Error('SecurityError: localStorage is not available for opaque origins'); }
});
window.eval('window.__errs=[];window.addEventListener("error",function(e){window.__errs.push(e.message);});');

['lunar.js', 'festivals.js', 'events.js', 'app.js'].forEach((f) => {
  window.eval(fs.readFileSync(path.join(CAL, 'js', f), 'utf8') + '\n//# sourceURL=' + f);
});
window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

setTimeout(() => {
  const doc = window.document;
  console.log('--- 启动期异常（应为空）---');
  console.log(logs.length ? logs.map((l) => '  ! ' + String(l).split('\n')[0]).join('\n') : '  无');
  console.log('--- window 未捕获错误（应为空）---');
  console.log((window.__errs || []).length ? (window.__errs || []).map((e) => '  ! ' + e).join('\n') : '  无');

  check(logs.length === 0, '启动过程没有异常中断（原 bug 已修）');
  check((window.__errs || []).length === 0, '没有未捕获错误');
  check(doc.querySelectorAll('#grid .day').length >= 28, '月视图完整渲染', doc.querySelectorAll('#grid .day').length);
  check(doc.querySelectorAll('#weekdays > span').length === 7, '星期表头渲染', doc.querySelectorAll('#weekdays > span').length);
  check((doc.getElementById('statusRange').textContent || '').indexOf('⚠') >= 0, '底部明确提示无法保存', doc.getElementById('statusRange').textContent);
  check((doc.getElementById('todayCard').textContent || '').length > 10, '今日卡片有内容');

  // 依然可用：新建一条并确认出现在日历上
  doc.getElementById('btnAdd').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check(doc.getElementById('modal').hidden === false, '能打开新建弹窗');
  doc.getElementById('fTitle').value = '回归测试项';
  doc.getElementById('fRepeat').value = 'yearly';
  doc.getElementById('eventForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const cal = window.__calendar;
  check(cal.state.events.some((e) => e.title === '回归测试项'), '新建的日程进入数据');
  check(doc.querySelectorAll('#grid .chip').length > 0, '日历上出现日程/节日标签');
  check(cal.storage.ok === false, '存储状态标记为不可持久化');

  // 页面上的"启动自检"不应该在正常启动时误报
  check(!doc.getElementById('__bootmsg'), '正常启动时没有误弹"页面没能正常启动"');
  check(!window.__calendarError, 'window.__calendarError 为空（没有隐藏的初始化异常）');

  console.log(`\n回归测试：通过 ${pass}，失败 ${fail}`);
  process.exit(fail ? 1 : 0);
}, 600);
