#!/usr/bin/env python3
"""Web assets of the lab mascots (the crane and the buffalo) from the original art in images/mascots/.

The originals are large RGBA PNGs whose background removal left a faint glow (alpha 1-80) and a body alpha of about
252 instead of 255. This script maps alpha back to clean edges, then writes small WebP files. The crane and the buffalo
come as sheets (4 x 4 motion frames, 3 x 2 moods); the golden carp comes as separate frame and mood PNGs.

  <id>-sprite.webp   4 x 4 frames (rows: walk, run, seated idle, wave), CELL px per frame, read by assets/site.js and site.css
  <id>.webp          portrait for the Members page (Mascots tab)
  <id>-moods.webp    the six poses of the mood sheet in one row of CELL px cells, at the walker's scale (assets/mascots.js)
  mascot-face.webp   the crane's head, the icon of the mascot button in the top bar

Run:  python3 scripts/make_mascots.py   (then python3 scripts/build.py)
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "images" / "mascots"
CARP = "Chep_Moods_Animations"
SOURCES = {
    "crane": {"portrait": "crane.png", "sprite": "Four-row crane animation sprite sheet.png", "moods": "crane_mascot_six-pose.png", "align": False},
    # the buffalo drifts about 15 px to the left from frame to frame of each row: align its frames on the head
    "buffalo": {"portrait": "buffalo.png", "sprite": "Vietnamese Water Buffalo Animation Sprite Sheet.png", "moods": "buffalo_emotion_.png", "align": True},
    # rows: swim slowly, swim fast, rest and blink, wave a fin (the walk, run, sit and wave rows); moods in slot order
    "carp": {"portrait": "Golden_carp.png",
             "frames": [[f"{CARP}/frames/{a}_{k:02d}.png" for k in range(1, 5)] for a in ("swim_slow", "swim_fast", "rest_blink", "fin_wave")],
             "mood_files": [f"{CARP}/moods/Chep_{m}.png" for m in ("happy", "curious", "surprised", "thinking", "sleepy", "celebrating")]},
}
CELL, PORTRAIT_H, FACE = 200, 760, 96


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


def head_x(alpha, band=70):
    """Mean x of the top `band` rows of a figure: where its head is (horns and crest included)."""
    ys, xs = np.nonzero(alpha > 128)
    top = ys.min()
    return xs[(ys >= top) & (ys < top + band)].mean()


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


def sprite_from_frames(rows):
    """4 x 4 frames from separate PNGs, all cut with one common box (so the loop does not jitter): the figure fills about
    92 % of the cell, like the sheet mascots, and its lowest point sits 2 cell px above the bottom."""
    ims = [[clean(Image.open(DIR / f)) for f in row] for row in rows]
    boxes = [bbox(im) for row in ims for im in row]
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    side = max(x1 - x0, y1 - y0) / 0.92
    cx, bottom = (x0 + x1) / 2, y1 + side * 2 / CELL
    box = tuple(int(round(v)) for v in (cx - side / 2, bottom - side, cx + side / 2, bottom))
    sheet = Image.new("RGBA", (CELL * 4, CELL * 4))
    for r, row in enumerate(ims):
        for k, im in enumerate(row):
            sheet.paste(resize(im.crop(box), (CELL, CELL)), (k * CELL, r * CELL))
    return sheet


def walker_reference(sheet):
    """Height and head x (cell px) of the first walk frame; the mood poses are drawn to match it."""
    a = np.array(sheet.crop((0, 0, CELL, CELL)))[..., 3]
    ys = np.nonzero(a > 128)[0]
    return ys.max() + 1 - ys.min(), head_x(a, band=30)


def poses_from_sheet(src):
    """The six poses of a 3 x 2 mood sheet (hello, curious, surprised / thinking, calm, joy): (image, box, feet line of the row)."""
    im = clean(Image.open(src))
    a = np.array(im)[..., 3] > 128
    poses = []
    for y0, y1 in [b for b in bands(a.any(1)) if b[1] - b[0] > 40]:
        boxes = []
        for x0, x1 in [b for b in bands(a[y0:y1].any(0)) if b[1] - b[0] > 40]:
            ys, xs = np.nonzero(a[y0:y1, x0:x1])
            boxes.append((x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1))
        poses += [(im, box, max(b[3] for b in boxes)) for box in boxes]
    assert len(poses) == 6, f"{src.name}: found {len(poses)} poses, expected 6"
    return poses


def poses_from_files(files):
    """Six mood PNGs, one pose each: (image, box, its own bottom as the feet line)."""
    out = []
    for f in files:
        im = clean(Image.open(DIR / f))
        ys, xs = np.nonzero(np.array(im)[..., 3] > 128)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        out.append((im, box, box[3]))
    return out


def moods(poses, ref, name):
    """Six poses -> one row of CELL px cells at the walker's scale: the hello pose is as tall as the first walk frame and
    every head sits at that frame's head x, so the strolling mascot can switch to a mood in place. Poses keep their height
    above their feet line (jumps stay up)."""
    height, head = ref
    scale = height / (poses[0][1][3] - poses[0][1][1])
    out = Image.new("RGBA", (CELL * 6, CELL))
    for i, (im, box, ground) in enumerate(poses):
        fig = im.crop(tuple(int(v) for v in box))
        hx = head_x(np.array(fig)[..., 3], band=50) * scale
        w, h = max(1, int(round(fig.size[0] * scale))), max(1, int(round(fig.size[1] * scale)))
        assert w <= CELL and h <= CELL, f"{name}: pose {i} is {w}x{h}, larger than a {CELL} px cell"
        x = min(CELL - w, max(0, int(round(head - hx))))
        y = max(0, CELL - 2 - h - int(round((ground - box[3]) * scale)))
        out.paste(resize(fig, (w, h)), (i * CELL + x, y))
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
        sheet = sprite(DIR / s["sprite"], s["align"]) if "sprite" in s else sprite_from_frames(s["frames"])
        save(sheet, f"{mid}-sprite.webp")
        save(portrait(DIR / s["portrait"]), f"{mid}.webp")
        poses = poses_from_sheet(DIR / s["moods"]) if "moods" in s else poses_from_files(s["mood_files"])
        save(moods(poses, walker_reference(sheet), mid), f"{mid}-moods.webp")
    save(face(DIR / SOURCES["crane"]["portrait"]), "mascot-face.webp")


if __name__ == "__main__":
    main()
