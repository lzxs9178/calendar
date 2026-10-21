"""生成 README 用的界面预览图 docs/preview.png（1280x760）
按程序实际界面的布局与配色绘制：顶栏 + 月历网格 + 右侧栏
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 760
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'preview.png')

# 配色（与 css/style.css 一致）
BG = (244, 246, 251)
PANEL = (255, 255, 255)
LINE = (227, 232, 240)
TEXT = (28, 36, 48)
TEXT2 = (91, 104, 121)
TEXT3 = (147, 160, 177)
PRIMARY = (59, 110, 245)
PRIMARY_SOFT = (234, 240, 255)
RED = (214, 69, 69)
FEST = (176, 89, 31)
FEST_BG = (253, 244, 236)
TERM = (31, 143, 106)
TERM_BG = (236, 248, 243)
GREEN = (47, 158, 107)


def font(size, bold=False):
    names = []
    if bold:
        names = ['C:/Windows/Fonts/msyhbd.ttc', 'C:/Windows/Fonts/msyh.ttc',
                 'C:/Windows/Fonts/simhei.ttf', 'C:/Windows/Fonts/arialbd.ttf']
    else:
        names = ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simsun.ttc',
                 'C:/Windows/Fonts/arial.ttf']
    for n in names:
        try:
            return ImageFont.truetype(n, size)
        except Exception:
            continue
    return ImageFont.load_default()


img = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(img)

# 背景轻微渐变
for y in range(H):
    t = y / H
    c = (int(244 + (238 - 244) * t), int(246 + (241 - 246) * t), int(251 + (250 - 251) * t))
    d.line([(0, y), (W, y)], fill=c)

card = (16, 14, W - 16, H - 14)
# 卡片阴影
shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle(
    [card[0] + 2, card[1] + 6, card[2] + 2, card[3] + 8], radius=18, fill=(20, 32, 56, 26))
img = Image.alpha_composite(img.convert('RGBA'), shadow).convert('RGB')
d = ImageDraw.Draw(img)
d.rounded_rectangle(card, radius=16, fill=PANEL, outline=LINE, width=1)

# ---------- 顶栏 ----------
BAR = (card[0], card[1], card[2], card[1] + 64)
d.line([(BAR[0], BAR[3]), (BAR[2], BAR[3])], fill=LINE)
# 图标
d.rounded_rectangle([40, 34, 74, 68], radius=10, fill=PRIMARY)
f_icon = font(20, True)
d.text((57, 51), '历', font=f_icon, fill=(255, 255, 255), anchor='mm')
d.text((86, 44), '万年历', font=font(19, True), fill=TEXT, anchor='lm')
d.text((86, 64), '节日 · 农历 · 黄历 · 历史', font=font(11), fill=TEXT3, anchor='lm')

# 翻月按钮
d.rounded_rectangle([300, 36, 332, 64], radius=9, fill=(255, 255, 255), outline=(207, 215, 230))
d.text((316, 50), '‹', font=font(17), fill=TEXT2, anchor='mm')
d.rounded_rectangle([338, 36, 392, 64], radius=9, fill=(255, 255, 255), outline=(207, 215, 230))
d.text((365, 50), '今天', font=font(12), fill=TEXT2, anchor='mm')
d.rounded_rectangle([398, 36, 430, 64], radius=9, fill=(255, 255, 255), outline=(207, 215, 230))
d.text((414, 50), '›', font=font(17), fill=TEXT2, anchor='mm')

d.text((452, 41), '2026 年 10 月', font=font(19, True), fill=TEXT, anchor='lm')
d.text((452, 62), '丙午年 · 马年 · 农历九月初二', font=font(11), fill=TEXT3, anchor='lm')

# 视图切换
d.rounded_rectangle([880, 38, 972, 62], radius=9, fill=(250, 251, 254), outline=LINE)
d.rounded_rectangle([882, 40, 912, 60], radius=7, fill=PANEL)
d.text((897, 50), '月', font=font(12, True), fill=TEXT, anchor='mm')
d.text((932, 50), '年', font=font(12), fill=TEXT2, anchor='mm')
d.text((960, 50), '列表', font=font(11), fill=TEXT2, anchor='mm')
# 搜索 + 新建
d.rounded_rectangle([986, 38, 1120, 62], radius=9, fill=(250, 251, 254), outline=(207, 215, 230))
d.text((998, 50), '搜索日程 / 节日…', font=font(11), fill=TEXT3, anchor='lm')
d.rounded_rectangle([1132, 36, 1210, 64], radius=9, fill=PRIMARY)
d.text((1171, 50), '＋ 新建', font=font(12, True), fill=(255, 255, 255), anchor='mm')

# ---------- 主体分栏 ----------
MAIN_X0, MAIN_X1 = 34, 906
SIDE_X0 = 922
GRID_TOP = 92

# 星期表头
WD = ['日', '一', '二', '三', '四', '五', '六']
colw = (MAIN_X1 - MAIN_X0) / 7
for i, w in enumerate(WD):
    cx = MAIN_X0 + colw * i + colw / 2
    col = RED if i in (0, 6) else TEXT2
    d.text((cx, GRID_TOP), '周' + w, font=font(11, True), fill=col, anchor='mm')

# 日历数据：10/1~10/31，含若干节日与农历
CELL_TOP = GRID_TOP + 20
CELL_H = 104
DAYS = [
    # (日, 农历/节气, [(文字, 颜色, 底色)])
    (1, '初二', [('国庆节', RED, (253, 237, 237)), ('国际咖啡日', FEST, FEST_BG)]),
    (2, '初三', [('国际非暴力日', FEST, FEST_BG)]),
    (3, '初四', []),
    (4, '初五', [('世界动物日', FEST, FEST_BG)]),
    (5, '初六', [('世界教师日', FEST, FEST_BG)]),
    (6, '初七', [('世界脑瘫日', FEST, FEST_BG)]),
    (7, '初八', [('世界棉花日', FEST, FEST_BG)]),
    (8, '寒露', [('寒露', TERM, TERM_BG)]),
    (9, '初十', [('世界邮政日', FEST, FEST_BG)]),
    (10, '十一', [('世界精神卫生日', FEST, FEST_BG)]),
    (11, '十二', [('历史上的今天', PRIMARY, PRIMARY_SOFT)]),
    (12, '十三', [('国际女童日', FEST, FEST_BG)]),
    (13, '十四', [('国际减灾日', FEST, FEST_BG)]),
    (14, '十五', [('世界标准日', FEST, FEST_BG)]),
    (15, '十六', [('国际盲人节', FEST, FEST_BG)]),
    (16, '十七', [('世界粮食日', RED, (253, 237, 237))]),
    (17, '十八', [('国际消除贫困日', FEST, FEST_BG)]),
    (18, '十九', [('世界更年期关怀日', FEST, FEST_BG)]),
    (19, '二十', [('世界儿歌日', FEST, FEST_BG)]),
    (20, '廿一', [('世界骨质疏松日', FEST, FEST_BG)]),
    (21, '廿二', [('世界味觉日', FEST, FEST_BG)]),
    (22, '廿三', [('世界传统医药日', FEST, FEST_BG)]),
    (23, '霜降', [('霜降', TERM, TERM_BG)]),
    (24, '廿五', [('联合国日', FEST, FEST_BG), ('程序员节', FEST, FEST_BG)]),
    (25, '廿六', [('世界面食日', FEST, FEST_BG)]),
    (26, '廿七', [('世界音像遗产日', FEST, FEST_BG)]),
    (27, '廿八', [('世界城市日', FEST, FEST_BG)]),
    (28, '廿九', [('世界男性健康日', FEST, FEST_BG)]),
    (29, '三十', [('世界卒中日', FEST, FEST_BG)]),
    (30, '九月', [('万圣节前夜', FEST, FEST_BG)]),
    (31, '初二', [('世界勤俭日', FEST, FEST_BG)]),
]
# 2026-10-01 是周四 → 前面空 4 格
LEAD = 4
GAP = 6
cw = (MAIN_X1 - MAIN_X0 - GAP * 6) / 7
f_num = font(16, True)
f_lun = font(10)
f_chip = font(10)
YELLOW_DAYS = {2, 5, 9, 13, 17, 21, 25, 29}   # 黄道吉日（示意）

for idx, (day, lun, chips) in enumerate(DAYS):
    slot = LEAD + idx
    row, col = divmod(slot, 7)
    x0 = MAIN_X0 + col * (cw + GAP)
    y0 = CELL_TOP + row * (CELL_H + GAP)
    x1, y1 = x0 + cw, y0 + CELL_H
    is_weekend = col in (0, 6)
    is_today = day == 11
    fill = (250, 251, 254) if is_today else PANEL
    d.rounded_rectangle([x0, y0, x1, y1], radius=9, fill=fill,
                        outline=PRIMARY if is_today else LINE)
    # 日期数字
    if is_today:
        d.rounded_rectangle([x0 + 7, y0 + 6, x0 + 33, y0 + 29], radius=7, fill=PRIMARY)
        d.text((x0 + 20, y0 + 17), str(day), font=f_num, fill=(255, 255, 255), anchor='mm')
    else:
        d.text((x0 + 9, y0 + 17), str(day), font=f_num,
               fill=RED if is_weekend else TEXT, anchor='lm')
    # 右上：黄道吉日标记 + 农历（与程序 day-top-right 布局一致，靠右依次排列）
    lun_col = TERM if lun in ('寒露', '霜降') else TEXT3
    lun_w = d.textlength(lun, font=f_lun)
    d.text((x1 - 9, y0 + 17), lun, font=f_lun, fill=lun_col, anchor='rm')
    if day in YELLOW_DAYS:
        bx1 = x1 - 9 - lun_w - 5
        d.rounded_rectangle([bx1 - 17, y0 + 8, bx1, y0 + 22], radius=4,
                            fill=(255, 243, 214), outline=(240, 214, 154))
        d.text(((bx1 - 17 + bx1) / 2, y0 + 15), '吉', font=font(9, True), fill=(163, 105, 10), anchor='mm')
    # 节日 chip
    for ci, (txt, fg, bgc) in enumerate(chips[:2]):
        cy = y0 + 34 + ci * 18
        label = txt if len(txt) <= 7 else txt[:6] + '…'
        tw = d.textlength(label, font=f_chip)
        d.rounded_rectangle([x0 + 6, cy, x0 + 12 + tw + 4, cy + 15], radius=4, fill=bgc)
        d.rectangle([x0 + 6, cy, x0 + 8, cy + 15], fill=fg)
        d.text((x0 + 12, cy + 7), label, font=f_chip, fill=fg, anchor='lm')
    if len(chips) > 2:
        d.text((x0 + 8, y0 + 70), '还有 %d 项…' % (len(chips) - 2), font=f_lun, fill=TEXT3, anchor='lm')

# ---------- 右侧栏 ----------
SX0, SX1 = SIDE_X0, W - 34
# 今日卡片
d.rounded_rectangle([SX0, GRID_TOP, SX1, GRID_TOP + 150], radius=12, fill=(62, 112, 246))
d.text((SX0 + 16, GRID_TOP + 18), '11 日', font=font(22, True), fill=(255, 255, 255), anchor='lm')
d.text((SX0 + 16, GRID_TOP + 46), '2026 年 10 月 · 星期日', font=font(11), fill=(226, 234, 255), anchor='lm')
for i, txt in enumerate(['农历九月初二', '丙午年', '马年', '黑道日', '成日']):
    tw = d.textlength(txt, font=font(10))
    bx = SX0 + 16 + (0 if i == 0 else 0)
    # 依次排布
    pass
pills = ['农历九月初二', '丙午年', '马年', '黑道日·成日']
px = SX0 + 16
for i, txt in enumerate(pills):
    tw = d.textlength(txt, font=font(10))
    if px + tw + 16 > SX1 - 12:
        break
    d.rounded_rectangle([px, GRID_TOP + 62, px + tw + 14, GRID_TOP + 82], radius=999,
                        fill=(255, 255, 255, 0) if False else (86, 130, 250))
    d.text((px + 7, GRID_TOP + 72), txt, font=font(10), fill=(255, 255, 255), anchor='lm')
    px += tw + 22
# 宜忌
d.text((SX0 + 16, GRID_TOP + 96), '宜', font=font(11, True), fill=(75, 211, 154), anchor='lm')
d.text((SX0 + 34, GRID_TOP + 96), '开市 · 交易 · 嫁娶 · 出行 · 入学', font=font(10), fill=(240, 245, 255), anchor='lm')
d.text((SX0 + 16, GRID_TOP + 118), '忌', font=font(11, True), fill=(255, 176, 176), anchor='lm')
d.text((SX0 + 34, GRID_TOP + 118), '诉讼 · 词讼 · 安葬', font=font(10), fill=(240, 245, 255), anchor='lm')

# 历史上的今天卡片
HY = GRID_TOP + 166
d.rounded_rectangle([SX0, HY, SX1, HY + 300], radius=12, fill=PANEL, outline=LINE)
d.text((SX0 + 14, HY + 18), '历史上的今天（12）', font=font(12, True), fill=TEXT, anchor='lm')
d.line([(SX0 + 14, HY + 32), (SX1 - 14, HY + 32)], fill=LINE)
hist = [
    ('1138', '阿勒颇发生强烈地震，是有史以来破坏性最强的地震之一。'),
    ('1899', '第二次布尔战争在南非爆发。'),
    ('1949', '中华人民共和国成立。'),
    ('1962', '梵蒂冈第二届大公会议开幕。'),
    ('1968', '阿波罗 7 号发射，美国首次载人阿波罗任务。'),
    ('2002', '美国国会通过授权对伊拉克使用武力的决议。'),
]
ty = HY + 46
for i, (yr, txt) in enumerate(hist):
    d.text((SX0 + 14, ty), yr, font=font(10, True), fill=PRIMARY, anchor='lm')
    line = txt if len(txt) <= 21 else txt[:20] + '…'
    d.text((SX0 + 56, ty), line, font=font(10), fill=TEXT2, anchor='lm')
    ty += 32

# 即将到来
AY = HY + 314
d.rounded_rectangle([SX0, AY, SX1, H - 34], radius=12, fill=PANEL, outline=LINE)
d.text((SX0 + 14, AY + 18), '即将到来', font=font(12, True), fill=TEXT, anchor='lm')
up = [('5月12日', '小林生日', '还有 213 天'), ('9月8日', '奶奶生日·农历', '还有 332 天'),
      ('10月1日', '结婚纪念日', '还有 355 天')]
uy = AY + 44
for a, b, c in up:
    d.text((SX0 + 14, uy), a, font=font(10), fill=TEXT2, anchor='lm')
    d.text((SX0 + 74, uy), b, font=font(10), fill=TEXT, anchor='lm')
    d.text((SX1 - 14, uy), c, font=font(9), fill=TEXT3, anchor='rm')
    uy += 26

# 底部状态栏
d.line([(card[0], H - 52), (card[2], H - 52)], fill=LINE)
d.text((card[0] + 20, H - 34), '共 6 条日程', font=font(10), fill=TEXT2, anchor='lm')
d.text((card[0] + 110, H - 34), '·', font=font(10), fill=TEXT3, anchor='lm')
d.text((card[0] + 122, H - 34), '点击日期格子添加日程；← → 切换月份，T 回到今天，N 新建',
       font=font(10), fill=TEXT2, anchor='lm')
d.text((card[2] - 20, H - 34), '农历与节气支持 1900–2100 年', font=font(10), fill=TEXT3, anchor='rm')

os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT)
print('preview saved:', os.path.abspath(OUT), os.path.getsize(OUT), 'bytes')
