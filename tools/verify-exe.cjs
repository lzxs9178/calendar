/* 端到端验证：启动 exe（--selftest 模式下它会在固定端口持续提供服务），
 * 然后用 jsdom 通过 http 打开它提供的页面，检查日历是否完整可用。
 * 这验证的是"打包进 exe 的那份资源"，不是源码目录。
 */
const path = require('path');
const { spawn } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');

const EXE = path.join(__dirname, '..', 'exe', 'selftest.exe');
const PORT = 8231;
const URL = 'http://127.0.0.1:' + PORT + '/';

let pass = 0, fail = 0;
const ok = (l, v) => { if (v) { pass++; console.log('OK   ' + l); } else { fail++; console.log('BAD  ' + l); } };

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async function main() {
  console.log('启动 exe（--serve 模式）：' + EXE);
  const child = spawn(EXE, ['--serve', String(PORT)], { stdio: 'ignore' });
  // 等端口就绪
  const net = require('net');
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await wait(150);
    ready = await new Promise((res) => {
      const s = net.connect(PORT, '127.0.0.1');
      s.once('connect', () => { s.destroy(); res(true); });
      s.once('error', () => { res(false); });
    });
    if (ready) break;
  }
  ok('exe 内置服务已就绪（端口 ' + PORT + '）', ready);
  if (!ready) {
    try { child.kill(); } catch { }
    console.log('\n结果：通过 ' + pass + '，失败 ' + (fail + 1));
    process.exit(1);
  }

  try {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errors.push(e.detail ? e.detail.message : e.message));
    const dom = await JSDOM.fromURL(URL, {
      runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc
    });
    await wait(2500);
    const w = dom.window, doc = w.document;

    ok('从 exe 提供的页面能正常启动', !!w.__calendar);
    ok('月视图渲染完整（≥28 格）', doc.querySelectorAll('#grid .day').length >= 28);
    ok('星期表头 7 列', doc.querySelectorAll('#weekdays > span').length === 7);
    ok('节日标签已渲染', doc.querySelectorAll('#grid .chip').length > 0);
    ok('黄历"吉"标记存在', doc.querySelectorAll('#grid .luck-dot').length > 0);
    ok('历史数据 4702 条', !!(w.HistoryDB && w.HistoryDB.count() === 4702));
    ok('http 来源下可保存数据', !!(w.__calendar && w.__calendar.storage.ok));
    ok('首页标题为中文万年历', (doc.title || '').indexOf('万年历') >= 0);

    // 交互：点一天看详情
    doc.querySelector('#grid .day').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const t = doc.getElementById('dayBody').textContent || '';
    ok('当天详情含黄历宜忌', t.indexOf('宜') >= 0 && t.indexOf('忌') >= 0);
    ok('当天详情含中文历史条目', t.indexOf('历史上的今天') >= 0);
    ok('无加载错误', errors.length === 0);
    if (errors.length) errors.slice(0, 3).forEach((e) => console.log('   ! ' + e));
    dom.window.close();
  } catch (e) {
    fail++;
    console.log('BAD  端到端验证异常: ' + e.message);
  } finally {
    try { child.kill(); } catch { }
  }

  console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
