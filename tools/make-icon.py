"""生成程序图标 app.ico（多尺寸）—— 供编译 exe 时嵌入"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'exe', 'app.ico')
sizes = [16, 24, 32, 48, 64, 128, 256]
base = 256

img = Image.new('RGBA', (base, base), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 蓝紫渐变底
for y in range(base):
    t = y / (base - 1)
    c = (int(0x4C + (0x7A - 0x4C) * t),
         int(0x8B + (0x5C - 0x8B) * t),
         int(0xF5 + (0xF0 - 0xF5) * t), 255)
    d.line([(0, y), (base, y)], fill=c)

# 圆角
mask = Image.new('L', (base, base), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, base - 1, base - 1], radius=48, fill=255)
img.putalpha(mask)

d = ImageDraw.Draw(img)
# 白色日历页 + 挂环
d.rounded_rectangle([40, 62, base - 40, base - 40], radius=18, fill=(255, 255, 255, 255))
d.rounded_rectangle([86, 34, 106, 90], radius=10, fill=(255, 255, 255, 255))
d.rounded_rectangle([base - 106, 34, base - 86, 90], radius=10, fill=(255, 255, 255, 255))
# 顶部红色条
d.rounded_rectangle([40, 62, base - 40, 116], radius=18, fill=(0xD6, 0x45, 0x45, 255))
d.rectangle([40, 98, base - 40, 116], fill=(0xD6, 0x45, 0x45, 255))
# 日期数字
font = None
for f in ['C:/Windows/Fonts/msyhbd.ttc', 'C:/Windows/Fonts/msyh.ttc',
          'C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/segoeuib.ttf']:
    try:
        font = ImageFont.truetype(f, 104)
        break
    except Exception:
        continue
if font is None:
    font = ImageFont.load_default()
d.text((base / 2, 150), '11', font=font, fill=(0x1F, 0x2C, 0x4A, 255), anchor='mm')
# 底部小字 宜（日历页下缘 = base-40，绿字放在其上方留白处）
try:
    f2 = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 34)
except Exception:
    f2 = font
d.text((base / 2, 212), '宜', font=f2, fill=(0x2F, 0x9E, 0x6B, 255), anchor='mm')

os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT, format='ICO', sizes=[(s, s) for s in sizes])
print('图标已生成:', os.path.abspath(OUT), os.path.getsize(OUT), '字节')
