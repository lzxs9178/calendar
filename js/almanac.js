/*!
 * almanac.js —— 传统黄历引擎（黄道吉日 + 每日宜忌）
 *
 * 说明：黄历不是天文计算，而是流传下来的术数规则。本文件按公开通书规则推算：
 *   · 六十甲子：年柱（以立春为界）、月柱（以节气为界）、日柱（连续干支）
 *   · 建除十二神（建、除、满、平、定、执、破、危、成、收、开、闭）
 *   · 黄黑道十二神（青龙、明堂、天刑、朱雀、金匮、天德、白虎、玉堂、天牢、玄武、司命、勾陈）
 *   · 二十八宿（以已知日期为锚点，连续轮转）
 *   · 特殊忌日：月破、岁破、四离、四绝、杨公忌、十恶大败、受死日等
 *   · 每日宜忌：由以上神煞 + 节日 + 节气综合给出
 * 不同通书流派在个别条目上会有差异，属正常现象。
 */
(function (root, factory) {
  var Lunar = root.Lunar || (typeof require === 'function' ? require('./lunar.js') : null);
  var api = factory(Lunar);
  root.Almanac = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Lunar) {
  'use strict';

  var GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

  /* 建除十二神 */
  var JIANCHU = ['建', '除', '满', '平', '定', '执', '破', '危', '成', '收', '开', '闭'];

  /* 黄黑道十二神：顺序固定，落在 6 个"黄道"上为吉 */
  var HUANGDAO_ORDER = ['青龙', '明堂', '天刑', '朱雀', '金匮', '天德', '白虎', '玉堂', '天牢', '玄武', '司命', '勾陈'];
  var YELLOW_GODS = { '青龙': 1, '明堂': 1, '金匮': 1, '天德': 1, '玉堂': 1, '司命': 1 };

  /* 各月组中"青龙"所在的日支（通书口诀） */
  var QINGLONG_BY_MONTH_ZHI = {
    '寅': '子', '申': '子',
    '卯': '寅', '酉': '寅',
    '辰': '辰', '戌': '辰',
    '巳': '午', '亥': '午',
    '子': '申', '午': '申',
    '丑': '戌', '未': '戌'
  };

  /* 二十八宿（东方苍龙七宿、北方玄武七宿、西方白虎七宿、南方朱雀七宿） */
  var XIU = [
    { name: '角', animal: '蛟', luck: '吉' }, { name: '亢', animal: '龙', luck: '凶' },
    { name: '氐', animal: '貉', luck: '凶' }, { name: '房', animal: '兔', luck: '吉' },
    { name: '心', animal: '狐', luck: '凶' }, { name: '尾', animal: '虎', luck: '吉' },
    { name: '箕', animal: '豹', luck: '吉' }, { name: '斗', animal: '獬', luck: '吉' },
    { name: '牛', animal: '牛', luck: '凶' }, { name: '女', animal: '蝠', luck: '凶' },
    { name: '虚', animal: '鼠', luck: '凶' }, { name: '危', animal: '燕', luck: '凶' },
    { name: '室', animal: '猪', luck: '吉' }, { name: '壁', animal: '貐', luck: '吉' },
    { name: '奎', animal: '狼', luck: '凶' }, { name: '娄', animal: '狗', luck: '吉' },
    { name: '胃', animal: '雉', luck: '吉' }, { name: '昴', animal: '鸡', luck: '凶' },
    { name: '毕', animal: '乌', luck: '吉' }, { name: '觜', animal: '猴', luck: '凶' },
    { name: '参', animal: '猿', luck: '吉' }, { name: '井', animal: '犴', luck: '吉' },
    { name: '鬼', animal: '羊', luck: '凶' }, { name: '柳', animal: '獐', luck: '凶' },
    { name: '星', animal: '马', luck: '凶' }, { name: '张', animal: '鹿', luck: '吉' },
    { name: '翼', animal: '蛇', luck: '凶' }, { name: '轸', animal: '蚓', luck: '吉' }
  ];

  /* 杨公忌日（农历） */
  var YANGGONG = [[1, 13], [2, 11], [3, 9], [4, 7], [5, 5], [6, 3], [7, 1], [7, 29], [8, 27], [9, 25], [10, 23], [11, 21], [12, 19]];

  var DAY_MS = 86400000;

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function mod(n, m) { return ((n % m) + m) % m; }

  /* ---------- 干支 ---------- */

  /**
   * 日干支：连续六十甲子。
   * Lunar.dayNo 以 1970-01-01 为 0，故这里锚定 2000-01-01（dayNo 10957）为戊午日（第 54 位）。
   */
  var GANZHI_EPOCH_DAYNO = 10957;   // 2000-01-01
  var GANZHI_EPOCH_INDEX = 54;      // 戊午
  function dayGanZhi(dayNo) {
    var idx = mod(dayNo - GANZHI_EPOCH_DAYNO + GANZHI_EPOCH_INDEX, 60);
    return { index: idx, gan: idx % 10, zhi: idx % 12, name: GAN[idx % 10] + ZHI[idx % 12] };
  }

  /** 年干支：以立春为界 */
  function yearGanZhi(y, month, day) {
    var lichun = Lunar.termDate(y, 3);            // 立春
    var beforeLichun = (month < lichun.month) || (month === lichun.month && day < lichun.day);
    var ganZhiYear = beforeLichun ? y - 1 : y;
    var offset = ganZhiYear - 1984;               // 1984 为甲子年
    return { year: ganZhiYear, gan: mod(offset, 10), zhi: mod(offset, 12), name: GAN[mod(offset, 10)] + ZHI[mod(offset, 12)] };
  }

  /**
   * 月柱：以十二节为界。交节后的第一个月为寅月，天干由年干推出（五虎遁）。
   *
   * 注意：十二节里"小寒"属于上一个公历年年末的子月到丑月的分界，
   * 如果按节气序号顺序遍历，它的日期最小却排在最后，会把年初/年末判错。
   * 所以这里按真实时间顺序列出边界（含跨年的小寒）。
   */
  var MONTH_ZHI_ORDER = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];

  function monthGanZhi(y, m, d) {
    var ygz = yearGanZhi(y, m, d);
    var dayNo = Lunar.dayNo(y, m, d);

    // 构建按时间排序的月界：[立春(寅) … 大雪(子)] + [小寒(丑)]
    var bounds = [];
    for (var i = 0; i < 11; i++) {                 // 立春 … 大雪 → 寅 … 子（索引 0…10）
      var t = Lunar.termDate(y, 3 + i * 2);        // 节气序号 3,5,…,23
      bounds.push({ zhiIdx: i, dayNo: Lunar.dayNo(t.year, t.month, t.day) });
    }
    var xh = Lunar.termDate(y, 1);                 // 小寒 → 丑（索引 11）
    bounds.push({ zhiIdx: 11, dayNo: Lunar.dayNo(xh.year, xh.month, xh.day) });
    bounds.sort(function (a, b) { return a.dayNo - b.dayNo; });

    // 取最后一个已经交节的月界；若连立春都还没到，则属上一年的丑月
    var chosen = -1;
    for (var k = 0; k < bounds.length; k++) {
      if (bounds[k].dayNo <= dayNo) chosen = k;
    }
    var monthZhiIdx;
    if (chosen < 0) {
      monthZhiIdx = 11;                            // 小寒之前 → 丑月
    } else {
      monthZhiIdx = bounds[chosen].zhiIdx;
      // 立春之前落在"小寒"界之后，此时仍是上一年丑月（本年的丑月要到次年小寒之后）
      if (monthZhiIdx === 11 && Lunar.termDate(y, 3).month > 2 && bounds[chosen].dayNo <= dayNo) {
        // 说明现在是本年 1 月上旬到立春之间，仍属上一年丑月
        monthZhiIdx = 11;
      }
    }

    // 五虎遁（年上起月）：甲己之年丙作首，乙庚之岁戊为头，丙辛岁首寻庚起，丁壬壬位顺行流，戊癸甲寅好追求
    var firstGanByYearGan = [2, 4, 6, 8, 0, 2, 4, 6, 8, 0];   // 甲丙戊庚壬 → 丙戊庚壬甲
    var firstGan = firstGanByYearGan[ygz.gan];
    var gan = mod(firstGan + monthZhiIdx, 10);
    return {
      index: monthZhiIdx, zhi: mod(2 + monthZhiIdx, 12),
      gan: gan, name: GAN[gan] + MONTH_ZHI_ORDER[monthZhiIdx],
      zhiName: MONTH_ZHI_ORDER[monthZhiIdx]
    };
  }

  /* ---------- 建除十二神 ---------- */
  function jianChu(monthZhi, dayZhi) {
    // 月建（月支）所在之日为"建"，其后按 建除满平定执破危成收开闭 顺序轮转
    var base = mod(2 + 0, 12);  // 寅对应 zhi 索引 2
    var delta = mod(dayZhi - monthZhi, 12);
    return { name: JIANCHU[delta], index: delta };
  }

  /* ---------- 黄黑道十二神 ---------- */
  function huangHeiDao(monthZhiName, dayZhi) {
    var qingLong = ZHI.indexOf(QINGLONG_BY_MONTH_ZHI[monthZhiName]);
    if (qingLong < 0) qingLong = 0;
    var step = mod(dayZhi - qingLong, 12);
    var god = HUANGDAO_ORDER[step];
    return { god: god, isYellow: !!YELLOW_GODS[god] };
  }

  /* ---------- 二十八宿 ---------- */
  // 锚点：2026-10-11 为"角"宿（据公开黄历），向前后连续轮转
  var XIU_ANCHOR_DAYNO = Lunar ? Lunar.dayNo(2026, 10, 11) : 0;
  function xiuOf(dayNo) {
    var idx = mod(dayNo - XIU_ANCHOR_DAYNO, 28);
    return { index: idx, name: XIU[idx].name, animal: XIU[idx].animal, luck: XIU[idx].luck, full: XIU[idx].name + XIU[idx].animal };
  }

  /* ---------- 特殊忌日 ---------- */
  function specialTaboos(y, m, d, lunar, monthZhiName, dayZhiName) {
    var out = [];
    var dayNo = Lunar.dayNo(y, m, d);

    // 月破：与月建相冲之日
    var monthZhiName2 = monthZhiName;
    var monthZhiIdx = ZHI.indexOf(monthZhiName2);
    if (mod(dayZhiName ? ZHI.indexOf(dayZhiName) : 0, 12) === mod(monthZhiIdx + 6, 12)) out.push({ name: '月破', level: 'major', note: '与月建相冲，诸事不宜' });

    // 岁破：与流年地支相冲
    var ygz = yearGanZhi(y, m, d);
    if (dayZhiName && mod(ZHI.indexOf(dayZhiName), 12) === mod(ygz.zhi + 6, 12)) out.push({ name: '岁破', level: 'major', note: '与太岁相冲' });

    // 四离日：春分、秋分、夏至、冬至 前一日
    var lichun = [6, 12, 18, 24];   // 春分 夏至 秋分 冬至（节气序号）
    var liNames = { 6: '木离', 12: '火离', 18: '金离', 24: '水离' };
    for (var i = 0; i < lichun.length; i++) {
      var t = Lunar.termDate(y, lichun[i]);
      if (Lunar.dayNo(t.year, t.month, t.day) - 1 === dayNo) out.push({ name: '四离日（' + liNames[lichun[i]] + '）', level: 'major', note: '节气前一日，忌出行、嫁娶' });
    }

    // 四绝日：立春、立夏、立秋、立冬 前一日
    var sijue = [3, 9, 15, 21];
    for (var j = 0; j < sijue.length; j++) {
      var t2 = Lunar.termDate(y, sijue[j]);
      if (Lunar.dayNo(t2.year, t2.month, t2.day) - 1 === dayNo) out.push({ name: '四绝日', level: 'major', note: '节气前一日，忌出行、嫁娶' });
    }

    // 杨公忌日（农历）
    if (lunar && !lunar.isLeap) {
      for (var k = 0; k < YANGGONG.length; k++) {
        if (YANGGONG[k][0] === lunar.lMonth && YANGGONG[k][1] === lunar.lDay) {
          out.push({ name: '杨公忌日', level: 'major', note: '民俗大忌之日' });
        }
      }
    }

    // 十恶大败日（按日干支的禄位落空亡）
    var BAD_DAYS = ['甲辰', '乙巳', '丙申', '丁亥', '戊戌', '己丑', '庚辰', '辛巳', '壬申', '癸亥'];
    var dgz = dayGanZhi(dayNo);
    if (BAD_DAYS.indexOf(dgz.name) >= 0) out.push({ name: '十恶大败日', level: 'minor', note: '忌开市、求财' });

    // 受死日（农历月）
    var SHOUSI = [1, 5, 9, 4, 8, 12, 3, 7, 11, 2, 6, 10];  // 正月起戌…
    var ZHI_SHOU = ['戌', '辰', '亥', '巳', '子', '午', '丑', '未', '寅', '申', '卯', '酉'];
    if (lunar && !lunar.isLeap && dayZhiName === ZHI_SHOU[(lunar.lMonth - 1) % 12]) {
      out.push({ name: '受死日', level: 'minor', note: '忌嫁娶、安葬' });
    }

    // 月的重日（重复月日，如 1 月 1、2 月 2）
    if (lunar && !lunar.isLeap && lunar.lMonth === lunar.lDay) out.push({ name: '重日', level: 'minor', note: '月日相同，宜祭祀、忌远行' });

    return out;
  }

  /* ---------- 每日宜忌 ---------- */
  var YI = {
    jian: ['出行', '赴任', '会友', '祈福', '祭祀', '求嗣', '上梁', '竖柱'],
    chu: ['祭祀', '祈福', '求医', '解除', '沐浴', '扫舍', '出行'],
    man: ['祈福', '祭祀', '结网', '开市', '纳财', '栽种'],
    ping: ['修饰垣墙', '平治道涂', '祭祀', '嫁娶', '交易'],
    ding: ['祭祀', '祈福', '嫁娶', '冠笄', '纳采', '安床', '立券'],
    zhi: ['捕捉', '嫁娶', '祭祀', '祈福', '立约', '修造'],
    po: ['求医', '破屋', '坏垣', '解除', '沐浴'],
    wei: ['安床', '祭祀', '祈福', '求医', '拆卸'],
    cheng: ['开市', '交易', '立券', '嫁娶', '出行', '入学', '赴任', '动土'],
    shou: ['纳财', '收账', '嫁娶', '祭祀', '进人口', '纳畜'],
    kai: ['祭祀', '祈福', '出行', '开市', '动土', '上梁', '入学', '求医'],
    bi: ['筑堤', '埋葬', '修坟', '塞穴', '补垣']
  };
  var JI = {
    jian: ['动土', '开仓', '安葬', '掘井'],
    chu: ['嫁娶', '开市', '签约', '远行'],
    man: ['嫁娶', '安葬', '赴任', '上任'],
    ping: ['开市', '求财', '安葬', '动土'],
    ding: ['诉讼', '出行', '移徙', '开仓'],
    zhi: ['开市', '出行', '搬家', '安葬'],
    po: ['嫁娶', '开市', '签约', '出行', '上任'],
    wei: ['登高', '出行', '开市', '嫁娶'],
    cheng: ['诉讼', '词讼', '安葬'],
    shou: ['开市', '出行', '安葬', '动土'],
    kai: ['安葬', '伐木', '破土', '行丧'],
    bi: ['开市', '出行', '嫁娶', '求医', '上任']
  };
  var JC_KEY = { '建': 'jian', '除': 'chu', '满': 'man', '平': 'ping', '定': 'ding', '执': 'zhi', '破': 'po', '危': 'wei', '成': 'cheng', '收': 'shou', '开': 'kai', '闭': 'bi' };

  /* 重大节日当天的传统宜忌（覆盖建除默认值） */
  var FESTIVAL_RULES = {
    '春节': { yi: ['祭祀', '祈福', '拜年', '会友', '开市'], ji: ['动土', '安葬', '诉讼', '借债'] },
    '元宵节': { yi: ['祭祀', '祈福', '会友', '出行'], ji: ['安葬', '诉讼', '动土'] },
    '清明节': { yi: ['祭祀', '扫墓', '修坟', '出行'], ji: ['嫁娶', '开市', '庆贺'] },
    '端午节': { yi: ['祭祀', '祈福', '悬艾', '沐浴'], ji: ['嫁娶', '开市', '动土'] },
    '七夕节': { yi: ['祈福', '会友', '纳采', '订盟'], ji: ['安葬', '诉讼'] },
    '中元节': { yi: ['祭祀', '普渡', '放生'], ji: ['嫁娶', '开市', '出行'] },
    '中秋节': { yi: ['祭祀', '会友', '赏月', '纳采'], ji: ['动土', '安葬', '诉讼'] },
    '重阳节': { yi: ['登高', '祭祀', '敬老', '会友'], ji: ['动土', '安葬'] },
    '除夕': { yi: ['祭祀', '扫舍', '守岁', '团圆'], ji: ['诉讼', '远行', '动土'] },
    '腊八节': { yi: ['祭祀', '祈福', '沐浴', '施舍'], ji: ['嫁娶', '开市'] },
    '小年（北方）': { yi: ['祭祀', '扫舍', '辞灶'], ji: ['动土', '安葬'] },
    '小年（南方）': { yi: ['祭祀', '扫舍', '辞灶'], ji: ['动土', '安葬'] },
    '冬至': { yi: ['祭祀', '进补', '团聚'], ji: ['出行', '嫁娶'] },
    '立春': { yi: ['祭祀', '祈福', '出行'], ji: ['动土', '安葬'] }
  };

  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  /**
   * 取某一天完整的黄历信息
   * date: Date 或 {year, month, day}
   */
  function of(date) {
    var y = date.getFullYear ? date.getFullYear() : date.year;
    var m = date.getMonth ? date.getMonth() + 1 : date.month;
    var d = date.getDate ? date.getDate() : date.day;
    var dayNo = Lunar.dayNo(y, m, d);

    var lunar = Lunar.fromSolar(y, m, d);
    var ygz = yearGanZhi(y, m, d);
    var mgz = monthGanZhi(y, m, d);
    var dgz = dayGanZhi(dayNo);
    var jc = jianChu(mgz.zhi, dgz.zhi);
    var hh = huangHeiDao(mgz.zhiName, dgz.zhi);
    var xiu = xiuOf(dayNo);
    var taboos = specialTaboos(y, m, d, lunar, mgz.zhiName, ZHI[dgz.zhi]);

    // 基础宜忌
    var key = JC_KEY[jc.name];
    var yi = (YI[key] || []).slice();
    var ji = (JI[key] || []).slice();

    // 凶日压制：月破、岁破、四离、四绝
    var major = taboos.filter(function (t) { return t.level === 'major'; });
    if (major.length) {
      yi = ['祭祀', '解除', '沐浴'];
      ji = uniq(ji.concat(['嫁娶', '开市', '出行', '动土', '安葬', '上任', '签约']));
    }
    if (hh.isYellow && !major.length) {
      yi = uniq(yi.concat(['祈福', '会友']));
    }

    // 宿的吉凶微调
    if (xiu.luck === '凶' && !major.length) ji = uniq(ji.concat(['动土']));
    else if (xiu.luck === '吉' && !major.length) yi = uniq(yi.concat(['祭祀']));

    return {
      year: y, month: m, day: d,
      lunar: lunar,
      ganZhi: {
        year: ygz.name + '年',
        month: mgz.name + '月',
        day: dgz.name + '日',
        dayIndex: dgz.index
      },
      jianChu: jc.name,
      god: hh.god,
      isYellow: hh.isYellow,
      huangDaoText: hh.isYellow ? '黄道吉日' : '黑道日',
      xiu: xiu,
      taboos: taboos,
      yi: yi,
      ji: ji,
      // 综合评分：黄道 +、建除吉凶 +、凶日大减
      score: (hh.isYellow ? 2 : 0) + (['成', '开', '定', '除', '危'].indexOf(jc.name) >= 0 ? 1 : 0)
        - (major.length ? 3 : 0) - (['破', '闭'].indexOf(jc.name) >= 0 ? 1 : 0)
    };
  }

  return {
    GAN: GAN,
    ZHI: ZHI,
    JIANCHU: JIANCHU,
    XIU: XIU,
    HUANGDAO_ORDER: HUANGDAO_ORDER,
    dayGanZhi: dayGanZhi,
    yearGanZhi: yearGanZhi,
    monthGanZhi: monthGanZhi,
    jianChu: jianChu,
    huangHeiDao: huangHeiDao,
    xiuOf: xiuOf,
    of: of,
    YI: YI,
    JI: JI,
    FESTIVAL_RULES: FESTIVAL_RULES
  };
});
