/*!
 * 抓取"历史上的今天"数据并生成 js/history.js
 *
 * 数据来源：history.muffinlabs.com（其内容整理自 Wikipedia 的日期条目）
 * 运行：node tools/build-history.cjs
 *
 * 筛选策略（尽量只留"著名"的，不堆砌）：
 *   · 事件：优先留下战争/条约/建国/科学发现/重大灾难/航天等，去掉地方性小事件
 *   · 诞辰：去掉 1940 年后出生者（避免当代娱乐/体育明星），再按知名度关键词筛选
 *   · 忌日：只保留知名度高、且不是当代人物者
 *   · 每天总量控制在 18 条以内，描述截断到 150 字符
 */
'use strict';

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'js', 'history.js');
const CACHE = path.join(__dirname, '.history-cache.json');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/* 明显属于娱乐/体育/当代明星范畴的词，命中则剔除诞辰与忌日 */
const NO_ENTERTAINMENT = [
  'actor', 'actress', 'singer', 'songwriter', 'musician', 'rapper', 'band ', 'guitarist',
  'drummer', 'bassist', 'pianist', 'composer of film', 'film director', 'filmmaker',
  'screenwriter', 'model', 'beauty queen', 'Miss ', 'Playboy', 'television presenter',
  'TV host', 'talk show', 'reality show', 'soap opera', 'professional wrestler',
  'footballer', 'soccer player', 'basketball player', 'baseball player', 'cricketer',
  'tennis player', 'golfer', 'boxer', 'racing driver', 'Formula One', 'NASCAR',
  'Olympic', 'sportsperson', 'athlete', 'cricketer', 'rugby', 'ice hockey', 'NFL ',
  'NBA ', 'comedian', 'stand-up', 'voice actor', 'pornographic', 'adult film',
  'influencer', 'YouTuber', 'streamer', 'DJ ', 'hip hop', 'pop singer', 'rock band'
];

/* 诞辰里"够有名"的领域关键词（命中才保留） */
const NOTABLE_BIRTH = [
  'philosopher', 'physicist', 'chemist', 'mathematician', 'astronomer', 'biologist',
  'scientist', 'inventor', 'engineer', 'physician', 'surgeon', 'anatomist',
  'king', 'queen', 'emperor', 'empress', 'tsar', 'sultan', 'khan', 'shah',
  'president', 'prime minister', 'chancellor', 'statesman', 'politician', 'diplomat',
  'general', 'admiral', 'marshal', 'warrior', 'revolutionary', 'freedom fighter',
  'writer', 'poet', 'novelist', 'playwright', 'essayist', 'author', 'journalist',
  'painter', 'sculptor', 'architect', 'artist', 'printmaker', 'photographer',
  'explorer', 'navigator', 'aviator', 'cosmonaut', 'astronaut', 'mountaineer',
  'economist', 'sociologist', 'historian', 'linguist', 'psychologist', 'theologian',
  'monk', 'priest', 'bishop', 'pope', 'rabbi', 'imam', 'saint', 'missionary',
  'reformer', 'educator', 'philanthropist', 'activist', 'suffragist', 'abolitionist',
  'businessman', 'entrepreneur', 'industrialist', 'banker',
  'lawyer', 'jurist', 'judge', 'civil rights'
];

/* 事件里体现"重大"的关键词 */
const MAJOR_EVENT = [
  'war', 'battle', 'siege', 'invasion', 'treaty', 'peace', 'armistice', 'surrender',
  'independence', 'declares', 'declaration', 'founded', 'establishes', 'established',
  'constitution', 'revolution', 'coup', 'assassinat', 'executed', 'abolish',
  'earthquake', 'flood', 'hurricane', 'typhoon', 'tsunami', 'volcanic', 'famine',
  'plague', 'epidemic', 'pandemic', 'disaster', 'fire destroys', 'sinks', 'crash',
  'discovers', 'discovery', 'patent', 'first ', 'launch', 'lands', 'orbit', 'spacecraft',
  'satellite', 'nobel', 'university', 'cathedral', 'independence', 'empire', 'dynasty',
  'united nations', 'nato', 'european union', 'apollo', 'sputnik', 'atomic', 'nuclear',
  'ends', 'signs', 'opens', 'dedicated', 'becomes the first', 'elected', 'resigns'
];

function hasAny(text, list) {
  const t = String(text).toLowerCase();
  for (let i = 0; i < list.length; i++) if (t.indexOf(list[i].toLowerCase()) >= 0) return true;
  return false;
}

function clean(text) {
  let t = String(text).replace(/\s+/g, ' ').trim();
  // 去掉括号里的生卒年，节省空间
  t = t.replace(/\s*\((?:born |died |c\.)?[^)]*\)\s*$/, '');
  t = t.replace(/^(American |British |French |German |Italian |Spanish |Russian |Chinese |Japanese )?(Revolution|Civil War):\s*/i, '');
  if (t.length > 118) t = t.slice(0, 115) + '…';
  return t;
}

function categoryOf(text) {
  const t = String(text).toLowerCase();
  if (/war|battle|siege|invasion|army|troops|military|navy|front|surrender|armistice|treaty|peace/.test(t)) return '军事';
  if (/president|prime minister|king|queen|emperor|elected|parliament|government|independence|constitution|republic|dynasty|empire|united nations|nato/.test(t)) return '政治';
  if (/discovers|discovery|patent|invent|scientist|physics|chemistry|astronom|nobel|theory|experiment|launch|spacecraft|satellite|orbit|apollo|nuclear|atomic|computer|internet/.test(t)) return '科技';
  if (/earthquake|flood|hurricane|typhoon|tsunami|volcano|famine|plague|epidemic|pandemic|disaster|fire|crash|sinks/.test(t)) return '灾难';
  if (/church|pope|bishop|saint|religion|christian|catholic|buddhis|islam|temple|cathedral|mosque/.test(t)) return '宗教';
  if (/university|school|education|library|museum|academy/.test(t)) return '教育';
  if (/painting|poem|novel|symphony|opera|writer|poet|artist|composer|music|literature|art /.test(t)) return '文化';
  return '其他';
}

async function fetchDay(month, day) {
  const url = `https://history.muffinlabs.com/date/${month}/${day}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const c = new AbortController();
      const timer = setTimeout(() => c.abort(), 20000);
      const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'calendar-history-builder/1.0' } });
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      return j.data;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
    }
  }
}

/** 从已抓取的原始数据里精选条目（第二次运行会直接走这里） */
function pickFromDay(data) {
  const events = (data.Events || [])
    .map((e) => ({ year: parseInt(e.year, 10), text: clean(e.text) }))
    .filter((e) => e.year > 0 && e.year <= 2024 && e.text.length > 15);
  const birthsAll = (data.Births || [])
    .map((e) => ({ year: parseInt(e.year, 10), text: clean(e.text) }))
    .filter((e) => e.year > 0 && e.year <= 1940 && e.text.length > 5)
    .filter((e) => !hasAny(e.text, NO_ENTERTAINMENT))
    .filter((e) => hasAny(e.text, NOTABLE_BIRTH));
  const deathsAll = (data.Deaths || [])
    .map((e) => ({ year: parseInt(e.year, 10), text: clean(e.text) }))
    .filter((e) => e.year > 0 && e.year <= 1940 && e.text.length > 5)
    .filter((e) => !hasAny(e.text, NO_ENTERTAINMENT))
    .filter((e) => hasAny(e.text, NOTABLE_BIRTH));

  // 从描述里取出人名（"名字, 职业" / "名字 (…)" 形式），用于判断知名度
  const nameOf = (t) => {
    const cut = t.split(',')[0].split('(')[0].trim();
    return cut.length >= 3 && cut.length <= 40 ? cut : '';
  };
  const deathNames = new Set(deathsAll.map((d) => nameOf(d.text)).filter(Boolean));
  const eventText = events.map((e) => e.text.toLowerCase()).join(' \n ');
  const mentionedInEvents = (name) => name && name.length > 4 && eventText.indexOf(name.toLowerCase()) >= 0;

  const out = [];
  const seen = new Set();
  const push = (type, year, text, cat) => {
    const k = year + '|' + text.slice(0, 24);
    if (seen.has(k) || out.length >= 12) return;
    seen.add(k);
    out.push({ type: type, year: year, text: text, cat: cat });
  };

  // 1) 事件：重大优先，按年份均匀取样
  const major = events.filter((e) => hasAny(e.text, MAJOR_EVENT));
  const minor = events.filter((e) => !hasAny(e.text, MAJOR_EVENT));
  const sample = (pool, want) => {
    if (!pool.length) return;
    const step = Math.max(1, Math.floor(pool.length / want));
    for (let i = 0; i < pool.length && i < step * want; i += step) {
      push('event', pool[i].year, pool[i].text, categoryOf(pool[i].text));
    }
  };
  sample(major, 5);
  sample(minor, 3);

  // 2) 诞辰：优先"生平也被记入历史"（更知名）的人
  const famous = birthsAll.filter((b) => deathNames.has(nameOf(b.text)) || mentionedInEvents(nameOf(b.text)));
  const others = birthsAll.filter((b) => famous.indexOf(b) < 0);
  const pickBirths = (pool, want) => {
    if (!pool.length) return;
    const step = Math.max(1, Math.floor(pool.length / want));
    for (let i = 0; i < pool.length && i < step * want; i += step) {
      push('birth', pool[i].year, pool[i].text, '人物');
    }
  };
  pickBirths(famous, 3);
  pickBirths(others, 2);

  // 3) 忌日：补满到 12 条
  const pickDeaths = (want) => {
    if (!deathsAll.length) return;
    const step = Math.max(1, Math.floor(deathsAll.length / want));
    for (let i = 0; i < deathsAll.length && i < step * want; i += step) {
      push('death', deathsAll[i].year, deathsAll[i].text, '忌日');
    }
  };
  pickDeaths(3);

  out.sort((a, b) => a.year - b.year);
  return out;
}

/** 人工精选条目：保证进入当天列表，并排在前面 */
const CURATED = require(path.join(__dirname, 'curated-history.cjs')).EVENTS;
const curatedByDay = {};
CURATED.forEach(([m, d, y, t, c]) => {
  const k = m + '-' + d;
  (curatedByDay[k] = curatedByDay[k] || []).push({
    type: c === '诞辰' ? 'birth' : (c === '忌日' ? 'death' : 'event'),
    year: y, text: t, cat: c, curated: true
  });
});

(async function main() {
  let cache = {};
  if (fs.existsSync(CACHE)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { cache = {}; }
    console.log('已加载缓存', Object.keys(cache).length, '天');
  }

  const result = {};
  let fetched = 0, failed = [];
  for (let m = 1; m <= 12; m++) {
    const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    for (let d = 1; d <= days; d++) {
      const key = m + '-' + d;
      if (!cache[key]) {
        try {
          cache[key] = await fetchDay(m, d);
          fetched++;
          if (fetched % 20 === 0) {
            console.log(`  已抓取 ${fetched} 天…`);
            fs.writeFileSync(CACHE, JSON.stringify(cache), 'utf8');
          }
          await new Promise((r) => setTimeout(r, 120));   // 对源站友好
        } catch (e) {
          failed.push(key + ' (' + e.message + ')');
          continue;
        }
      }
      result[key] = (curatedByDay[key] || []).concat(pickFromDay(cache[key]));
    }
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache), 'utf8');

  console.log(`\n抓取完成：新增 ${fetched} 天，失败 ${failed.length} 天`);
  if (failed.length) console.log('  失败清单:', failed.slice(0, 10).join(', '));

  const total = Object.keys(result).reduce((s, k) => s + result[k].length, 0);
  console.log(`覆盖 ${Object.keys(result).length} 天，共 ${total} 条，平均每天 ${(total / Object.keys(result).length).toFixed(1)} 条`);

  // 生成 js/history.js
  const lines = [];
  lines.push('/*!');
  lines.push(' * history.js —— 历史上的今天（事件 / 名人诞辰 / 忌日）');
  lines.push(' *');
  lines.push(' * 数据来源：history.muffinlabs.com（内容整理自 Wikipedia 各日期条目）');
  lines.push(' * 由 tools/build-history.cjs 自动生成，请勿手工修改。');
  lines.push(' *');
  lines.push(' * 字段：{ y: 年份, t: 描述, c: 类别, k: 类型(event/birth/death), p: 是否为人工精选 }');
  lines.push(' *   · 人工精选条目（p:1）来自 tools/curated-history.cjs，排在每天列表前面；');
  lines.push(' *   · 其余由脚本从抓取数据中筛选，已剔除娱乐/体育类明星与 1940 年后出生的当代人物。');
  lines.push(' */');
  lines.push('(function (root, factory) {');
  lines.push('  var api = factory();');
  lines.push('  root.HistoryDB = api;');
  lines.push("  if (typeof module !== 'undefined' && module.exports) module.exports = api;");
  lines.push("})(typeof globalThis !== 'undefined' ? globalThis : this, function () {");
  lines.push("  'use strict';");
  lines.push('  var RAW = {');
  Object.keys(result).sort((a, b) => {
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return pa[0] - pb[0] || pa[1] - pb[1];
  }).forEach((key) => {
    const arr = result[key].map((e) => {
      var s = `{y:${e.year},t:${JSON.stringify(e.text)},c:${JSON.stringify(e.cat)},k:${JSON.stringify(e.type)}`;
      if (e.curated) s += ',p:1';
      return s + '}';
    });
    lines.push(`    '${key}': [${arr.join(',')}],`);
  });
  lines.push('  };');
  lines.push('  function of(month, day) { return RAW[month + "-" + day] || []; }');
  lines.push('  function count() { var n = 0; for (var k in RAW) n += RAW[k].length; return n; }');
  lines.push('  return { RAW: RAW, of: of, count: count };');
  lines.push('});');
  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
  console.log('已生成', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
})();
