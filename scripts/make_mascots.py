#!/usr/bin/env python3
"""Web assets of the lab mascots (the crane and the buffalo) from the original art in images/mascots/.

The originals are large RGBA PNGs whose background removal left a faint white glow (alpha 1-80) and a body alpha of
about 252 instead of 255. This script maps alpha back to clean edges, then writes small WebP files:

  <id>-sprite.webp   4 x 4 frames (rows: walk, run, seated idle, wave), CELL px per frame, read by assets/site.js and site.css
  <id>.webp          portrait for the Members page (Mascots tab)
  <id>-moods.webp    the six poses of the mood sheet in one row, MOOD px per pose
  mascot-face.webp   the crane's head, the icon of the mascot button in the top bar

Run:  python3 scripts/make_mascots.py   (then python3 scripts/build.py)
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "images" / "mascots"
SOURCES = {
    "crane": {"portrait": "crane.png", "sprite": "Four-row crane animation sprite sheet.png", "moods": "crane_mascot_six-pose.png", "align": False},
    # the buffalo drifts about 15 px to the left from frame to frame of each row: align its frames on the head
    "buffalo": {"portrait": "buffalo.png", "sprite": "Vietnamese Water Buffalo Animation Sprite Sheet.png", "moods": "buffalo_emotion_.png", "align": True},
}
CELL, MOOD, PORTRAIT_H, FACE = 200, 260, 760, 96


def clean(im, lo=60, hi=235):
    """Remove the background glow (low alpha) and make the body fully opaque. No erosion: it broke thin lines (the cube)."""
    a = np.array(im.convert("RGBA"))
    a[..., 3] = (np.clip((a[..., 3].astype(np.float32) - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(a)


def resize(im, size):
    return im.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")  # premultiplied, so edges do not darken


def bands(mask_1d):
    """(start, end) runs of True in a 1-D mask: the rows or columns that hold one figure."""
    out, start = [], None
    for i, v in enumerate(mask_1d):
        if v and start is None:
            start = i
        if not v and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(mask_1d)))
    return out


def head_x(alpha):
    ys, xs = np.nonzero(alpha > 128)
    top = ys.min()
    return xs[(ys >= top) & (ys < top + 70)].mean()


def sprite(src, align):
    im = clean(Image.open(src))
    n, size = 4, im.size[0] / 4
    cells = [[im.crop((round(k * size), round(r * size), round((k + 1) * size), round((r + 1) * size))) for k in range(n)] for r in range(n)]
    if align:
        for r, row in enumerate(cells):
            hx = [head_x(np.array(c)[..., 3]) for c in row]
            ref = sum(hx) / n
            for k, c in enumerate(row):
                moved = Image.new("RGBA", c.size)
                moved.paste(c, (int(round(ref - hx[k])), 0))
                cells[r][k] = moved
    # common baseline: the lowest foot of any frame sits 2 source px above the cell bottom
    bottom = max(np.nonzero(np.array(c)[..., 3] > 128)[0].max() for row in cells for c in row)
    shift = int(round(cells[0][0].size[1] - 2 - bottom))
    sheet = Image.new("RGBA", (CELL * n, CELL * n))
    for r, row in enumerate(cells):
        for k, c in enumerate(row):
            moved = Image.new("RGBA", c.size)
            moved.paste(c, (0, shift))
            sheet.paste(resize(moved, (CELL, CELL)), (k * CELL, r * CELL))
    return sheet


def bbox(im, pad=0.0):
    ys, xs = np.nonzero(np.array(im)[..., 3] > 16)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    p = int(round(pad * max(x1 - x0, y1 - y0)))
    return int(max(0, x0 - p)), int(max(0, y0 - p)), int(min(im.size[0], x1 + p)), int(min(im.size[1], y1 + p))


def portrait(src):
    im = clean(Image.open(src))
    im = im.crop(bbox(im, 0.03))
    w, h = im.size
    return resize(im, (round(w * PORTRAIT_H / h), PORTRAIT_H))


def moods(src):
    """Six poses on a 3 x 2 sheet -> one row of six square cells, all at one scale and standing on one baseline."""
    im = clean(Image.open(src))
    a = np.array(im)[..., 3] > 128
    rows = [b for b in bands(a.any(1)) if b[1] - b[0] > 40]
    figs = []
    for y0, y1 in rows:
        for x0, x1 in [b for b in bands(a[y0:y1].any(0)) if b[1] - b[0] > 40]:
            fig = im.crop((x0, y0, x1, y1))
            figs.append(fig.crop(bbox(fig)))
    assert len(figs) == 6, f"{src.name}: found {len(figs)} poses, expected 6"
    scale = 0.94 * MOOD / max(max(f.size) for f in figs)
    out = Image.new("RGBA", (MOOD * 6, MOOD))
    for i, f in enumerate(figs):
        f = resize(f, (max(1, round(f.size[0] * scale)), max(1, round(f.size[1] * scale))))
        out.paste(f, (i * MOOD + (MOOD - f.size[0]) // 2, MOOD - 4 - f.size[1]), f)
    return out


def face(src):
    """The crane's head (crest, eyes and beak), square, for the mascot button. The box is in crane.png pixels (1254 x 1254)."""
    im = clean(Image.open(src))
    return resize(im.crop((380, 25, 860, 505)), (FACE, FACE))


def save(im, name):
    path = DIR / name
    im.save(path, "WEBP", quality=84, method=6)
    print(f"{path.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}  {path.stat().st_size / 1024:.0f} KB")


def main():
    for mid, s in SOURCES.items():
        save(sprite(DIR / s["sprite"], s["align"]), f"{mid}-sprite.webp")
        save(portrait(DIR / s["portrait"]), f"{mid}.webp")
        save(moods(DIR / s["moods"]), f"{mid}-moods.webp")
    save(face(DIR / SOURCES["crane"]["portrait"]), "mascot-face.webp")


if __name__ == "__main__":
    main()
