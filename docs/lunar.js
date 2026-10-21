/*!
 * lunar.js —— 农历 / 二十四节气 / 干支生肖 换算核心
 * 覆盖范围 1900-2100，无外部依赖，可在浏览器与 Node 中同时使用。
 *
 * 1) 农历压缩表 lunarInfo[y-1900]
 *      低 4 位    = 闰月月份（0 表示无闰月）
 *      0x10000 位 = 闰月天数（1 表示 30 天，否则 29 天）
 *      0x8000>>(m-1) = 农历 m 月天数（1 表示 30 天，否则 29 天）
 *    该表已用天文朔日（Meeus 朔望月公式）与"无中气为闰月"规则
 *    对 1900-2100 全部 2412 个月逐位校验，并修正 2060、2097 两处月长。
 *
 * 2) 二十四节气直接由太阳视黄经求解（Meeus 低精度公式，误差约 15 分钟），
 *    按北京时间（UTC+8）取日期，不再使用近似分种表。
 */
(function (root, factory) {
  var api = factory();
  root.Lunar = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LUNAR_INFO = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970-1979
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
    0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
    0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
    0x09ae0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
    0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
    0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
    0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0add4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
    0x0d520                                                                                    // 2100
  ];

  var TERM_NAMES = ['小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
    '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'];

  var GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var ANIMALS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

  var NUM_CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var DAY_CN = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
  var MONTH_CN = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];

  var MIN_YEAR = 1900;
  var MAX_YEAR = 2100;
  var DAY_MS = 86400000;
  var RAD = Math.PI / 180;
  var TERM_CACHE = Object.create(null);

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function norm360(x) { return ((x % 360) + 360) % 360; }
  function dayNo(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / DAY_MS); }
  function fromDayNo(n) {
    var dt = new Date(n * DAY_MS);
    return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
  }

  /**
   * ΔT = TT - UT（秒）。采用 NASA/Espenak-Meeus 分段多项式，
   * 1900-2100 内误差在数秒级；用于把力学时换算成世界时。
   */
  function deltaTSeconds(year) {
    var t, u;
    if (year < 1920) {
      t = year - 1900;
      return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t * t * t - 0.000197 * t * t * t * t;
    }
    if (year < 1941) {
      t = year - 1920;
      return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t * t * t;
    }
    if (year < 1961) {
      t = year - 1950;
      return 29.07 + 0.407 * t - t * t / 233 + t * t * t / 2547;
    }
    if (year < 1986) {
      t = year - 1975;
      return 45.45 + 1.067 * t - t * t / 260 - t * t * t / 718;
    }
    if (year < 2005) {
      t = year - 2000;
      return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t * t * t
        + 0.000651814 * t * t * t * t + 0.00002373599 * t * t * t * t * t;
    }
    if (year < 2050) {
      t = year - 2000;
      return 62.92 + 0.32217 * t + 0.005589 * t * t;
    }
    // 2050 年以后改用 Espenak-Meeus 的标准分段式（NASA 五阶式在 2050+ 会明显偏高）
    if (year < 2150) {
      u = (year - 1820) / 100;
      return -20 + 32 * u * u - 0.5628 * (2150 - year);
    }
    u = (year - 1820) / 100;
    return -20 + 32 * u * u;
  }

  /** 儒略日 -> 北京时间（UTC+8）的日期与时刻，含 ΔT 修正 */
  function jdToBeijing(jd) {
    var yearApprox = 1900 + (jd - 2415020.5) / 365.2425;
    var ms = (jd - 2440587.5) * DAY_MS - deltaTSeconds(yearApprox) * 1000 + 8 * 3600000;
    var dt = new Date(Math.round(ms));
    return {
      year: dt.getUTCFullYear(),
      month: dt.getUTCMonth() + 1,
      day: dt.getUTCDate(),
      hour: dt.getUTCHours(),
      minute: dt.getUTCMinutes(),
      time: dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate())
        + ' ' + pad2(dt.getUTCHours()) + ':' + pad2(dt.getUTCMinutes())
    };
  }

  /** 公历 y 年 m 月 d 日 0 时的儒略日（UT） */
  function jdOfDate(y, m, d) {
    return dayNo(y, m, d) - 0.5 + 2440587.5;
  }

  /**
   * 太阳视黄经（度，0-360）。Meeus《Astronomical Algorithms》低精度公式，
   * 精度约 0.01°（≈15 分钟），足以确定节气所在日期。
   * jd 为力学时（TT）儒略日。
   */
  function sunLongitude(jd) {
    var t = (jd - 2451545.0) / 36525;
    var l0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
    var m = 357.52911 + 35999.05029 * t - 0.0001537 * t * t;
    var c = (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(m * RAD)
      + (0.019993 - 0.000101 * t) * Math.sin(2 * m * RAD)
      + 0.000289 * Math.sin(3 * m * RAD);
    var omega = 125.04 - 1934.136 * t;
    var lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
    return norm360(lambda);
  }

  /**
   * 第 n 个节气（1 小寒 … 24 冬至）的时刻，按北京时间（UTC+8）给出日期与时刻。
   */
  function termDate(y, n) {
    var key = y * 32 + n;
    if (TERM_CACHE[key]) return TERM_CACHE[key];
    n = Math.min(24, Math.max(1, n));
    // 小寒（n=1）对应太阳黄经 285°，此后每过一个节气 +15°
    var target = norm360(285 + (n - 1) * 15);
    // 初值：按目标黄经估算年内第几天，再退回当年年初
    var yearStartJd = 2415020.5 + (y - MIN_YEAR) * 365.2422;
    var jd = yearStartJd + norm360(target - 280) / 0.9856473;
    for (var i = 0; i < 8; i++) {
      // 用 atan2 取最小角差，避免 ±180° / 0°-360° 翻转
      var lon = sunLongitude(jd) * RAD;
      var tgt = target * RAD;
      var diff = Math.atan2(Math.sin(lon - tgt), Math.cos(lon - tgt)) / RAD;
      jd -= diff / 0.9856473;
      if (Math.abs(diff) < 1e-7) break;
    }
    var bj = jdToBeijing(jd);
    var res = { year: bj.year, month: bj.month, day: bj.day, time: bj.time };
    TERM_CACHE[key] = res;
    return res;
  }

  /** 该农历年闰几月，0 表示无闰月 */
  function leapMonth(y) {
    if (y < MIN_YEAR || y > MAX_YEAR) return 0;
    return LUNAR_INFO[y - MIN_YEAR] & 0xf;
  }

  /** 该农历年闰月的天数，无闰月返回 0 */
  function leapDays(y) {
    if (!leapMonth(y)) return 0;
    return (LUNAR_INFO[y - MIN_YEAR] & 0x10000) ? 30 : 29;
  }

  /** 农历 y 年 m 月（非闰月）的天数 */
  function monthDays(y, m) {
    if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12) return -1;
    return (LUNAR_INFO[y - MIN_YEAR] & (0x10000 >> m)) ? 30 : 29;
  }

  /** 农历 y 年全年天数 */
  function yearDays(y) {
    if (y < MIN_YEAR || y > MAX_YEAR) return 0;
    var sum = 348;
    var info = LUNAR_INFO[y - MIN_YEAR];
    for (var i = 0x8000; i > 0x8; i >>= 1) sum += (info & i) ? 1 : 0;
    return sum + leapDays(y);
  }

  /** 取第 n 个节气（1 小寒 … 24 冬至）的日号 */
  function termDay(y, n) {
    if (n < 1 || n > 24) return NaN;
    return termDate(y, n).day;
  }

  function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  /** 公历 y 年 m 月天数 */
  function solarMonthDays(y, m) {
    return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  }

  /** 公历 y 年 m 月 d 日对应的节气名，无则返回 null */
  function termOf(y, m, d) {
    var n1 = (m - 1) * 2 + 1;
    var t1 = termDate(y, n1);
    if (t1.year === y && t1.month === m && t1.day === d) return TERM_NAMES[n1 - 1];
    if (n1 + 1 <= 24) {
      var t2 = termDate(y, n1 + 1);
      if (t2.year === y && t2.month === m && t2.day === d) return TERM_NAMES[n1];
    }
    return null;
  }

  /** 干支（以 1984 甲子年为基准） */
  function ganZhi(offset) {
    var g = ((offset % 10) + 10) % 10;
    var z = ((offset % 12) + 12) % 12;
    return GAN[g] + ZHI[z];
  }

  function yearToCn(y) {
    return String(y).split('').map(function (ch) { return NUM_CN[+ch]; }).join('') + '年';
  }

  /** 公历 -> 农历。返回 null 表示超出 1900-2100 支持范围 */
  function fromSolar(y, m, d) {
    if (y < MIN_YEAR || y > MAX_YEAR) return null;
    var dayNum = dayNo(y, m, d);
    // 农历表以 1900-01-31（农历庚子年正月初一）为基准日，之前的几天按己亥年腊月推算
    if (dayNum < dayNo(MIN_YEAR, 1, 31)) {
      if (y !== MIN_YEAR) return null;
      // 1900-01-01 是己亥年腊月初一，01-30 是腊月三十
      var lDayBefore = 1 + (dayNum - dayNo(MIN_YEAR, 1, 1));
      var termBefore = termOf(y, m, d);
      return {
        year: y, month: m, day: d,
        lYear: 1899, lMonth: 12, lDay: lDayBefore, isLeap: false,
        leapMonthOfYear: 0,
        yearCn: yearToCn(1899),
        monthCn: '腊月',
        dayCn: DAY_CN[lDayBefore - 1],
        gzYear: ganZhi(1899 - 1984),
        gzDay: ganZhi(dayNum - dayNo(1900, 1, 1) + 10),
        animal: ANIMALS[((1899 - 4) % 12 + 12) % 12],
        term: termBefore,
        isTerm: !!termBefore,
        approx: true
      };
    }
    var offset = dayNum - dayNo(MIN_YEAR, 1, 31);
    var i, temp = 0;
    for (i = MIN_YEAR; i < MAX_YEAR && offset > 0; i++) {
      temp = yearDays(i);
      offset -= temp;
    }
    if (offset < 0) { offset += temp; i--; }

    var lYear = i;
    var leap = leapMonth(lYear);
    var isLeap = false;
    var mIdx;
    for (mIdx = 1; mIdx < 13 && offset > 0; mIdx++) {
      if (leap > 0 && mIdx === leap + 1 && !isLeap) {
        --mIdx; isLeap = true;
        temp = leapDays(lYear);
      } else {
        temp = monthDays(lYear, mIdx);
      }
      if (isLeap && mIdx === leap + 1) isLeap = false;
      offset -= temp;
    }
    if (offset === 0 && leap > 0 && mIdx === leap + 1) {
      if (isLeap) { isLeap = false; } else { isLeap = true; --mIdx; }
    }
    if (offset < 0) { offset += temp; --mIdx; }

    var lDay = offset + 1;
    var term = termOf(y, m, d);
    return {
      year: y, month: m, day: d,
      lYear: lYear, lMonth: mIdx, lDay: lDay, isLeap: isLeap,
      leapMonthOfYear: leap,
      yearCn: yearToCn(lYear),
      monthCn: (isLeap ? '闰' : '') + MONTH_CN[mIdx - 1] + '月',
      dayCn: DAY_CN[lDay - 1],
      gzYear: ganZhi(lYear - 1984),
      gzDay: ganZhi(dayNo(y, m, d) - dayNo(1900, 1, 1) + 10),
      animal: ANIMALS[((lYear - 4) % 12 + 12) % 12],
      term: term,
      isTerm: !!term
    };
  }

  /** 农历 -> 公历。isLeap 指定是否取闰月 */
  function fromLunar(y, m, d, isLeap) {
    if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12) return null;
    var leap = leapMonth(y);
    var useLeap = !!isLeap && leap === m;
    var days = 0;
    var i;
    for (i = MIN_YEAR; i < y; i++) days += yearDays(i);
    for (i = 1; i < m; i++) {
      days += monthDays(y, i);
      if (leap === i) days += leapDays(y);
    }
    if (useLeap) days += monthDays(y, m);
    var maxDay = useLeap ? leapDays(y) : monthDays(y, m);
    if (d < 1 || d > maxDay) return null;
    days += d - 1;
    return fromDayNo(dayNo(1900, 1, 31) + days);
  }

  /** 农历日期中文：正月十五 / 闰四月初一 */
  function lunarLabel(l) {
    if (!l) return '';
    if (l.lDay === 1) return l.monthCn;
    return l.dayCn;
  }

  /** 生成公历月份网格需要的单元格日期（周日起始或周一起始） */
  function monthGrid(year, month, weekStart) {
    var first = new Date(year, month - 1, 1);
    var lead = (first.getDay() - (weekStart || 0) + 7) % 7;
    var cells = [];
    for (var i = 0; i < 42; i++) {
      cells.push(new Date(year, month - 1, 1 - lead + i));
    }
    // 最后一行若整行属于下个月则丢弃
    var last = cells[35];
    if (last.getMonth() !== month - 1) cells = cells.slice(0, 35);
    return cells;
  }

  return {
    MIN_YEAR: MIN_YEAR,
    MAX_YEAR: MAX_YEAR,
    LUNAR_INFO: LUNAR_INFO,
    TERM_NAMES: TERM_NAMES,
    GAN: GAN,
    ZHI: ZHI,
    ANIMALS: ANIMALS,
    DAY_CN: DAY_CN,
    MONTH_CN: MONTH_CN,
    pad2: pad2,
    dayNo: dayNo,
    fromDayNo: fromDayNo,
    leapMonth: leapMonth,
    leapDays: leapDays,
    monthDays: monthDays,
    yearDays: yearDays,
    termDay: termDay,
    termDate: termDate,
    termOf: termOf,
    deltaTSeconds: deltaTSeconds,
    jdToBeijing: jdToBeijing,
    jdOfDate: jdOfDate,
    sunLongitude: sunLongitude,
    solarMonthDays: solarMonthDays,
    fromSolar: fromSolar,
    fromLunar: fromLunar,
    ganZhi: ganZhi,
    lunarLabel: lunarLabel,
    monthGrid: monthGrid
  };
});
