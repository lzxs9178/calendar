/*!
 * app.js —— 万年历界面逻辑
 * 视图：月 / 年 / 列表；数据：localStorage；内置节日 + 用户日程
 */
(function () {
  'use strict';

  var L = window.Lunar;
  var DB = window.FestivalDB;
  var ES = window.EventStore;
  var AL = window.Almanac;      // 黄历引擎（可选，缺失时自动隐藏黄历相关界面）
  var HD = window.HistoryDB;    // 历史上的今天（可选）

  var LS_EVENTS = 'dsh-calendar/events/v1';
  var LS_SETTINGS = 'dsh-calendar/settings/v1';
  var LS_SEEDED = 'dsh-calendar/seeded/v1';

  var WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
  var CAT_ORDER = { holiday: 0, birthday: 1, anniversary: 2, todo: 3, memo: 4 };
  var AUTO_COLOR = 'auto';

  var state = {
    view: 'month',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    selected: ES.todayKey(),
    query: '',
    events: [],
    settings: {
      lunar: true,
      almanac: true,
      history: true,
      festivals: true,
      rare: true,
      weekStart: 0,
      weekNumbers: false,
      dense: false,
      theme: 'light'
    }
  };

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  /* ---------------- 安全存储 ----------------
   * 用 file:// 直接打开时，部分浏览器把页面当作不透明来源，
   * 连 localStorage.getItem() 都会抛 SecurityError。这里统一包一层：
   * 能用就用 localStorage，不能用就退回内存（功能照旧，只是关掉页面后不保留）。
   */
  var memoryStore = {};
  var storage = {
    ok: false,        // 是否真的能持久化
    reason: ''
  };

  function storageGet(key) {
    if (storage.ok) {
      try { return window.localStorage.getItem(key); } catch (e) { /* 中途失效则退回内存 */ }
    }
    return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
  }

  function storageSet(key, value) {
    memoryStore[key] = String(value);
    if (storage.ok) {
      try { window.localStorage.setItem(key, String(value)); } catch (e) { /* 忽略 */ }
    }
  }

  function storageRemove(key) {
    delete memoryStore[key];
    if (storage.ok) {
      try { window.localStorage.removeItem(key); } catch (e) { /* 忽略 */ }
    }
  }

  (function initStorage() {
    try {
      var probe = '__calendar_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      storage.ok = true;
    } catch (e) {
      storage.ok = false;
      storage.reason = (e && e.name === 'SecurityError')
        ? '当前是直接双击打开（file://），浏览器禁止网页保存数据'
        : '浏览器存储不可用';
    }
  })();

  /* ---------------- 存储 ---------------- */
  function loadAll() {
    try {
      var raw = storageGet(LS_EVENTS);
      state.events = raw ? ES.fromJSON(raw) : [];
    } catch (e) { state.events = []; }
    try {
      var s = JSON.parse(storageGet(LS_SETTINGS) || '{}');
      Object.assign(state.settings, s);
    } catch (e) { /* 忽略 */ }
    applySettings();
  }

  function saveEvents() {
    try {
      storageSet(LS_EVENTS, ES.toJSON(state.events));
      if (!storage.ok) noteMemoryOnly();
    } catch (e) { toast('保存失败：' + (e.message || '存储不可用')); }
  }

  function saveSettings() {
    try { storageSet(LS_SETTINGS, JSON.stringify(state.settings)); } catch (e) { /* 忽略 */ }
    applySettings();
  }

  function applySettings() {
    var s = state.settings;
    document.documentElement.setAttribute('data-theme', s.theme === 'dark' ? 'dark' : 'light');
    document.getElementById('app').classList.toggle('dense', !!s.dense);
    $('setLunar').checked = !!s.lunar;
    $('setAlmanac').checked = !!s.almanac;
    $('setHistory').checked = !!s.history;
    $('setFestivals').checked = !!s.festivals;
    $('setRare').checked = !!s.rare;
    $('setWeekStart').checked = s.weekStart === 1;
    $('setWeekNumbers').checked = !!s.weekNumbers;
    $('setDense').checked = !!s.dense;
  }

  /* ---------------- 工具 ---------------- */
  function isRare(item) { return (item.tags || []).indexOf('冷门') >= 0; }

  function visibleFestivals(date) {
    if (!state.settings.festivals) return [];
    var list = DB.forDate(date);
    return list.filter(function (i) { return state.settings.rare || !isRare(i); });
  }

  /* ---------------- 黄历（黄道吉日 / 宜忌） ---------------- */
  var almanacCache = Object.create(null);
  function almanacOf(key) {
    if (!AL || !state.settings.almanac) return null;
    if (almanacCache[key]) return almanacCache[key];
    try {
      var d = ES.dateOf(key);
      var info = AL.of({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
      almanacCache[key] = info;
      return info;
    } catch (e) { return null; }
  }
  function almanacEnabled() { return !!AL && !!state.settings.almanac; }

  /* ---------------- 历史上的今天 ---------------- */
  var HIST_CAT_CLASS = {
    '军事': 'h-mil', '政治': 'h-pol', '科技': 'h-sci', '灾难': 'h-dis',
    '文化': 'h-cul', '宗教': 'h-rel', '教育': 'h-edu', '诞辰': 'h-birth',
    '忌日': 'h-death', '其他': 'h-other'
  };
  function historyOf(key) {
    if (!HD || !state.settings.history) return [];
    try {
      var p = String(key).split('-');
      return HD.of(+p[1], +p[2]) || [];
    } catch (e) { return []; }
  }
  function historyEnabled() { return !!HD && !!state.settings.history; }

  function userEventsOn(key) {
    return state.events.filter(function (ev) { return ES.occursOn(ev, key); }).sort(ES.compare);
  }

  function chipClass(item) {
    if (item.rule === 'term' || item.cat === '节气') return 'term';
    if ((item.tags || []).indexOf('法定假期') >= 0) return 'holiday';
    return 'festival';
  }

  /* ---------------- 月视图 ---------------- */
  function renderWeekdays() {
    var host = $('weekdays');
    host.innerHTML = '';
    host.classList.toggle('with-weekno', !!state.settings.weekNumbers);
    if (state.settings.weekNumbers) host.appendChild(el('span', '', '周'));
    for (var i = 0; i < 7; i++) {
      var d = (i + state.settings.weekStart) % 7;
      var s = el('span', (d === 0 || d === 6) ? 'wk-end' : '', '周' + WEEK_CN[d]);
      host.appendChild(s);
    }
  }

  function renderMonth() {
    var host = $('grid');
    host.innerHTML = '';
    host.classList.toggle('with-weekno', !!state.settings.weekNumbers);
    renderWeekdays();

    var cells = L.monthGrid(state.year, state.month, state.settings.weekStart);
    var todayKey = ES.todayKey();
    var q = state.query.trim().toLowerCase();

    cells.forEach(function (dt) {
      var key = ES.keyOf(dt);
      var inMonth = dt.getMonth() === state.month - 1;
      var cell = el('div', 'day');
      if (!inMonth) cell.classList.add('other');
      if (key === todayKey) cell.classList.add('today');
      if (key === state.selected) cell.classList.add('selected');
      if (dt.getDay() === 0 || dt.getDay() === 6) cell.classList.add('weekend');
      cell.dataset.key = key;

      var top = el('div', 'day-top');
      top.appendChild(el('span', 'day-num', String(dt.getDate())));

      // 右侧信息区：黄道吉日标记 + 农历（放在同一个 flex 容器里，自动防重叠）
      var topRight = el('div', 'day-top-right');

      var alm = almanacOf(key);
      if (alm && alm.isYellow && !(alm.taboos && alm.taboos.some(function (t) { return t.level === 'major'; }))) {
        var ji = el('span', 'luck-dot', '吉');
        ji.title = '黄道吉日 · ' + alm.jianChu + '日 · ' + alm.god;
        topRight.appendChild(ji);
      }

      var lunarInfo = L.fromSolar(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
      var label = '', labelCls = 'day-lunar';
      if (state.settings.lunar && lunarInfo) {
        if (lunarInfo.isTerm) { label = lunarInfo.term; labelCls += ' term'; }
        else if (lunarInfo.lDay === 1) { label = lunarInfo.monthCn; }
        else { label = lunarInfo.dayCn; }
      }
      topRight.appendChild(el('span', labelCls, label));
      top.appendChild(topRight);
      cell.appendChild(top);

      var chips = el('div', 'chips');
      var fests = visibleFestivals(dt);
      var evs = userEventsOn(key);
      var items = [];

      // 除夕 / 节气等优先展示
      fests.forEach(function (f) {
        items.push({
          text: f.name, cls: chipClass(f), kind: 'fest', title: f.note || f.name
        });
      });
      evs.forEach(function (ev) {
        var years = ES.anniversaryYears(ev, key);
        var prefix = ev.category === 'birthday' ? '🎂 ' : (ev.category === 'anniversary' ? '❤ ' : '');
        var suffix = years ? '（' + years + '周年）' : '';
        items.push({
          text: prefix + ev.title + suffix,
          cls: 'user' + (ev.color ? ' colored' : ''),
          kind: 'event',
          ev: ev,
          title: ev.title + ' · ' + (ES.CATEGORY_LABEL[ev.category] || '') + ' · ' + ES.repeatText(ev)
        });
      });

      // 命中高亮
      var matched = q && items.some(function (it) { return it.text.toLowerCase().indexOf(q) >= 0; });
      if (matched) cell.classList.add('match');

      var maxChips = state.settings.dense ? 2 : (inMonth ? 3 : 2);
      items.slice(0, maxChips).forEach(function (it) {
        var chip = el('button', 'chip ' + it.cls, it.text);
        chip.title = it.title;
        if (it.kind === 'event') {
          chip.dataset.eventId = it.ev.id;
          if (it.ev.color && it.ev.color !== AUTO_COLOR) chip.style.borderLeftColor = it.ev.color;
          chip.addEventListener('click', function (e) {
            e.stopPropagation();
            openEditor(it.ev);
          });
        }
        chips.appendChild(chip);
      });
      if (items.length > maxChips) {
        chips.appendChild(el('span', 'chip more', '还有 ' + (items.length - maxChips) + ' 项…'));
      }
      cell.appendChild(chips);

      cell.addEventListener('click', function () { openDay(key); });
      host.appendChild(cell);
    });

    if (state.settings.weekNumbers) addWeekNumbers();
    updateHeader();
    renderSidebar();
    renderMobilePanel();
  }

  function addWeekNumbers() {
    // 在每行左侧插入周序号：重排为 8 列
    var host = $('grid');
    var cells = Array.prototype.slice.call(host.children);
    var settings = state.settings;
    host.innerHTML = '';
    for (var i = 0; i < cells.length; i += 7) {
      var row = cells.slice(i, i + 7);
      var first = ES.dateOf(row[0].dataset.key);
      host.appendChild(el('div', 'weekno', 'W' + isoWeek(first)));
      row.forEach(function (c) { host.appendChild(c); });
    }
  }

  function isoWeek(date) {
    var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    var day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  function updateHeader() {
    var y = state.year, m = state.month;
    if (state.view === 'list') {
      $('viewTitle').textContent = '日程总览';
      $('viewSubtitle').textContent = '未来 90 天与全部生日 / 纪念日';
    } else {
      $('viewTitle').textContent = y + ' 年 ' + m + ' 月';
      var l = L.fromSolar(y, m, 15);
      $('viewSubtitle').textContent = l ? (l.gzYear + '年 · ' + l.animal + '年') : '';
    }
    var total = state.events.length;
    $('statusCount').textContent = '共 ' + total + ' 条日程';
    if (storage.ok) {
      $('statusRange').textContent = '农历与节气支持 ' + L.MIN_YEAR + '–' + L.MAX_YEAR + ' 年';
    } else {
      $('statusRange').textContent = '⚠ 无法保存数据（' + storage.reason + '）——数据仅保留在本次会话，可用“数据 → 导出 JSON”备份';
    }
  }

  /* ---------------- 侧栏 ---------------- */
  function renderSidebar() {
    renderTodayCard();
    renderUpcoming();
    renderMonthPanel();
  }

  function renderTodayCard() {
    var host = $('todayCard');
    host.innerHTML = '';
    var body = el('div', 'card-body');
    var now = new Date();
    var key = ES.todayKey();
    var l = L.fromSolar(now.getFullYear(), now.getMonth() + 1, now.getDate());
    body.appendChild(el('div', 'big', now.getDate() + ' 日'));
    body.appendChild(el('div', 'sub', now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 · 星期' + WEEK_CN[now.getDay()]));
    var lunarRow = el('div', 'lunar');
    if (l) {
      lunarRow.appendChild(el('span', 'pill', '农历' + l.monthCn + l.dayCn));
      if (l.isTerm) lunarRow.appendChild(el('span', 'pill', l.term));
      lunarRow.appendChild(el('span', 'pill', l.gzYear + '年'));
      lunarRow.appendChild(el('span', 'pill', l.animal + '年'));
    }
    body.appendChild(lunarRow);

    var fests = visibleFestivals(now);
    if (fests.length) {
      var fr = el('div', 'lunar');
      fests.slice(0, 4).forEach(function (f) { fr.appendChild(el('span', 'pill', f.name)); });
      body.appendChild(fr);
    }

    // 今日黄历（黄道吉日 / 宜忌摘录）
    var almToday = almanacOf(key);
    if (almToday) {
      var ab = el('div', 'today-almanac');
      var head = el('div', 'lunar');
      head.appendChild(el('span', 'pill', almToday.huangDaoText));
      head.appendChild(el('span', 'pill', almToday.jianChu + '日'));
      head.appendChild(el('span', 'pill', '宿' + almToday.xiu.name));
      ab.appendChild(head);
      var yi = el('div', 'alm-act');
      yi.appendChild(el('span', 'alm-tag yi', '宜'));
      almToday.yi.slice(0, 5).forEach(function (x) { yi.appendChild(el('span', 'alm-item', x)); });
      ab.appendChild(yi);
      var ji = el('div', 'alm-act');
      ji.appendChild(el('span', 'alm-tag ji', '忌'));
      almToday.ji.slice(0, 5).forEach(function (x) { ji.appendChild(el('span', 'alm-item', x)); });
      ab.appendChild(ji);
      ab.style.cursor = 'pointer';
      ab.addEventListener('click', function () { openDay(key); });
      body.appendChild(ab);
    }
    var quick = el('div', 'quick-add');
    quick.style.marginTop = '12px';
    var input = el('input');
    input.placeholder = '今天要做的事…';
    input.id = 'quickInput';
    var btn = el('button', 'btn', '添加');
    btn.style.background = 'rgba(255,255,255,.22)';
    btn.style.borderColor = 'transparent';
    btn.style.color = '#fff';
    btn.addEventListener('click', function () { quickAdd(input.value, key); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') quickAdd(input.value, key); });
    quick.appendChild(input);
    quick.appendChild(btn);
    body.appendChild(quick);
    host.appendChild(body);
  }

  function quickAdd(title, key) {
    if (!title || !title.trim()) return;
    state.events.push(ES.create({ title: title.trim(), date: key, category: 'memo', repeat: 'none' }));
    saveEvents();
    toast('已添加：' + title.trim());
    render();
  }

  function upcomingItems(days) {
    var out = [];
    var from = ES.todayKey();
    state.events.forEach(function (ev) {
      var next = ES.nextOccurrence(ev, from, days);
      if (!next) return;
      out.push({ ev: ev, date: next, diff: ES.dayNoOf(next) - ES.dayNoOf(from) });
    });
    out.sort(function (a, b) { return a.diff - b.diff || ES.compare(a.ev, b.ev); });
    return out;
  }

  function renderUpcoming() {
    var host = $('upcomingList');
    host.innerHTML = '';
    var items = upcomingItems(3660).slice(0, 12);
    $('upcomingCount').textContent = items.length ? items.length + ' 条' : '';
    if (!items.length) {
      host.appendChild(el('p', 'hint', '还没有日程。点右上角“新建”，或直接点日历上的某一天添加。'));
      return;
    }
    items.forEach(function (it) {
      var row = el('div', 'mini-row-item');
      var d = ES.dateOf(it.date);
      var dbox = el('div', 'd');
      dbox.appendChild(el('b', '', String(d.getDate())));
      dbox.appendChild(el('small', '', (d.getMonth() + 1) + '月'));
      row.appendChild(dbox);

      var t = el('div', 't');
      var years = ES.anniversaryYears(it.ev, it.date);
      var b = el('b', '', (it.ev.category === 'birthday' ? '🎂 ' : it.ev.category === 'anniversary' ? '❤ ' : '') + it.ev.title);
      t.appendChild(b);
      var sub = ES.CATEGORY_LABEL[it.ev.category] + ' · ' + ES.repeatText(it.ev);
      if (years) sub += ' · 第 ' + years + ' 年';
      t.appendChild(el('small', '', sub));
      row.appendChild(t);

      var cd = el('div', 'cd');
      if (it.diff === 0) cd.innerHTML = '<b>今天</b>';
      else if (it.diff === 1) cd.innerHTML = '<b>明天</b>';
      else cd.innerHTML = '<b>' + it.diff + '</b> 天后';
      row.appendChild(cd);

      row.addEventListener('click', function () { openEditor(it.ev); });
      row.style.cursor = 'pointer';
      host.appendChild(row);
    });
  }

  function renderMonthPanel() {
    var host = $('monthPanel');
    host.innerHTML = '';
    var y = state.year, m = state.month;
    $('monthPanelTitle').textContent = m + ' 月节日与日程';
    var days = L.solarMonthDays(y, m);
    var rows = [];

    for (var d = 1; d <= days; d++) {
      var dt = new Date(y, m - 1, d);
      var key = ES.keyOf(dt);
      var evs = userEventsOn(key);
      var fests = visibleFestivals(dt);
      if (!evs.length && !fests.length) continue;
      // 排序优先级：用户生日 > 法定假期 > 用户其他 > 节气 > 其他节日
      var weight = 9;
      if (evs.some(function (e) { return e.category === 'birthday'; })) weight = 0;
      else if (fests.some(function (f) { return (f.tags || []).indexOf('法定假期') >= 0; })) weight = 1;
      else if (evs.length) weight = 2;
      else if (fests.some(function (f) { return f.cat === '节气'; })) weight = 3;
      else weight = 4;
      rows.push({ day: d, key: key, evs: evs, fests: fests, weight: weight });
    }
    rows.sort(function (a, b) { return a.weight - b.weight || a.day - b.day; });

    if (!rows.length) {
      host.appendChild(el('p', 'hint', '本月没有节日与日程记录。'));
      return;
    }
    rows.slice(0, 40).forEach(function (r) {
      var row = el('div', 'mini-row-item');
      var dbox = el('div', 'd');
      dbox.appendChild(el('b', '', String(r.day)));
      dbox.appendChild(el('small', '', '周' + WEEK_CN[new Date(r.key.replace(/-/g, '/')).getDay()]));
      row.appendChild(dbox);

      var t = el('div', 't');
      var names = [];
      r.evs.forEach(function (e) { names.push((e.category === 'birthday' ? '🎂 ' : '') + e.title); });
      r.fests.slice(0, 3).forEach(function (f) { names.push(f.name); });
      t.appendChild(el('b', '', names.slice(0, 2).join(' · ')));
      if (names.length > 2) t.appendChild(el('small', '', '还有 ' + (names.length - 2) + ' 项：' + names.slice(2, 5).join('、')));
      else if (r.fests.length && r.fests[0].note) t.appendChild(el('small', '', r.fests[0].note));
      row.appendChild(t);
      row.style.cursor = 'pointer';
      row.addEventListener('click', function () {
        state.selected = r.key;
        openDay(r.key);
      });
      host.appendChild(row);
    });
  }

  function renderMobilePanel() {
    var host = $('mobilePanel');
    host.innerHTML = '';
    var wrap = el('div', 'card');
    var head = el('div', 'card-head');
    head.appendChild(el('h2', '', '即将到来'));
    wrap.appendChild(head);
    var body = el('div', 'card-body');
    var items = upcomingItems(3660).slice(0, 8);
    if (!items.length) body.appendChild(el('p', 'hint', '还没有日程，点击日期格子即可添加。'));
    items.forEach(function (it) {
      var row = el('div', 'mini-row-item');
      var d = ES.dateOf(it.date);
      var dbox = el('div', 'd');
      dbox.appendChild(el('b', '', String(d.getDate())));
      dbox.appendChild(el('small', '', (d.getMonth() + 1) + '月'));
      row.appendChild(dbox);
      var t = el('div', 't');
      t.appendChild(el('b', '', it.ev.title));
      t.appendChild(el('small', '', ES.CATEGORY_LABEL[it.ev.category] + ' · ' + ES.repeatText(it.ev)));
      row.appendChild(t);
      var cd = el('div', 'cd');
      cd.innerHTML = it.diff === 0 ? '<b>今天</b>' : '<b>' + it.diff + '</b> 天后';
      row.appendChild(cd);
      row.style.cursor = 'pointer';
      row.addEventListener('click', function () { openEditor(it.ev); });
      body.appendChild(row);
    });
    wrap.appendChild(body);
    host.appendChild(wrap);
  }

  /* ---------------- 年视图 ---------------- */
  function renderYear() {
    var host = $('viewHost');
    host.innerHTML = '';
    var wrap = el('div', 'year-grid');
    var todayKey = ES.todayKey();
    var q = state.query.trim().toLowerCase();

    for (var m = 1; m <= 12; m++) {
      var mini = el('div', 'mini');
      if (m === state.month) mini.classList.add('current');
      var head = el('h3');
      head.appendChild(document.createTextNode(m + ' 月'));
      var l15 = L.fromSolar(state.year, m, 15);
      if (l15) head.appendChild(el('small', '', l15.animal + '年'));
      mini.appendChild(head);

      var wk = el('div', 'mini-head');
      for (var i = 0; i < 7; i++) wk.appendChild(el('span', '', WEEK_CN[(i + state.settings.weekStart) % 7]));
      mini.appendChild(wk);

      var body = el('div', 'mini-row');
      var cells = L.monthGrid(state.year, m, state.settings.weekStart);
      cells.forEach(function (dt) {
        var c = el('div', 'mini-cell');
        if (dt.getMonth() !== m - 1) { c.classList.add('out'); body.appendChild(c); return; }
        c.textContent = String(dt.getDate());
        var key = ES.keyOf(dt);
        if (key === todayKey) c.classList.add('today');
        var fests = visibleFestivals(dt);
        var hasHoliday = fests.some(function (f) { return (f.tags || []).indexOf('法定假期') >= 0; });
        var hasTerm = fests.some(function (f) { return f.cat === '节气'; });
        if (hasHoliday) c.classList.add('holiday');
        else if (fests.length) c.classList.add('fest');
        else if (hasTerm) c.classList.add('term');
        var evs = userEventsOn(key);
        if (evs.length) c.classList.add('user');
        if (q) {
          var text = fests.map(function (f) { return f.name; }).concat(evs.map(function (e) { return e.title; })).join(' ').toLowerCase();
          if (text.indexOf(q) >= 0) c.classList.add('match');
          if (c.classList.contains('match')) c.style.outline = '2px solid #e0a300';
        }
        c.title = fests.map(function (f) { return f.name; }).concat(evs.map(function (e) { return e.title; })).join(' · ');
        c.addEventListener('click', function (e) {
          e.stopPropagation();
          state.year = dt.getFullYear(); state.month = dt.getMonth() + 1; state.selected = key;
          setView('month');
        });
        body.appendChild(c);
      });
      mini.appendChild(body);
      mini.addEventListener('click', function () {
        state.month = m;
        setView('month');
      });
      wrap.appendChild(mini);
    }
    host.appendChild(wrap);
  }

  /* ---------------- 列表视图 ---------------- */
  function renderList() {
    var host = $('viewHost');
    host.innerHTML = '';
    var wrap = el('div', 'list-wrap');
    var q = state.query.trim().toLowerCase();

    // 1) 未来 90 天发生的事
    var from = ES.todayKey();
    var to = ES.keyOfDayNo(ES.dayNoOf(from) + 90);
    var occurrences = [];
    state.events.forEach(function (ev) {
      ES.occurrencesInRange(ev, from, to).forEach(function (k) {
        occurrences.push({ ev: ev, key: k, diff: ES.dayNoOf(k) - ES.dayNoOf(from) });
      });
    });
    // 未来 90 天内没有、但有下次发生的，补在末尾
    state.events.forEach(function (ev) {
      if (occurrences.some(function (o) { return o.ev.id === ev.id; })) return;
      var next = ES.nextOccurrence(ev, from, 3660);
      if (next) occurrences.push({ ev: ev, key: next, diff: ES.dayNoOf(next) - ES.dayNoOf(from) });
    });
    occurrences.sort(function (a, b) { return a.diff - b.diff || ES.compare(a.ev, b.ev); });
    if (q) {
      occurrences = occurrences.filter(function (o) {
        return (o.ev.title + ' ' + o.ev.note + ' ' + (o.ev.tags || []).join(' ')).toLowerCase().indexOf(q) >= 0;
      });
    }

    wrap.appendChild(el('div', 'list-group-title', '我的日程（' + occurrences.length + '）'));
    if (!occurrences.length) {
      wrap.appendChild(el('div', 'empty', q ? '没有匹配“' + state.query + '”的日程' : '还没有日程，点击右上角“新建”开始记录'));
    }
    occurrences.slice(0, 300).forEach(function (o) {
      wrap.appendChild(listRow(o.ev, o.key, o.diff));
    });

    // 2) 本月的节日
    wrap.appendChild(el('div', 'list-group-title', state.year + ' 年 ' + state.month + ' 月节日'));
    var count = 0;
    for (var d = 1; d <= L.solarMonthDays(state.year, state.month); d++) {
      var dt = new Date(state.year, state.month - 1, d);
      var fests = visibleFestivals(dt);
      if (q) fests = fests.filter(function (f) { return f.name.toLowerCase().indexOf(q) >= 0; });
      fests.forEach(function (f) {
        count++;
        var row = el('div', 'row');
        var rd = el('div', 'row-date');
        rd.appendChild(el('b', '', String(d)));
        rd.appendChild(el('small', '', '周' + WEEK_CN[dt.getDay()]));
        row.appendChild(rd);
        var main = el('div', 'row-main');
        main.appendChild(el('b', '', f.name));
        if (f.note) main.appendChild(el('p', '', f.note));
        var meta = el('div', 'row-meta');
        meta.appendChild(el('span', 'tag cat', f.cat));
        (f.tags || []).forEach(function (t) { if (t !== '冷门') meta.appendChild(el('span', 'tag', t)); });
        main.appendChild(meta);
        row.appendChild(main);
        wrap.appendChild(row);
      });
    }
    if (!count) wrap.appendChild(el('div', 'empty', '本月没有匹配的节日'));

    host.appendChild(wrap);
  }

  function listRow(ev, key, diff) {
    var row = el('div', 'row');
    var d = ES.dateOf(key);
    var rd = el('div', 'row-date');
    rd.appendChild(el('b', '', String(d.getDate())));
    rd.appendChild(el('small', '', (d.getMonth() + 1) + '月'));
    row.appendChild(rd);

    var main = el('div', 'row-main');
    var years = ES.anniversaryYears(ev, key);
    var title = el('b', '', (ev.category === 'birthday' ? '🎂 ' : ev.category === 'anniversary' ? '❤ ' : '') + ev.title);
    if (ev.color && ev.color !== AUTO_COLOR) title.style.color = ev.color;
    main.appendChild(title);
    if (ev.note) main.appendChild(el('p', '', ev.note));
    var meta = el('div', 'row-meta');
    meta.appendChild(el('span', 'tag cat', ES.CATEGORY_LABEL[ev.category] || ''));
    meta.appendChild(el('span', 'tag', ES.repeatText(ev)));
    if (years) meta.appendChild(el('span', 'tag', '第 ' + years + ' 年'));
    if (diff !== undefined) {
      meta.appendChild(el('span', 'tag', diff === 0 ? '今天' : diff + ' 天后'));
    }
    if (ev.calendar === 'lunar') {
      var l = L.fromSolar(d.getFullYear(), d.getMonth() + 1, d.getDate());
      if (l) meta.appendChild(el('span', 'tag', '农历' + l.monthCn + l.dayCn));
    }
    (ev.tags || []).forEach(function (t) { meta.appendChild(el('span', 'tag', '#' + t)); });
    main.appendChild(meta);
    row.appendChild(main);

    var actions = el('div', 'row-actions');
    var edit = el('button', 'btn ghost small', '编辑');
    edit.addEventListener('click', function () { openEditor(ev); });
    actions.appendChild(edit);
    row.appendChild(actions);
    return row;
  }

  /* ---------------- 日期详情 ---------------- */
  function openDay(key) {
    state.selected = key;
    var d = ES.dateOf(key);
    var l = L.fromSolar(d.getFullYear(), d.getMonth() + 1, d.getDate());
    $('dayTitle').textContent = d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · 周' + WEEK_CN[d.getDay()];
    var body = $('dayBody');
    body.innerHTML = '';

    var head = el('div', 'day-detail-head');
    head.appendChild(el('span', 'big', String(d.getDate())));
    var info = el('div');
    if (l) {
      info.appendChild(el('div', '', '农历 ' + l.monthCn + l.dayCn + (l.isLeap ? '（闰月）' : '')));
      info.appendChild(el('div', 'muted small', l.gzYear + '年 · ' + l.animal + '年 · ' + l.yearCn));
    }
    head.appendChild(info);
    body.appendChild(head);

    if (l && l.isTerm) {
      body.appendChild(el('div', 'section-label', '节气'));
      var pl = el('div', 'pill-list');
      pl.appendChild(el('span', 'pill term', l.term + ' · ' + L.termDate(d.getFullYear(), L.TERM_NAMES.indexOf(l.term) + 1).time));
      body.appendChild(pl);
    }

    var fests = visibleFestivals(d);
    if (fests.length) {
      body.appendChild(el('div', 'section-label', '节日 / 纪念日'));
      var fl2 = el('div', 'pill-list');
      fests.forEach(function (f) {
        var p = el('span', 'pill ' + (chipClass(f) === 'festival' ? 'festival' : chipClass(f)), f.name);
        p.title = f.note || '';
        fl2.appendChild(p);
      });
      body.appendChild(fl2);
    }

    // ---- 黄历：黄道吉日 / 宜忌 ----
    var alm = almanacOf(key);
    if (alm) {
      body.appendChild(el('div', 'section-label', '黄历'));
      var almanacBox = el('div', 'almanac');
      var line1 = el('div', 'alm-line');
      line1.appendChild(el('span', 'pill ' + (alm.isYellow ? 'alm-yellow' : 'alm-black'), alm.huangDaoText));
      line1.appendChild(el('span', 'pill', alm.jianChu + '日'));
      line1.appendChild(el('span', 'pill', alm.god));
      line1.appendChild(el('span', 'pill', '宿' + alm.xiu.full));
      almanacBox.appendChild(line1);
      var line2 = el('div', 'alm-gz', alm.ganZhi.year + ' ' + alm.ganZhi.month + ' ' + alm.ganZhi.day);
      almanacBox.appendChild(line2);
      if (alm.taboos.length) {
        var tabooLine = el('div', 'pill-list');
        tabooLine.style.marginTop = '6px';
        alm.taboos.forEach(function (t) {
          var p = el('span', 'pill ' + (t.level === 'major' ? 'alm-taboo' : 'alm-minor'), t.name);
          p.title = t.note || '';
          tabooLine.appendChild(p);
        });
        almanacBox.appendChild(tabooLine);
      }
      var yiRow = el('div', 'alm-act');
      yiRow.appendChild(el('span', 'alm-tag yi', '宜'));
      alm.yi.forEach(function (x) { yiRow.appendChild(el('span', 'alm-item', x)); });
      almanacBox.appendChild(yiRow);
      var jiRow = el('div', 'alm-act');
      jiRow.appendChild(el('span', 'alm-tag ji', '忌'));
      alm.ji.forEach(function (x) { jiRow.appendChild(el('span', 'alm-item', x)); });
      almanacBox.appendChild(jiRow);
      almanacBox.appendChild(el('p', 'hint', '依据：建除十二神 / 黄黑道十二神 / 二十八宿 / 四离四绝 / 杨公忌日等通书规则推算，不同流派或有差异，仅供参考。'));
      body.appendChild(almanacBox);
    }

    // ---- 历史上的今天 ----
    var hist = historyOf(key);
    if (hist.length) {
      var hLabel = el('div', 'section-label', '历史上的今天（' + hist.length + '）');
      body.appendChild(hLabel);
      var hBox = el('div', 'history-box');
      hist.forEach(function (h) {
        var row = el('div', 'hist-item');
        row.appendChild(el('span', 'hist-year', String(h.y)));
        var txt = el('span', 'hist-text');
        if (h.k === 'birth') txt.appendChild(el('span', 'hist-kind birth', '诞辰'));
        else if (h.k === 'death') txt.appendChild(el('span', 'hist-kind death', '忌日'));
        txt.appendChild(document.createTextNode(h.t));
        if (h.e) row.title = '原文：' + h.e;       // 悬停查看英文原文
        row.appendChild(txt);
        if (h.c && h.c !== '诞辰' && h.c !== '忌日') {
          var tag = el('span', 'hist-cat ' + (HIST_CAT_CLASS[h.c] || 'h-other'), h.c);
          row.appendChild(tag);
        }
        hBox.appendChild(row);
      });
      body.appendChild(hBox);
      body.appendChild(el('p', 'hint', '共 ' + hist.length + ' 条。数据来自 Wikipedia 日期条目（经 history.muffinlabs.com 整理），已剔除娱乐与体育类人物；中文为机器翻译，鼠标悬停可看英文原文。'));
    } else if (state.settings.history && !HD) {
      // 历史数据还在后台加载
      body.appendChild(el('div', 'section-label', '历史上的今天'));
      body.appendChild(el('p', 'hint', '历史数据正在加载…（约 843 KB，首次打开需要几秒）'));
    }

    var evs = userEventsOn(key);
    body.appendChild(el('div', 'section-label', '我的日程（' + evs.length + '）'));
    if (!evs.length) {
      body.appendChild(el('p', 'hint', '这一天还没有记录。'));
    }
    evs.forEach(function (ev) {
      var row = el('div', 'mini-row-item');
      var dot = el('div', 'd');
      dot.appendChild(el('b', '', ev.category === 'birthday' ? '🎂' : ev.category === 'anniversary' ? '❤' : '•'));
      row.appendChild(dot);
      var t = el('div', 't');
      var years = ES.anniversaryYears(ev, key);
      t.appendChild(el('b', '', ev.title + (years ? '（' + years + '周年）' : '')));
      t.appendChild(el('small', '', ES.CATEGORY_LABEL[ev.category] + ' · ' + ES.repeatText(ev) + (ev.note ? ' · ' + ev.note : '')));
      row.appendChild(t);
      var actions = el('div', 'row-actions');
      var edit = el('button', 'btn ghost small', '编辑');
      edit.addEventListener('click', function () { closeModals(); openEditor(ev); });
      var del = el('button', 'btn danger ghost small', '删');
      del.addEventListener('click', function () {
        if (confirm('删除“' + ev.title + '”？')) {
          state.events = state.events.filter(function (x) { return x.id !== ev.id; });
          saveEvents(); render(); toast('已删除'); openDay(key);
        }
      });
      actions.appendChild(edit);
      actions.appendChild(del);
      row.appendChild(actions);
      body.appendChild(row);
    });

    var add = el('button', 'btn primary', '＋ 在这一天添加日程');
    add.style.marginTop = '16px';
    add.addEventListener('click', function () {
      closeModals();
      openEditor(null, key);
    });
    body.appendChild(add);
    render();
    showModal('dayModal');
  }

  /* ---------------- 编辑弹窗 ---------------- */
  var editingId = null;

  function openEditor(ev, presetKey) {
    editingId = ev ? ev.id : null;
    $('modalTitle').textContent = ev ? '编辑日程' : '新建日程';
    $('fId').value = ev ? ev.id : '';
    $('fTitle').value = ev ? ev.title : '';
    $('fCategory').value = ev ? ev.category : 'memo';
    $('fCalendar').value = ev ? ev.calendar : 'solar';
    $('fDate').value = ev ? ev.date : (presetKey || state.selected || ES.todayKey());
    $('fRepeat').value = ev ? ev.repeat : 'none';
    $('fTags').value = ev ? (ev.tags || []).join(', ') : '';
    $('fNote').value = ev ? ev.note : '';
    $('fColor').value = ev && ev.color && ev.color !== AUTO_COLOR ? ev.color : '#4c8bf5';
    $('fAutoColor').checked = !(ev && ev.color && ev.color !== AUTO_COLOR);
    $('fColor').disabled = $('fAutoColor').checked;
    $('fRemind').value = String(ev ? (ev.remindDays || 0) : 0);
    $('btnDelete').hidden = !ev;
    updatePreview();
    showModal('modal');
    setTimeout(function () { $('fTitle').focus(); }, 30);
  }

  function updatePreview() {
    var dateStr = $('fDate').value;
    var calendar = $('fCalendar').value;
    var repeat = $('fRepeat').value;
    var out = [];
    if (dateStr) {
      var p = dateStr.split('-');
      var l = L.fromSolar(+p[0], +p[1], +p[2]);
      if (l) out.push('公历 ' + dateStr + '，对应农历 ' + l.monthCn + l.dayCn + (l.term ? '，' + l.term : ''));
      if (calendar === 'lunar') {
        out.push('农历重复：每年农历 ' + (l ? l.monthCn : '') + (l ? l.dayCn : ''));
      }
    }
    if (repeat === 'yearly' || repeat === 'lunarYearly') {
      var d = ES.dateOf(dateStr);
      var next = ES.nextOccurrence(ES.create({ title: 'x', date: dateStr, repeat: repeat, calendar: calendar }), ES.todayKey());
      if (next) out.push('下次：' + next + '（' + ES.daysUntil(ES.create({ title: 'x', date: dateStr, repeat: repeat, calendar: calendar }), ES.todayKey()) + ' 天后）');
    }
    $('fPreview').textContent = out.join(' ｜ ');
  }

  function submitForm(e) {
    e.preventDefault();
    var title = $('fTitle').value.trim();
    if (!title) { toast('请填写标题'); return; }
    var tags = $('fTags').value.split(/[,，、\s]+/).filter(Boolean);
    var data = {
      title: title,
      category: $('fCategory').value,
      calendar: $('fCalendar').value,
      date: $('fDate').value,
      repeat: $('fRepeat').value,
      tags: tags,
      note: $('fNote').value.trim(),
      color: $('fAutoColor').checked ? AUTO_COLOR : $('fColor').value,
      remindDays: +$('fRemind').value || 0
    };
    if (editingId) {
      var ev = state.events.find(function (x) { return x.id === editingId; });
      if (ev) Object.assign(ev, data);
      toast('已保存修改');
    } else {
      state.events.push(ES.create(data));
      toast('已添加：' + title);
    }
    saveEvents();
    closeModals();
    render();
  }

  function deleteEditing() {
    if (!editingId) return;
    var ev = state.events.find(function (x) { return x.id === editingId; });
    if (!ev) return;
    if (!confirm('删除“' + ev.title + '”？')) return;
    state.events = state.events.filter(function (x) { return x.id !== editingId; });
    saveEvents();
    closeModals();
    render();
    toast('已删除');
  }

  /* ---------------- 弹窗控制 ---------------- */
  function showModal(id) {
    closeModals();
    $(id).hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModals() {
    ['modal', 'dataModal', 'dayModal'].forEach(function (id) { $(id).hidden = true; });
    document.body.style.overflow = '';
  }

  /* ---------------- 数据管理 ---------------- */
  function openData() {
    var all = DB.all();
    var cats = DB.categories();
    $('festivalStat').textContent = '内置 ' + all.length + ' 条节日 / 纪念日，覆盖 ' + cats.length + ' 个类别；'
      + '其中冷门国际日 ' + all.filter(isRare).length + ' 条。';
    renderFestivalSearch('');
    showModal('dataModal');
  }

  function renderFestivalSearch(q) {
    var host = $('festivalResult');
    host.innerHTML = '';
    q = (q || '').trim().toLowerCase();
    if (!q) { return; }
    var y = new Date().getFullYear();
    var hits = [];
    for (var m = 1; m <= 12; m++) {
      var days = L.solarMonthDays(y, m);
      for (var d = 1; d <= days; d++) {
        DB.forDate({ year: y, month: m, day: d }).forEach(function (f) {
          if (f.name.toLowerCase().indexOf(q) >= 0 || (f.note || '').toLowerCase().indexOf(q) >= 0) {
            hits.push({ m: m, d: d, f: f });
          }
        });
      }
    }
    if (!hits.length) {
      host.appendChild(el('p', 'hint', '没有找到匹配的节日（当前检索 ' + y + ' 年）。'));
      return;
    }
    hits.slice(0, 60).forEach(function (h) {
      var row = el('div', 'festival-item');
      row.appendChild(el('span', 'when', h.m + '月' + h.d + '日'));
      row.appendChild(el('span', 'nm', h.f.name));
      row.appendChild(el('span', 'tag', h.f.cat));
      host.appendChild(row);
    });
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function exportJson() {
    download('calendar-events-' + ES.todayKey() + '.json', ES.toJSON(state.events));
    toast('已导出 ' + state.events.length + ' 条');
  }

  function exportCsv() {
    var rows = [['标题', '类型', '日期', '历法', '重复', '标签', '备注', '提前提醒(天)']];
    state.events.slice().sort(ES.compare).forEach(function (e) {
      rows.push([
        e.title,
        ES.CATEGORY_LABEL[e.category] || e.category,
        e.date,
        e.calendar === 'lunar' ? '农历' : '公历',
        ES.REPEAT_LABEL[e.repeat] || e.repeat,
        (e.tags || []).join('|'),
        e.note || '',
        String(e.remindDays || 0)
      ]);
    });
    var csv = '\ufeff' + rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    download('calendar-events-' + ES.todayKey() + '.csv', csv, 'text/csv;charset=utf-8');
    toast('已导出 CSV');
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var list = ES.fromJSON(String(reader.result));
        var before = state.events.length;
        var ids = {};
        state.events.forEach(function (e) { ids[e.id] = true; });
        var added = 0;
        list.forEach(function (e) { if (!ids[e.id]) { state.events.push(e); added++; } });
        saveEvents();
        render();
        toast('导入完成：新增 ' + added + ' 条（原有 ' + before + ' 条）');
      } catch (err) {
        toast('导入失败：文件格式不正确');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function loadDemo() {
    var y = new Date().getFullYear();
    var demo = [
      ES.create({ title: '小林生日', category: 'birthday', date: (y - 24) + '-05-12', repeat: 'yearly', note: '喜欢机械键盘', tags: ['朋友'], color: '#e0567a' }),
      ES.create({ title: '妈妈生日', category: 'birthday', calendar: 'lunar', date: (y - 1) + '-09-18', repeat: 'lunarYearly', note: '农历生日，记得视频' }),
      ES.create({ title: '结婚纪念日', category: 'anniversary', date: (y - 5) + '-10-01', repeat: 'yearly' }),
      ES.create({ title: '交房租', category: 'memo', date: y + '-' + L.pad2(new Date().getMonth() + 1) + '-10', repeat: 'monthly' }),
      ES.create({ title: '每周复盘', category: 'todo', date: ES.todayKey(), repeat: 'weekly' }),
      ES.create({ title: '体检预约', category: 'todo', date: ES.keyOfDayNo(ES.dayNoOf(ES.todayKey()) + 21), repeat: 'none', note: '空腹，带上医保卡' })
    ];
    state.events = state.events.concat(demo);
    saveEvents();
    render();
    toast('已载入 ' + demo.length + ' 条示例');
  }

  /* ---------------- 搜索 ---------------- */
  function onSearch() {
    state.query = $('searchInput').value;
    render();
    if (state.query.trim() && state.view === 'month') {
      var hits = document.querySelectorAll('.day.match').length;
      $('statusHint').textContent = hits ? '高亮 ' + hits + ' 天包含“' + state.query.trim() + '”' : '没有匹配的日期';
    }
  }

  /* ---------------- 视图切换 ---------------- */
  function setView(v) {
    state.view = v;
    Array.prototype.forEach.call(document.querySelectorAll('.seg'), function (b) {
      b.setAttribute('aria-selected', String(b.dataset.view === v));
    });
    var monthMode = v === 'month';
    $('grid').hidden = !monthMode;
    $('weekdays').hidden = !monthMode;
    $('viewHost').hidden = monthMode;
    render();
  }

  function shiftMonth(delta) {
    var m = state.month + delta;
    var y = state.year;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    if (y < L.MIN_YEAR) { y = L.MIN_YEAR; m = 1; }
    if (y > L.MAX_YEAR) { y = L.MAX_YEAR; m = 12; }
    state.year = y; state.month = m;
    if (state.view === 'year' || state.view === 'list') setView('month');
    else render();
  }

  function goToday() {
    var now = new Date();
    state.year = now.getFullYear();
    state.month = now.getMonth() + 1;
    state.selected = ES.todayKey();
    if (state.view !== 'month') setView('month'); else render();
  }

  /* ---------------- Toast ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* ---------------- 渲染入口 ---------------- */
  function render() {
    updateHeader();
    if (state.view === 'month') renderMonth();
    else if (state.view === 'year') renderYear();
    else renderList();
    renderSidebar();
    renderMobilePanel();
    if (!state.query) {
      $('statusHint').textContent = '点击日期格子添加日程；← → 切换月份，T 回到今天，N 新建';
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    $('btnPrev').addEventListener('click', function () { shiftMonth(-1); });
    $('btnNext').addEventListener('click', function () { shiftMonth(1); });
    $('btnToday').addEventListener('click', goToday);
    $('btnAdd').addEventListener('click', function () { openEditor(null, state.selected); });
    $('btnData').addEventListener('click', openData);
    $('searchInput').addEventListener('input', onSearch);

    Array.prototype.forEach.call(document.querySelectorAll('.seg'), function (b) {
      b.addEventListener('click', function () { setView(b.dataset.view); });
    });

    $('eventForm').addEventListener('submit', submitForm);
    $('btnDelete').addEventListener('click', deleteEditing);
    $('fAutoColor').addEventListener('change', function () {
      $('fColor').disabled = $('fAutoColor').checked;
    });
    ['fDate', 'fCalendar', 'fRepeat'].forEach(function (id) {
      $(id).addEventListener('change', updatePreview);
      $(id).addEventListener('input', updatePreview);
    });

    // 弹窗关闭
    document.querySelectorAll('[data-close]').forEach(function (n) {
      n.addEventListener('click', closeModals);
    });

    // 设置
    var map = {
      setLunar: 'lunar', setAlmanac: 'almanac', setHistory: 'history', setFestivals: 'festivals', setRare: 'rare',
      setWeekNumbers: 'weekNumbers', setDense: 'dense'
    };
    Object.keys(map).forEach(function (id) {
      $(id).addEventListener('change', function () {
        state.settings[map[id]] = $(id).checked;
        saveSettings();
        render();
      });
    });
    $('setWeekStart').addEventListener('change', function () {
      state.settings.weekStart = $('setWeekStart').checked ? 1 : 0;
      saveSettings();
      render();
    });

    $('btnExport').addEventListener('click', exportJson);
    $('btnExportCsv').addEventListener('click', exportCsv);
    $('importFile').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = '';
    });
    $('btnDemo').addEventListener('click', loadDemo);
    $('btnClear').addEventListener('click', function () {
      if (!confirm('确定清空全部 ' + state.events.length + ' 条日程？此操作不可撤销。')) return;
      state.events = [];
      saveEvents();
      render();
      toast('已清空');
    });
    $('festivalQuery').addEventListener('input', function (e) { renderFestivalSearch(e.target.value); });

    // 键盘
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (e.key === 'Escape') { closeModals(); return; }
      if (typing) return;
      if (e.key === 'ArrowLeft') shiftMonth(-1);
      else if (e.key === 'ArrowRight') shiftMonth(1);
      else if (e.key === 't' || e.key === 'T') goToday();
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openEditor(null, state.selected); }
      else if (e.key === '/') { e.preventDefault(); $('searchInput').focus(); }
    });

    // 触摸滑动切换月份
    var startX = 0, startY = 0;
    $('grid').addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    }, { passive: true });
    $('grid').addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - startX;
      var dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftMonth(dx < 0 ? 1 : -1);
    }, { passive: true });

    // 跟随系统深色模式（仅在用户还没保存过设置时）
    if (window.matchMedia) {
      try {
        var mq = window.matchMedia('(prefers-color-scheme: dark)');
        if (mq.matches && !storageGet(LS_SETTINGS)) state.settings.theme = 'dark';
      } catch (e) { /* 忽略 */ }
    }
  }

  /** 数据只能存在内存里时，明确告诉用户（不阻塞使用） */
  var memoryNoteShown = false;
  function noteMemoryOnly() {
    if (memoryNoteShown) return;
    memoryNoteShown = true;
    render();
    toast('日历已就绪；但当前无法保存数据，详见底部说明');
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    // 1) 先把界面渲染出来——任何存储问题都不应该阻止日历显示
    try {
      loadAll();
    } catch (e) {
      state.events = [];
    }
    try {
      bind();
    } catch (e) {
      // 个别事件绑定失败也不能让整个页面卡住
      if (window.console && console.error) console.error('初始化事件绑定出错：', e);
    }

    var now = new Date();
    state.year = now.getFullYear();
    state.month = now.getMonth() + 1;
    state.selected = ES.todayKey();
    render();

    // 2) 存储不可用时给出可见提示（不阻塞使用）
    if (!storage.ok) noteMemoryOnly();

    // 3) 首次访问放一条引导用的示例日程
    try {
      if (!storageGet(LS_SEEDED) && state.events.length === 0) {
        storageSet(LS_SEEDED, '1');
        state.events.push(ES.create({
          title: '试着在这里记一件每年都要记得的事',
          category: 'memo',
          date: now.getFullYear() + '-' + L.pad2(now.getMonth() + 1) + '-' + L.pad2(now.getDate()),
          repeat: 'yearly',
          note: '点“编辑”可以看到重复规则：每年 / 每月 / 每周 / 农历每年'
        }));
        saveEvents();
        render();
        if (storage.ok) toast('欢迎使用！点“数据 → 载入示例数据”看更多玩法');
      }
    } catch (e) { /* 引导内容失败无所谓 */ }
  }

  function safeBoot() {
    try {
      boot();
    } catch (e) {
      // 兜底：即使初始化局部失败，也要让日历可交互，并把原因留给页面上的启动自检显示
      window.__calendarError = (e && (e.stack || e.message)) || String(e);
      if (window.console && console.error) console.error('启动出错：', e);
      try {
        render();
        toast('初始化遇到问题（' + (e.message || e) + '），日历仍可使用');
      } catch (e2) { /* 放弃 */ }
    }
  }

  /* ---------------- 历史数据异步加载 ----------------
   * history.js 有 843 KB，若同步加载会把首屏拖到十几秒（尤其在慢网络下）。
   * 这里改为首屏渲染完成后再异步拉取，拉到后自动刷新。
   * 单文件版（calendar.html）里数据已内联，window.HistoryDB 存在，直接返回不发请求。
   */
  function scriptBase() {
    var list = document.getElementsByTagName('script');
    for (var i = list.length - 1; i >= 0; i--) {
      var src = list[i].getAttribute('src') || '';
      if (/app\.js(\?|$)/.test(src)) return src.replace(/app\.js(\?.*)?$/, '');
    }
    return 'js/';
  }

  function loadHistoryAsync() {
    if (window.HistoryDB) { HD = window.HistoryDB; return; }
    if (window.__historyLoading) return;
    window.__historyLoading = true;

    var s = document.createElement('script');
    s.src = scriptBase() + 'history.js';
    s.async = true;
    s.onload = function () {
      window.__historyLoading = false;
      HD = window.HistoryDB || null;
      try {
        render();
        if (state.selected) openDay(state.selected);
      } catch (e) { /* 刷新失败不影响主界面 */ }
    };
    s.onerror = function () {
      window.__historyLoading = false;
      if (window.console && console.warn) console.warn('历史数据加载失败，其他功能不受影响');
    };
    (document.head || document.documentElement).appendChild(s);
  }

  function onReady() {
    safeBoot();
    loadHistoryAsync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();

  // 暴露给调试
  window.__calendar = { state: state, render: render, ES: ES, L: L, DB: DB, storage: storage };
})();
