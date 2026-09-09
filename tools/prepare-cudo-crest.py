#!/usr/bin/env python3
from collections import deque
from pathlib import Path
from PIL import Image

SRC = Path('preview-v8/media/clubes/union-orilla.png')
DST = Path('preview-v8/media/clubes/union-orilla-web.png')
CANVAS = (512, 512)
MAX_SIDE = 470
WHITE_MIN = 238
WHITE_DELTA = 14

im = Image.open(SRC).convert('RGBA')
px = im.load()
alpha = im.getchannel('A')
bbox = alpha.getbbox()
if not bbox:
    raise SystemExit('ERROR: fuente CUDO sin pixeles visibles')
x0, y0, x1, y1 = bbox

def near_white(r, g, b, a):
    return a > 0 and r >= WHITE_MIN and g >= WHITE_MIN and b >= WHITE_MIN and max(r,g,b) - min(r,g,b) <= WHITE_DELTA

visited = set()
q = deque()
for x in range(x0, x1):
    for y in (y0, y1 - 1):
        if near_white(*px[x, y]):
            q.append((x, y)); visited.add((x, y))
for y in range(y0, y1):
    for x in (x0, x1 - 1):
        if (x, y) not in visited and near_white(*px[x, y]):
            q.append((x, y)); visited.add((x, y))

while q:
    x, y = q.popleft()
    for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
        if x0 <= nx < x1 and y0 <= ny < y1 and (nx,ny) not in visited and near_white(*px[nx,ny]):
            visited.add((nx,ny)); q.append((nx,ny))

for x, y in visited:
    r, g, b, _ = px[x, y]
    px[x, y] = (r, g, b, 0)

content_bbox = im.getbbox()
if not content_bbox:
    raise SystemExit('ERROR: derivado CUDO vacio')
crop = im.crop(content_bbox)
cw, ch = crop.size
scale = min(MAX_SIDE / cw, MAX_SIDE / ch)
nw, nh = round(cw * scale), round(ch * scale)
crop = crop.resize((nw, nh), Image.Resampling.LANCZOS)
canvas = Image.new('RGBA', CANVAS, (0,0,0,0))
canvas.alpha_composite(crop, ((CANVAS[0]-nw)//2, (CANVAS[1]-nh)//2))
canvas.save(DST)

visible = canvas.getbbox()
if not visible:
    raise SystemExit('ERROR: derivado CUDO sin contenido')
print(f'OK {DST} bbox={visible} removed_background_pixels={len(visited)}')
