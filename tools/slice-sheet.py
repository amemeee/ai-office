"""Slice a green-screen sprite sheet into transparent per-pose PNGs.
usage: python tools/slice-sheet.py <sheet> <name> [ref_height] [poses] [ref_index]"""
import sys, json, os
import numpy as np
from PIL import Image

src, name = sys.argv[1], sys.argv[2]
H = int(sys.argv[3]) if len(sys.argv) > 3 else 80
POSES = (sys.argv[4] if len(sys.argv) > 4 else 'stand,walk1,walk2,sit,alert').split(',')
REF = int(sys.argv[5]) if len(sys.argv) > 5 else 0
im = np.asarray(Image.open(src).convert('RGB')).astype(np.int32)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
greenness = g - np.maximum(r, b)              # ~255 on pure green, ~0 on greys
alpha = np.clip((100 - greenness) * 255 / 70, 0, 255)  # soft edge between 30..100
alpha[greenness < 30] = 255
alpha[greenness > 100] = 0
# despill: pull green back on edge pixels
spill = np.clip(g - np.maximum(r, b), 0, None)
g2 = g - np.where(alpha < 255, spill, 0)
rgba = np.dstack([r, np.minimum(g, g2 + 0), b, alpha]).astype(np.uint8)

cols = (alpha > 128).sum(axis=0) > 3
segs, start = [], None
for x, on in enumerate(cols):
    if on and start is None: start = x
    if not on and start is not None:
        if x - start > 40: segs.append([start, x])
        start = None
if start is not None: segs.append([start, len(cols)])
assert len(segs) == len(POSES), f'expected {len(POSES)} poses, found {len(segs)}: {segs}'

crops = []
for (x0, x1) in segs:
    sub = rgba[:, x0:x1]
    rows = np.where((sub[..., 3] > 128).sum(axis=1) > 2)[0]
    y0, y1 = rows[0], rows[-1] + 1
    crops.append((sub[y0:y1], x0, y0, y1))
scale = H / (crops[REF][3] - crops[REF][2])  # same scale for every pose (reference pose)
os.makedirs('public/assets/chars', exist_ok=True)
meta = {}
for pose, (c, x0, y0, y1) in zip(POSES, crops):
    img = Image.fromarray(c, 'RGBA')
    w, h = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    img = img.resize((w, h), Image.LANCZOS)
    img.save(f'public/assets/chars/{name}-{pose}.png')
    meta[pose] = {'w': w, 'h': h}
json.dump(meta, open(f'public/assets/chars/{name}.json', 'w'))
print(meta)
