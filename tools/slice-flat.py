"""Cut the flat turntable sheet (side, front, rear, side, top) into transparent PNGs.
usage: python tools/slice-flat.py <sheet> <outprefix> <side_width_px>"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

src, prefix, SIDE_W = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = np.asarray(Image.open(src).convert('RGB')).astype(np.int32)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
green = g - np.maximum(r, b)
alpha = np.clip((100 - green) * 255 / 70, 0, 255)
alpha[green < 30] = 255; alpha[green > 100] = 0
g2 = np.where(alpha < 255, g - np.clip(green, 0, None), g)
rgba = np.dstack([r, g2, b, alpha]).astype(np.uint8)

lab, n = ndimage.label(alpha > 128)
objs = ndimage.find_objects(lab)
parts = []
for i, sl in enumerate(objs, 1):
    h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
    area = int((lab[sl] == i).sum())
    if h < 12 or area < 3000:        # ground lines and specks
        continue
    parts.append(dict(sl=sl, id=i, x=sl[1].start, y=sl[0].start, w=w, h=h))
parts.sort(key=lambda p: (round(p['y'] / 150), p['x']))   # rows, then left to right
print([(p['x'], p['y'], p['w'], p['h']) for p in parts])
assert len(parts) == 5, len(parts)
names = ['side', 'front', 'rear', 'top', 'side2']
scale = SIDE_W / parts[0]['w']
os.makedirs(os.path.dirname(prefix), exist_ok=True)
for name, p in zip(names, parts):
    if name == 'side2': continue
    sl = p['sl']
    sub = rgba[sl].copy()
    sub[..., 3] = np.where(lab[sl] == p['id'], sub[..., 3], 0)   # only this part, not neighbours or ground lines
    if name != 'top':   # remove the thin ground line the generator drew under the wheels
        for yy in range(sub.shape[0] - 1, max(sub.shape[0] - 14, 0), -1):
            if (sub[yy, :, 3] > 128).mean() > 0.6: sub[yy, :, 3] = 0
        rows = np.where((sub[..., 3] > 128).sum(axis=1) > 0)[0]
        sub = sub[: rows[-1] + 1]
    img = Image.fromarray(sub, 'RGBA')
    img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    img.save(f'{prefix}-{name}.png')
    print(name, img.size)
