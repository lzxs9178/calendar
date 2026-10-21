/* 启动自检：验证在"存储可用 / file:// 抛 SecurityError / 完全没有 localStorage"三种环境下，
 * 日历都能完整渲染并保持可交互，且不会出现未捕获异常。 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const CAL = path.join(__dirname, '..');
// 只测自包含单文件（推荐入口）。多文件版 index.html 依赖浏览器加载外部 js，
// jsdom 不加载外部脚本，测它只能靠"手动注入"，会掩盖真实问题，所以不再用它充当入口。
const FILES = ['calendar.html'];
let pass = 0, fail = 0;
const failures = [];

function check(cond, label, extra) {
  if (cond) { pass++; console.log('    OK  ' + label); }
  else { fail++; failures.push(label); console.log('    BAD ' + label + (extra !== undefined ? ' -> ' + extra : '')); }
}

/** 把一个页面在指定环境下跑起来，返回检查用的上下文 */
function bootPage(file, mode) {
  return new Promise((resolve) => {
    const logs = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => logs.push(e.detail ? (e.detail.stack || e.detail.message) : e.message));

    const html = fs.readFileSync(path.join(CAL, file), 'utf8');
    const isStandalone = true;   // calendar.html 是自包含单文件
    // 必须用 file:// 打开才和"双击 html"的真实环境一致（此时 jsdom 也禁用 localStorage）；
    // "存储可用"这一档换成 https 来源，jsdom 会提供可用的 localStorage，
    // 等价于"用本地服务器/正常站点打开"的场景。
    const origin = mode === 'normal' ? 'https://calendar.local/' + file : 'file:///C:/cal/' + file;
    const dom = new JSDOM(html, {
      runScripts: isStandalone ? 'dangerously' : 'outside-only',
      pretendToBeVisual: true,
      virtualConsole: vc,
      url: origin
    });
    const { window } = dom;

    if (mode === 'throw') {
      // 模拟 Chrome 在 file:// 下：访问 localStorage 即抛 SecurityError
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new window.Error('SecurityError: localStorage is not available for opaque origins'); }
      });
    } else if (mode === 'absent') {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { return undefined; } });
    }

    window.eval('window.__errs=[];window.addEventListener("error",function(e){window.__errs.push(e.message);});');

    if (!isStandalone) {
      ['lunar.js', 'festivals.js', 'almanac.js', 'history.js', 'events.js', 'app.js'].forEach((f) => {
        if (!fs.existsSync(path.join(CAL, 'js', f))) return;
        try {
          window.eval(fs.readFileSync(path.join(CAL, 'js', f), 'utf8') + '\n//# sourceURL=' + f);
        } catch (e) { logs.push('注入 ' + f + ': ' + (e.stack || e.message)); }
      });
      window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
    }

    setTimeout(() => resolve({ window, logs }), 700);
  });
}

async function testPage(file) {
  for (const [mode, label] of [['normal', '存储可用'], ['throw', 'file:// 下 localStorage 抛异常'], ['absent', '完全没有 localStorage']]) {
    console.log(`\n  【${file} · ${label}】`);
    const { window, logs } = await bootPage(file, mode);
    const doc = window.document;

    check(logs.length === 0, '启动期无异常抛出', logs.map((l) => String(l).split('\n')[0]).join(' | '));
    check((window.__errs || []).length === 0, '无未捕获脚本错误', (window.__errs || []).join(' | '));

    const cal = window.__calendar;
    check(!!cal, 'app.js 执行到结尾');

    const dayCells = doc.querySelectorAll('#grid .day').length;
    check(dayCells >= 28, '月视图渲染出日期格子', dayCells);
    check(doc.querySelectorAll('#weekdays > span').length === 7, '星期表头 7 列', doc.querySelectorAll('#weekdays > span').length);
    check((doc.getElementById('viewTitle').textContent || '').includes('年'), '标题已渲染', doc.getElementById('viewTitle').textContent);
    check((doc.getElementById('todayCard').textContent || '').length > 10, '今日卡片有内容');
    check(doc.querySelectorAll('#grid .chip').length > 0, '格子内有节日/日程标签', doc.querySelectorAll('#grid .chip').length);

    // 弹窗必须是关着的，不能挡住页面
    let blocked = [];
    ['modal', 'dataModal', 'dayModal'].forEach((id) => { if (doc.getElementById(id).hidden !== true) blocked.push(id); });
    check(blocked.length === 0, '没有弹窗挡住页面', blocked.join(','));

    // 交互
    const cell = doc.querySelector('#grid .day');
    cell.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check(doc.getElementById('dayModal').hidden === false, '点击日期能打开详情');
    doc.getElementById('dayModal').querySelector('.modal-head .icon-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check(doc.getElementById('dayModal').hidden === true, '能关掉详情');

    doc.getElementById('btnNext').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check(doc.querySelectorAll('#grid .day').length >= 28, '翻月后仍正常渲染');
    doc.getElementById('btnAdd').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check(doc.getElementById('modal').hidden === false, '能打开新建弹窗');
    doc.getElementById('fTitle').value = '启动自检';
    doc.getElementById('eventForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    const created = cal.state.events.filter((e) => e.title === '启动自检');
    check(created.length === 1, '能成功新建日程');
    check(cal.state.events.some((e) => e.title === '启动自检'), '新建的日程进入列表');

    // 存储状态提示
    if (mode === 'normal') {
      check(cal.storage.ok === true, '识别为可持久化');
      check((doc.getElementById('statusRange').textContent || '').indexOf('⚠') < 0, '不显示存储告警');
    } else {
      check(cal.storage.ok === false, '正确识别为不可持久化');
      check((doc.getElementById('statusRange').textContent || '').indexOf('⚠') >= 0, '底部显示存储告警', doc.getElementById('statusRange').textContent);
    }
  }
}

(async function main() {
  console.log('万年历 · 启动自检（模拟双击打开的真实环境）');
  for (const f of FILES) await testPage(f);
  console.log(`\n═══ 结果：通过 ${pass}，失败 ${fail} ═══`);
  if (fail) { console.log('失败项：\n  - ' + failures.join('\n  - ')); process.exit(1); }
})();
