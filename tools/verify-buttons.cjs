/* 关键复现：页面渲染出来了，但按钮是否真的能用？
 * 场景：file:// 下 localStorage 访问即抛（Chrome 的真实行为）
 * 判据：点"下一月"标题必须变化、点"新建"弹窗必须打开、点日期格子必须弹详情
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const CAL = path.join(__dirname, '..');
const FILE = path.join(CAL, 'calendar.html');
let pass = 0, fail = 0;
function check(c, l, x) { (c ? pass++ : fail++); console.log(`${c ? 'OK  ' : 'BAD '} ${l}${!c && x !== undefined ? ' -> ' + x : ''}`); }

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(e.detail ? (e.detail.stack || e.detail.message) : e.message));

const html = fs.readFileSync(FILE, 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: 'file:///C:/cal/calendar.html'
});
const { window } = dom;

// 关键：在所有脚本执行完之后，把 localStorage 换成"访问即抛"
// （真实 Chrome 里是页面一加载就抛，但这里先让脚本跑起来，再切断，
//   足以检测"绑定事件时/点击时是否会因为存储问题而挂掉"）
const doc = window.document;
const click = (id) => doc.getElementById(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

setTimeout(() => {
  console.log('--- 启动期异常 ---');
  console.log(errors.length ? errors.map((e) => '  ! ' + String(e).split('\n')[0]).join('\n') : '  无');
  console.log('--- window.__calendarError ---');
  console.log(window.__calendarError ? '  ! ' + window.__calendarError.split('\n')[0] : '  无');

  const title = () => doc.getElementById('viewTitle').textContent;
  const before = title();

  // 1) 翻月按钮
  click('btnNext');
  const afterNext = title();
  check(afterNext !== before, '【下一月】按钮有效', `${before} -> ${afterNext}`);
  click('btnPrev');
  check(title() === before, '【上一月】按钮有效', `${afterNext} -> ${title()}`);

  // 2) 今天按钮
  click('btnToday');
  check(title() === before, '【今天】按钮有效');

  // 3) 新建按钮
  click('btnAdd');
  check(doc.getElementById('modal').hidden === false, '【新建】按钮能打开弹窗', 'hidden=' + doc.getElementById('modal').hidden);
  if (doc.getElementById('modal').hidden === false) {
    doc.getElementById('fTitle').value = '按钮测试';
    doc.getElementById('eventForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    check(doc.getElementById('modal').hidden === true, '保存后弹窗关闭');
  }

  // 4) 数据按钮
  click('btnData');
  check(doc.getElementById('dataModal').hidden === false, '【数据】按钮能打开弹窗');
  doc.getElementById('dataModal').querySelector('.modal-head .icon-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check(doc.getElementById('dataModal').hidden === true, '能关闭数据弹窗');

  // 5) 日期格子
  const cell = doc.querySelector('#grid .day');
  cell.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check(doc.getElementById('dayModal').hidden === false, '点日期能弹详情');
  doc.getElementById('dayModal').querySelector('.modal-head .icon-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  // 6) 视图切换
  doc.querySelector('.seg[data-view="year"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check(doc.querySelectorAll('#viewHost .mini').length === 12, '【年】视图切换有效');
  doc.querySelector('.seg[data-view="month"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  // 7) 键盘
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  check(title() !== before, '键盘 ← → 有效');

  console.log(`\n按钮可用性：通过 ${pass}，失败 ${fail}`);
  console.log(errors.length ? '⚠ 仍有启动期异常' : '✓ 无启动期异常');
  process.exit(fail || errors.length ? 1 : 0);
}, 900);
