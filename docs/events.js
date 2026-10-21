/*!
 * events.js —— 用户日程（备忘录 / 生日 / 纪念日）引擎
 * 支持：仅此一次、每年重复、每月重复、每周重复、农历每年重复、农历每月重复
 * 日期以纯日期（YYYY-MM-DD）保存，避免时区带来的偏移。
 */
(function (root, factory) {
  var Lunar = root.Lunar || (typeof require === 'function' ? require('./lunar.js') : null);
  var api = factory(Lunar);
  root.EventStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Lunar) {
  'use strict';

  var DAY_MS = 86400000;

  var REPEAT_LABEL = {
    none: '仅此一次',
    yearly: '每年重复',
    monthly: '每月重复',
    weekly: '每周重复',
    lunarYearly: '农历每年',
    lunarMonthly: '农历每月'
  };

  var CATEGORY_LABEL = {
    memo: '备忘录',
    birthday: '生日',
    anniversary: '纪念日',
    todo: '待办',
    holiday: '自定义节日'
  };

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /** Date -> 'YYYY-MM-DD'（本地日历日） */
  function keyOf(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  /** 'YYYY-MM-DD' -> Date（本地 0 点） */
  function dateOf(key) {
    var p = String(key).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function dayNoOf(key) {
    var p = String(key).split('-');
    return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAY_MS);
  }

  function keyOfDayNo(n) {
    var d = new Date(n * DAY_MS);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  function todayKey() { return keyOf(new Date()); }

  function uid() {
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** 默认新建事件 */
  function create(partial) {
    var base = {
      id: uid(),
      title: '',
      category: 'memo',
      calendar: 'solar',        // solar | lunar
      date: todayKey(),         // 起始日期
      repeat: 'none',
      color: '',
      tags: [],
      note: '',
      remindDays: 0,
      pinned: false,
      done: false,
      createdAt: new Date().toISOString()
    };
    return Object.assign(base, partial || {});
  }

  /** 事件在某一天是否发生 */
  function occursOn(ev, key) {
    if (ev.calendar === 'lunar') return occursOnLunar(ev, key);
    var start = dayNoOf(ev.date);
    var cur = dayNoOf(key);
    if (cur < start && ev.repeat !== 'weekly' && ev.repeat !== 'monthly') return false;
    switch (ev.repeat) {
      case 'none': return cur === start;
      case 'weekly': return ((cur - start) % 7 + 7) % 7 === 0;
      case 'monthly': {
        if (cur < start) return false;
        var a = dateOf(ev.date), b = dateOf(key);
        return a.getDate() === b.getDate();
      }
      case 'yearly': {
        var s = String(ev.date).split('-');
        var c = String(key).split('-');
        // 2 月 29 日的生日在平年顺延到 3 月 1 日
        if (s[1] === '02' && s[2] === '29' && c[1] === '03' && c[2] === '01') {
          return !isLeapYear(+c[0]);
        }
        return s[1] === c[1] && s[2] === c[2];
      }
      default: return cur === start;
    }
  }

  function occursOnLunar(ev, key) {
    var p = String(key).split('-');
    var l = Lunar.fromSolar(+p[0], +p[1], +p[2]);
    if (!l) return false;
    var s = String(ev.date).split('-');
    var sl = Lunar.fromSolar(+s[0], +s[1], +s[2]);
    if (!sl) return false;
    if (ev.repeat === 'lunarMonthly' || ev.repeat === 'monthly') return sl.lDay === l.lDay;
    // 农历每年：优先同月同日；若该年此月无三十，则三十回落到廿九
    if (l.lMonth === sl.lMonth) {
      if (l.lDay === sl.lDay) return true;
      if (sl.lDay === 30 && l.lDay === Lunar.monthDays(l.lYear, l.lMonth)) return true;
    }
    return false;
  }

  function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  /** 该事件在 [fromKey, toKey] 区间内所有发生的日期 */
  function occurrencesInRange(ev, fromKey, toKey) {
    var out = [];
    var from = dayNoOf(fromKey), to = dayNoOf(toKey);
    var cur = dateOf(fromKey), end = dateOf(toKey);
    while (cur <= end) {
      var k = keyOf(cur);
      if (occursOn(ev, k)) out.push(k);
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  /** 下一次发生（含今天）。lookaheadDays 默认 5 年 */
  function nextOccurrence(ev, fromKey, lookaheadDays) {
    var start = dayNoOf(fromKey || todayKey());
    var limit = lookaheadDays || 366 * 5;
    for (var i = 0; i <= limit; i++) {
      var k = keyOfDayNo(start + i);
      if (occursOn(ev, k)) return k;
    }
    return null;
  }

  /** 距今天数（0 = 今天，正数为未来） */
  function daysUntil(ev, fromKey) {
    var next = nextOccurrence(ev, fromKey);
    if (!next) return null;
    return dayNoOf(next) - dayNoOf(fromKey || todayKey());
  }

  /**
   * 从生日/纪念日事件推算"第几周年"。
   * 返回 null 表示不适用（非每年重复或首次之前）。
   */
  function anniversaryYears(ev, key) {
    if (ev.repeat !== 'yearly' && ev.repeat !== 'lunarYearly') return null;
    var startYear = +String(ev.date).split('-')[0];
    var curYear = +String(key).split('-')[0];
    var n = curYear - startYear;
    return n > 0 ? n : null;
  }

  /** 排序：先按类别权重，再按标题 */
  var CAT_WEIGHT = { birthday: 0, anniversary: 1, holiday: 2, todo: 3, memo: 4 };
  function compare(a, b) {
    var wa = CAT_WEIGHT[a.category] === undefined ? 9 : CAT_WEIGHT[a.category];
    var wb = CAT_WEIGHT[b.category] === undefined ? 9 : CAT_WEIGHT[b.category];
    if (wa !== wb) return wa - wb;
    return String(a.title).localeCompare(String(b.title), 'zh-Hans-CN');
  }

  /** 序列化 / 反序列化 */
  function toJSON(events) {
    return JSON.stringify({ app: 'dsh-calendar', version: 1, exportedAt: new Date().toISOString(), events: events }, null, 2);
  }

  function fromJSON(text) {
    var data = JSON.parse(text);
    var list = Array.isArray(data) ? data : (data.events || []);
    return list.map(function (e) {
      var ev = create({});
      Object.assign(ev, e);
      if (!ev.id) ev.id = uid();
      if (!ev.date) ev.date = todayKey();
      if (!ev.repeat) ev.repeat = 'none';
      if (!ev.calendar) ev.calendar = 'solar';
      return ev;
    });
  }

  /** 生成人类可读的重复说明 */
  function repeatText(ev) {
    var base = REPEAT_LABEL[ev.repeat] || REPEAT_LABEL.none;
    return (ev.calendar === 'lunar' ? '农历·' : '') + base;
  }

  return {
    REPEAT_LABEL: REPEAT_LABEL,
    CATEGORY_LABEL: CATEGORY_LABEL,
    keyOf: keyOf,
    dateOf: dateOf,
    dayNoOf: dayNoOf,
    keyOfDayNo: keyOfDayNo,
    todayKey: todayKey,
    uid: uid,
    create: create,
    occursOn: occursOn,
    occurrencesInRange: occurrencesInRange,
    nextOccurrence: nextOccurrence,
    daysUntil: daysUntil,
    anniversaryYears: anniversaryYears,
    compare: compare,
    toJSON: toJSON,
    fromJSON: fromJSON,
    repeatText: repeatText
  };
});
