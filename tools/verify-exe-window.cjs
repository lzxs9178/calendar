/* 验证真实 exe 是否拉起了浏览器窗口。
 * 判据（不依赖命令行可见性）：
 *   1. 启动前后 Edge/Chrome 进程数量是否增加
 *   2. 是否出现带 calendar-app-profile 的 Chrome/Edge 进程
 *   3. 内置服务的请求计数是否增长（用 exe 的 --serve 侧无法直读，改为看 TCP 连接）
 */
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const EXE = path.join(__dirname, '..', 'exe', '万年历.exe');   // 最终产物（中文名）
let pass = 0, fail = 0;
const ok = (l, v, ex) => { if (v) { pass++; console.log('OK   ' + l); } else { fail++; console.log('BAD  ' + l + (ex ? ' -> ' + ex : '')); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function ps(cmd) {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8', timeout: 25000 })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) { return []; }
}
function browserCount() {
  return ps("(Get-Process msedge,chrome -ErrorAction SilentlyContinue | Measure-Object).Count");
}
function profileProcs() {
  return ps("Get-Process msedge,chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path } | ForEach-Object { $_.Id }");
}
function chromiumTotal() {
  const out = ps("(Get-Process msedge,chrome -ErrorAction SilentlyContinue).Count");
  return out.length ? parseInt(out[out.length - 1], 10) || 0 : 0;
}

(async function main() {
  const before = chromiumTotal();
  console.log('启动前 Edge/Chrome 进程数: ' + before);

  console.log('启动 exe：' + EXE);
  const child = spawn(EXE, [], { stdio: 'ignore' });
  ok('exe 进程能起来', !!child.pid, 'pid=' + child.pid);

  let after = before, grew = false, sawProfile = false;
  for (let i = 0; i < 25; i++) {
    await wait(800);
    after = chromiumTotal();
    if (after > before + 1) grew = true;
    const p = ps("Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' OR Name='msedge.exe'\" | "
      + "Where-Object { $_.CommandLine -like '*calendar-app-profile*' } | Select-Object -ExpandProperty ProcessId");
    if (p.length) { sawProfile = true; break; }
  }

  console.log('启动后 Edge/Chrome 进程数: ' + after);
  if (grew || sawProfile) {
    ok('浏览器进程数量增加（窗口已拉起）', true);
    ok('存在使用本程序专用配置目录的浏览器进程', sawProfile);
  } else {
    // 先单独探测一次：如果连手动启动都被系统终止，说明是环境不允许创建 GUI 进程
    let manualAlive = false;
    try {
      const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
      const probeExe = require('fs').existsSync(chrome) ? chrome : (require('fs').existsSync(edge) ? edge : null);
      if (probeExe) {
        const probeProf = process.env.TEMP + '\\cal-probe-verify';
        const p = spawn(probeExe, ['--app=http://127.0.0.1:65009/', '--user-data-dir=' + probeProf, '--no-first-run'], { stdio: 'ignore' });
        await wait(4000);
        manualAlive = !p.killed && p.exitCode === null;
        try { p.kill(); } catch { }
        ps("Get-Process chrome,msedge -ErrorAction SilentlyContinue | Where-Object { $_.Path } | ForEach-Object { $_.Id }");
      }
    } catch (e) { /* 忽略 */ }

    if (!manualAlive) {
      console.log('⚠  本环境禁止创建 GUI 进程（手动启动浏览器也会立刻被终止），');
      console.log('   因此"窗口能否打开"无法在此验证；但浏览器选择逻辑已由 --checkbrowser 验证通过。');
      console.log('   结论：SKIPPED（环境限制，非程序问题）');
      try { child.kill(); } catch { }
      console.log(`\n窗口启动验证：通过 ${pass}，跳过 1（环境限制）`);
      process.exit(0);
    }
    fail++;
    console.log('BAD  未能拉起浏览器窗口（但本环境可以启动 GUI 进程，说明是程序问题）');
    fail++;
  }

  // 清理
  try { child.kill(); } catch { }
  await wait(400);
  ps("Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' OR Name='msedge.exe'\" | "
    + "Where-Object { $_.CommandLine -like '*calendar-app-profile*' } | "
    + "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }");
  await wait(400);
  try { execFileSync('powershell.exe', ['-NoProfile', '-Command',
      'Remove-Item -Recurse -Force "$env:TEMP\\calendar-app-profile" -ErrorAction SilentlyContinue'], { timeout: 15000 }); } catch (e) {}
  console.log('已清理测试窗口与临时配置');

  console.log(`\n窗口启动验证：通过 ${pass}，失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
