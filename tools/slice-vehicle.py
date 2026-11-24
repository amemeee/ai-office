"""Cut a green-screen sheet of vehicle views into transparent PNGs.
usage: python tools/slice-vehicle.py <sheet> <outprefix> <view1,view2,...> [width_px]"""
import sys, os
import numpy as np
from PIL import Image

src, prefix, views = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
W = int(sys.argv[4]) if len(sys.argv) > 4 else 420
im = np.asarray(Image.open(src).convert('RGB')).astype(np.int32)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
green = g - np.maximum(r, b)
alpha = np.clip((100 - green) * 255 / 70, 0, 255)
alpha[green < 30] = 255; alpha[green > 100] = 0
spill = np.clip(g - np.maximum(r, b), 0, None)
g2 = np.where(alpha < 255, g - spill, g)
rgba = np.dstack([r, g2, b, alpha]).astype(np.uint8)
cols = (alpha > 128).sum(axis=0) > 3
segs, start = [], None
for x, on in enumerate(cols):
    if on and start is None: start = x
    if not on and start is not None:
        if x - start > 40: segs.append((start, x))
        start = None
if start is not None: segs.append((start, len(cols)))
assert len(segs) == len(views), f'found {len(segs)} views: {segs}'
os.makedirs(os.path.dirname(prefix), exist_ok=True)
sizes = []
for name, (x0, x1) in zip(views, segs):
    sub = rgba[:, x0:x1]
    rows = np.where((sub[..., 3] > 128).sum(axis=1) > 2)[0]
    crop = Image.fromarray(sub[rows[0]:rows[-1] + 1], 'RGBA')
    h = round(crop.height * W / crop.width)
    crop.resize((W, h), Image.LANCZOS).save(f'{prefix}-{name}.png')
    sizes.append((name, W, h))
print(sizes)
