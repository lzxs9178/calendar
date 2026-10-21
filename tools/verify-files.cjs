/* 独立复检：从文件字节开始查，确认"打不开"到底是文件问题还是环境问题
 * 1. 文件是否存在、大小、编码、是否被截断
 * 2. <script> 是否配对、内联脚本能否被 JS 引擎解析
 * 3. 用 jsdom 以 https 来源真实加载（runScripts: dangerously），检查是否渲染
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const CAL = path.join(__dirname, '..');
// calendar.html 与 calendar-standalone.html 内容相同（同一构建产物），都检查
const TARGETS = ['calendar.html', 'calendar-standalone.html'];
let fail = 0;
function bad(m) { fail++; console.log('  BAD ' + m); }
function good(m) { console.log('  OK  ' + m); }

(async function main() {
  // 顺带核对两个单文件产物是否一致
  const a = path.join(CAL, 'calendar.html');
  const b = path.join(CAL, 'calendar-standalone.html');
  if (fs.existsSync(a) && fs.existsSync(b)) {
    const same = fs.readFileSync(a, 'utf8') === fs.readFileSync(b, 'utf8');
    console.log('===== 产物一致性 =====');
    if (same) good('calendar.html 与 calendar-standalone.html 内容一致');
    else bad('两个单文件产物内容不一致（重新运行 build-standalone.cjs）');
  }

  for (const file of TARGETS) {
    const p = path.join(CAL, file);
    console.log(`\n===== ${file} =====`);
    if (!fs.existsSync(p)) { bad('文件不存在'); continue; }

    const buf = fs.readFileSync(p);
    const raw = buf.toString('utf8');
    good(`存在，${buf.length} 字节，UTF-8 可解码`);

    if (buf[0] === 0xEF && buf[1] === 0xBB) bad('文件带 UTF-8 BOM');
    else good('无 BOM');

    if (raw.includes('\uFFFD')) bad('包含 U+FFFD，编码已损坏');
    else good('无乱码替换字符');

    const opens = (raw.match(/<script/gi) || []).length;
    const closes = (raw.match(/<\/script>/gi) || []).length;
    if (opens !== closes) bad(`<script> 不配对：${opens} 开 / ${closes} 闭`);
    else good(`script 标签配对（${opens} 对）`);

    if (!/<\/html>\s*$/i.test(raw)) bad('结尾不是 </html>，可能被截断');
    else good('HTML 结尾完整');

    const m = raw.match(/<script>([\s\S]*?)<\/script>/);
    if (m) {
      const code = m[1];
      good(`内联脚本 ${(code.length / 1024).toFixed(1)} KB`);
      if (/<\/script/i.test(code)) bad('内联脚本含未转义的 </script');
      else good('内联脚本无 </script> 冲突');
      try {
        new vm.Script(code, { filename: file + ':inline' });
        good('内联脚本可被 JS 引擎解析');
      } catch (e) {
        bad('内联脚本解析失败: ' + e.message);
      }
    } else {
      good('（多文件版：无内联脚本，靠相对路径加载 js/）');
    }

    // 真实加载
    const logs = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => logs.push(e.detail ? (e.detail.stack || e.detail.message) : e.message));
    const dom = new JSDOM(raw, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: vc,
      url: 'https://calendar.local/' + file
    });
    const { window } = dom;
    await new Promise((r) => setTimeout(r, 800));

    if (logs.length) bad('加载期异常：' + logs.map((l) => String(l).split('\n')[0]).join(' | '));
    else good('加载期无异常');

    const cal = window.__calendar;
    if (!cal) bad('__calendar 未初始化');
    else good('__calendar 已初始化');

    const cells = window.document.querySelectorAll('#grid .day').length;
    if (cells < 28) bad(`月视图只有 ${cells} 个格子`); else good(`月视图 ${cells} 个格子`);

    const wk = window.document.querySelectorAll('#weekdays > span').length;
    if (wk !== 7) bad(`星期表头 ${wk} 列`); else good('星期表头 7 列');

    const chips = window.document.querySelectorAll('#grid .chip').length;
    if (chips === 0) bad('格子里没有任何节日/日程标签'); else good(`格子内有 ${chips} 个标签`);

    const title = window.document.getElementById('viewTitle').textContent;
    if (!title) bad('标题为空'); else good(`标题："${title}"`);

    window.close();

    // 开发入口 index.html：它引用外部 css/js，这里核对引用的文件是否真的存在
    if (file === 'calendar.html') {
      const dev = path.join(CAL, 'index.html');
      if (fs.existsSync(dev)) {
        const devRaw = fs.readFileSync(dev, 'utf8');
        const refs = []
          .concat((devRaw.match(/<script src="([^"]+)"/g) || []).map((s) => s.match(/src="([^"]+)"/)[1]))
          .concat((devRaw.match(/<link[^>]*href="([^"]+)"/g) || []).map((s) => s.match(/href="([^"]+)"/)[1]));
        console.log('\n===== 开发入口 index.html 的外部引用 =====');
        if (!refs.length) bad('没有找到任何外部引用');
        refs.forEach((r) => {
          if (fs.existsSync(path.join(CAL, r))) good(`引用存在：${r}`);
          else bad(`引用缺失：${r}`);
        });
      }
    }
  }

  console.log(`\n═══ 文件复检：${fail === 0 ? '全部通过（文件与脚本本身没问题）' : fail + ' 项异常'} ═══`);
  process.exit(fail ? 1 : 0);
})();
