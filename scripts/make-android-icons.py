#!/usr/bin/env python3
"""Regenerates every Android launcher / notification / splash image from the PWA icons in ./icons.
Run:  npm run icons   (needs Pillow: pip install pillow)"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
BG = (15, 23, 42, 255)  # #0f172a — same as the PWA theme/background colour

any_icon = Image.open(os.path.join(ROOT, 'icons', 'icon-512.png')).convert('RGBA')
maskable = Image.open(os.path.join(ROOT, 'icons', 'icon-maskable-512.png')).convert('RGBA')

DENS = {'mdpi': 1.0, 'hdpi': 1.5, 'xhdpi': 2.0, 'xxhdpi': 3.0, 'xxxhdpi': 4.0}

def save(img, folder, name):
    d = os.path.join(RES, folder); os.makedirs(d, exist_ok=True)
    img.save(os.path.join(d, name))

def resize(img, px):
    return img.resize((px, px), Image.LANCZOS)

def circle(img):
    mask = Image.new('L', img.size, 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse((0, 0, img.size[0] - 1, img.size[1] - 1), fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0)); out.paste(img, (0, 0), mask); return out

# flat dark square with the glyph (used for round icons + as source for circle crop)
flat = Image.new('RGBA', maskable.size, BG); flat.alpha_composite(maskable)

# notification small icon: Android wants a single-colour (white) silhouette on transparent.
# Heart (green) pixels become white; the white ECG line is cut out of it so it stays visible.
src = any_icon.copy(); px = src.load()
sil = Image.new('RGBA', src.size, (0, 0, 0, 0)); sp = sil.load()
for y in range(src.size[1]):
    for x in range(src.size[0]):
        r, g, b, a = px[x, y]
        if a > 40 and g > 140 and r < 120 and b < 190 and g - r > 60:   # the green heart
            sp[x, y] = (255, 255, 255, 255)
bbox = sil.getbbox()
sil = sil.crop(bbox)
side = max(sil.size)
sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.paste(sil, ((side - sil.size[0]) // 2, (side - sil.size[1]) // 2))

for dname, s in DENS.items():
    save(resize(any_icon, round(48 * s)), 'mipmap-' + dname, 'ic_launcher.png')
    save(resize(circle(flat), round(48 * s)), 'mipmap-' + dname, 'ic_launcher_round.png')
    save(resize(maskable, round(108 * s)), 'mipmap-' + dname, 'ic_launcher_foreground.png')
    # leave ~8% padding so the heart isn't clipped in the notification shade
    px_size = round(24 * s)
    inner = resize(sq, round(px_size * 0.88))
    canvas = Image.new('RGBA', (px_size, px_size), (0, 0, 0, 0))
    canvas.paste(inner, ((px_size - inner.size[0]) // 2, (px_size - inner.size[1]) // 2))
    save(canvas, 'drawable-' + dname, 'ic_stat_arogya.png')

# adaptive-icon background colour
os.makedirs(os.path.join(RES, 'values'), exist_ok=True)
with open(os.path.join(RES, 'values', 'ic_launcher_background.xml'), 'w') as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0F172A</color>\n</resources>\n')

# splash screens (pre-Android-12 fallback) — dark background, logo centred
for root, _, files in os.walk(RES):
    for fn in files:
        if fn == 'splash.png':
            p = os.path.join(root, fn)
            w, h = Image.open(p).size
            img = Image.new('RGBA', (w, h), BG)
            logo = resize(any_icon, int(min(w, h) * 0.28))
            img.alpha_composite(logo, ((w - logo.size[0]) // 2, (h - logo.size[1]) // 2))
            img.convert('RGB').save(p)
print('Android icons, notification icon and splash images regenerated.')
