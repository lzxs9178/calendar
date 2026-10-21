/* 自包含单文件版自检（calendar.html）
 * 用 file:// 打开（与双击一致），确认：无外部引用、脚本能启动、界面渲染、可增删日程。
 */
const path = require('path');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const CAL = path.join(__dirname, '..');
const FILE = path.join(CAL, 'calendar.html');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(String(e.detail ? e.detail.stack || e.detail.message : e.message)));

const html = fs.readFileSync(FILE, 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: 'file:///C:/cal/calendar.html'
});
const { window } = dom;

setTimeout(() => {
  const doc = window.document, cal = window.__calendar;
  const out = [];
  out.push(['无外部资源引用', !/<script src=|<link rel="stylesheet"/.test(html)]);
  out.push(['单文件内联脚本启动', !!cal]);
  out.push(['无启动期异常', errors.length === 0]);
  if (cal) {
    out.push(['月视图格子 ≥28', doc.querySelectorAll('#grid .day').length >= 28]);
    out.push(['星期表头 7 列', doc.querySelectorAll('#weekdays > span').length === 7]);
    out.push(['节日标签渲染', doc.querySelectorAll('#grid .chip').length > 0]);
    out.push(['弹窗默认关闭', ['modal', 'dataModal', 'dayModal'].every((id) => doc.getElementById(id).hidden === true)]);
    doc.querySelector('.seg[data-view="year"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    out.push(['年视图 12 个月', doc.querySelectorAll('#viewHost .mini').length === 12]);
    doc.querySelector('.seg[data-view="list"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    out.push(['列表视图有分组', doc.querySelectorAll('#viewHost .list-group-title').length >= 2]);
    doc.querySelector('.seg[data-view="month"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    doc.getElementById('btnAdd').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    doc.getElementById('fTitle').value = '单文件自检';
    doc.getElementById('fRepeat').value = 'yearly';
    doc.getElementById('eventForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    out.push(['可新增日程', cal.state.events.some((e) => e.title === '单文件自检')]);
  }
  let fail = 0;
  out.forEach(([l, ok]) => { if (!ok) fail++; console.log((ok ? 'OK  ' : 'BAD ') + l); });
  console.log('错误：' + (errors.length ? errors.join(' | ') : '无'));
  console.log('单文件版：通过 ' + (out.length - fail) + '，失败 ' + fail);
  process.exit(fail || errors.length ? 1 : 0);
}, 500);
