/* 把日历打包成 Windows exe
 *
 * 做法：整个网页内嵌进 exe，运行时用内置 HttpListener 在 127.0.0.1 随机端口提供文件，
 *       再用无头窗口（浏览器 --app 模式）打开 —— 免安装、离线可用，且 http 来源可保存数据。
 *
 * 用法：node tools/build-exe.cjs
 * 产出：exe/万年历.exe        （双击运行，无控制台窗口）
 *      exe/万年历-自检.exe    （命令行自检，用于验证打包是否完整）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CAL = path.join(__dirname, '..');
const EXE = path.join(CAL, 'exe');
const APP = path.join(EXE, 'app');
const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';

const FILES = ['index.html', 'style.css', 'lunar.js', 'festivals.js', 'almanac.js', 'history.js', 'events.js', 'app.js'];

function run(cmd, args) {
  const shown = args.filter(function (a) { return a.indexOf('/resource:') !== 0; });
  console.log('> ' + path.basename(cmd) + ' ' + shown.join(' '));
  try {
    // 正常情况：捕获编译器输出，便于汇总报错
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    if (e && (e.code === 'EPERM' || e.errno === -4048)) {
      // 受限环境（如 DSH 沙箱）不允许通过管道捕获子进程输出：
      // 改成直接继承终端输出重试一次，这样编译器信息能正常显示。
      execFileSync(cmd, args, { stdio: 'inherit' });
      return '';
    }
    throw e;
  }
}

// 0) 先确保 docs 与源码同步（避免内嵌到旧内容）。
//    注意：某些受限环境不允许从 Node 派生子进程，这时只提示、不阻塞编译。
(function () {
  const { execFileSync } = require('child_process');
  try {
    execFileSync(process.execPath, [path.join(CAL, 'build-standalone.cjs')], { encoding: 'utf8', stdio: 'ignore' });
    console.log('（已自动同步内嵌文件：先跑了一遍 build-standalone.cjs）');
  } catch (e) {
    console.log('（提示：自动同步未成功，将使用 docs/ 现有内容；要更新请先手动运行 node build-standalone.cjs）');
  }
})();

// 1) 准备内嵌目录：用 docs 版（脚本已扁平化）
fs.rmSync(APP, { recursive: true, force: true });
fs.mkdirSync(APP, { recursive: true });
FILES.forEach(function (f) {
  const src = path.join(CAL, 'docs', f);
  if (!fs.existsSync(src)) { console.error('缺少文件：docs/' + f + '（请先运行 node build-standalone.cjs）'); process.exit(1); }
  fs.copyFileSync(src, path.join(APP, f));
});
console.log('已准备内嵌文件 ' + FILES.length + ' 个，合计 ' +
  (FILES.reduce(function (s, f) { return s + fs.statSync(path.join(APP, f)).size; }, 0) / 1024).toFixed(0) + ' KB');

// 2) 图标
if (!fs.existsSync(path.join(EXE, 'app.ico'))) {
  console.error('缺少图标 exe/app.ico（请先运行 python tools/make-icon.py）');
  process.exit(1);
}

// 3) 编译
const common = [
  '/nologo', '/platform:anycpu', '/optimize+',
  '/win32icon:' + path.join(EXE, 'app.ico'),
  '/reference:System.dll',
  '/reference:System.Drawing.dll',
  '/reference:System.Windows.Forms.dll'
];
FILES.forEach(function (f) {
  common.push('/resource:' + path.join(APP, f) + ',app.' + f);
});

let ok = true;
const APP_EXE = path.join(EXE, 'calendar.exe');       // 先用 ASCII 名编译，避免编译器参数编码问题
const TEST_EXE = path.join(EXE, 'selftest.exe');
const FINAL_EXE = path.join(EXE, '万年历.exe');
try {
  run(CSC, common.concat(['/target:winexe', '/out:' + APP_EXE, path.join(EXE, 'CalendarApp.cs')]));
  console.log('✅ 编译完成：calendar.exe');
  run(CSC, common.concat(['/target:exe', '/out:' + TEST_EXE, path.join(EXE, 'CalendarApp.cs')]));
  console.log('✅ 编译完成：selftest.exe（用于自动化验证）');
  // 再生成中文名副本，方便直接认；删掉临时英文名
  fs.copyFileSync(APP_EXE, FINAL_EXE);
  fs.unlinkSync(APP_EXE);
  console.log('✅ 已生成 万年历.exe（中文名，便于识别）');
} catch (e) {
  ok = false;
  const detail = (e.stdout ? e.stdout.toString('utf8') : '') + (e.stderr ? e.stderr.toString('utf8') : '');
  console.error('编译失败：\n' + detail.split('\n').slice(0, 25).join('\n'));
}

['calendar.exe', 'selftest.exe', '万年历.exe'].forEach(function (f) {
  const p = path.join(EXE, f);
  if (fs.existsSync(p)) console.log('   ' + f + '  ' + (fs.statSync(p).size / 1024 / 1024).toFixed(2) + ' MB');
});
process.exit(ok ? 0 : 1);
