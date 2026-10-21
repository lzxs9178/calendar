/* 构建自包含单文件版
 *
 * 为什么需要它：多文件版（index.html）依赖浏览器去加载 css/js 外部文件。
 * 某些环境（安全策略、内嵌浏览器、把 html 单独拷走）会拦掉这些加载，页面就"打不开"。
 * 这里把 css/js 全部内联，产出一个不依赖任何外部文件的自包含 html。
 *
 * 用法：node build-standalone.cjs
 * 产出：calendar.html             ← 自包含，推荐双击这个
 *      calendar-standalone.html  ← 同内容，兼容旧文件名
 */
const fs = require('fs');
const path = require('path');

const CAL = __dirname;
const read = (p) => fs.readFileSync(path.join(CAL, p), 'utf8');
const escapeForScript = (code) => code.replace(/<\/script/gi, '<\\/script');

const css = read('css/style.css');
const js = ['js/lunar.js', 'js/festivals.js', 'js/almanac.js', 'js/history.js', 'js/events.js', 'js/app.js']
  .filter(function (p) { return fs.existsSync(path.join(CAL, p)); })
  .map(read).join('\n\n');

const source = read('index.html');
let single = source;

single = single.replace(
  /<link rel="stylesheet" href="css\/style\.css">/,
  () => '<style>\n' + css + '\n</style>'
);
single = single.replace(
  /\s*<script src="js\/lunar\.js"><\/script>\s*<script src="js\/festivals\.js"><\/script>\s*<script src="js\/almanac\.js"><\/script>\s*(?:<script src="js\/history\.js"><\/script>\s*)?<script src="js\/events\.js"><\/script>\s*<script src="js\/app\.js"><\/script>/,
  () => '\n<script>\n' + escapeForScript(js) + '\n</script>'
);

if (/<script src=|<link rel="stylesheet"/.test(single)) {
  console.error('❌ 内联失败：产物里仍有外部引用');
  process.exit(1);
}

// 明确校验产物里的引用都被替换掉了（而不是靠 index.html 的源码判断）
const beforeRefs = (source.match(/<script src=|<link rel="stylesheet"/g) || []).length;
const afterRefs = (single.match(/<script src=|<link rel="stylesheet"/g) || []).length;
if (beforeRefs === 0 || afterRefs !== 0) {
  console.error('❌ 引用替换异常：原文件 ' + beforeRefs + ' 处外部引用，产物 ' + afterRefs + ' 处');
  process.exit(1);
}

const kb = (Buffer.byteLength(single, 'utf8') / 1024).toFixed(1);
fs.writeFileSync(path.join(CAL, 'calendar.html'), single, 'utf8');
fs.writeFileSync(path.join(CAL, 'calendar-standalone.html'), single, 'utf8');
console.log('✅ calendar.html              自包含单文件，' + kb + ' KB（推荐双击这个）');
console.log('✅ calendar-standalone.html   同内容，兼容旧文件名');
console.log('   外部依赖：无（完全离线可用，可单独拷走）');
console.log('   index.html 保留为开发入口（引用外部 css/js，改动后刷新即可）');

/* ---------- 3) 自包含诊断页：把整份日历内联进来，再追加自检脚本 ---------- */
const diagScript = read('diagnose-selfcheck.html').match(/<script>([\s\S]*?)<\/script>/)[1];
const diagCss = read('diagnose-selfcheck.html').match(/<style>([\s\S]*?)<\/style>/)[1];
let diag = single.replace(
  '</head>',
  '<style>\n' + diagCss.replace(/body\s*\{[^}]*\}/, '') + '\n' + '#diag-report{position:fixed;inset:0;z-index:10000;overflow:auto;background:#f4f6fb;padding:22px;}\n</style>\n</head>'
);
diag = diag.replace(
  '</body>',
  '\n<div id="diag-report"><h1 style="font:700 20px/1.4 system-ui;margin:0 0 4px">日历自检报告</h1>'
  + '<div class="sub" style="color:#6b7787;font-size:13px;margin-bottom:14px">页面文字不要紧，<b>把最下面那段原始信息整段复制给我就行</b>。</div>'
  + '<div id="verdict" class="summary warn" style="padding:14px 18px;border-radius:12px;font-weight:700;margin-bottom:14px">正在检查…</div>'
  + '<table id="report"></table><div class="box" id="advice" hidden><h2>建议</h2><ul id="adviceList"></ul></div>'
  + '<div class="box"><h2>原始信息（复制这段给我）</h2><div id="raw" style="font:12.5px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all"></div></div></div>'
  + '\n<script>\n' + diagScript + '\n</script>\n</body>'
);
fs.writeFileSync(path.join(CAL, 'diagnose.html'), diag, 'utf8');
console.log('✅ diagnose.html              自检诊断页，' + (Buffer.byteLength(diag, 'utf8') / 1024).toFixed(1) + ' KB（打不开时双击它，把报告发我）');

/* ---------- 4) 网站部署版（docs/）：html 与数据分开，首屏更快 ---------- */
const docs = path.join(CAL, 'docs');
fs.mkdirSync(docs, { recursive: true });
// 脚本与样式改放同目录（js/ 前缀去掉）
const docsHtml = source
  .replace(/<script src="js\/([a-z]+)\.js"><\/script>/g, '<script src="$1.js"></script>')
  .replace('<link rel="stylesheet" href="css/style.css">', '<link rel="stylesheet" href="style.css">');
fs.writeFileSync(path.join(docs, 'index.html'), docsHtml, 'utf8');
['lunar.js', 'festivals.js', 'almanac.js', 'history.js', 'events.js', 'app.js'].forEach(function (f) {
  if (fs.existsSync(path.join(CAL, 'js', f))) {
    fs.copyFileSync(path.join(CAL, 'js', f), path.join(docs, f));
  }
});
fs.writeFileSync(path.join(docs, 'style.css'), css, 'utf8');
fs.writeFileSync(path.join(docs, 'README.txt'),
  '把本文件夹整体上传到任意静态托管（GitHub Pages / 阿里云 OSS / 腾讯云 COS / 网盘静态站）\n'
  + '或放到任意网站目录，访问 index.html 即可。\n\n'
  + '这一版把样式与脚本拆成独立文件，打开更快；功能与 calendar.html 完全相同。\n'
  + '注意：必须通过 http(s) 访问（例如 http://localhost:8000/ ），\n'
  + '这样浏览器才允许保存数据；直接双击 docs/index.html 可能被拦。\n', 'utf8');
console.log('✅ docs/                     网站部署版（' + (fs.readdirSync(docs).length) + ' 个文件，index.html + js/*.js + style.css）');
