#!/usr/bin/env python3
"""Draw the research-overview figures from data/lab.json (standard library only; build.py runs this).

images/directions/overview.svg   The lab's four research directions as one cycle (what each feeds the
                                 next), with our robot platforms and application areas.
images/directions/<id>.svg       One map per direction: a hub (direction + core goal), its general
                                 sub-areas in two named columns (each with a thumbnail of our results and
                                 representative papers), and open questions.

Thumbnails live in images/directions/thumbs/ and are embedded, so every SVG is self-contained.
"""

import base64
import html
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
THUMBS = ROOT / "images/directions/thumbs"
OUT = ROOT / "images/directions"
NAVY, ACCENT, CYAN, INK, MUTED, LINE, SOFT = "#063a7a", "#0b55ad", "#00b4cc", "#0a2342", "#5d7087", "#d9e2ec", "#f4f7fb"
FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
W = 1200


def esc(text):
    return html.escape(str(text), quote=True)


def wrap(text, width):
    lines, line = [], ""
    for word in str(text).split():
        if line and len(line) + 1 + len(word) > width:
            lines.append(line)
            line = word
        else:
            line = f"{line} {word}".strip()
    return lines + ([line] if line else [])


def chip_w(label, size):
    return int(len(label) * size * 0.64 + 22)


def data_uri(name):
    return "data:image/jpeg;base64," + base64.b64encode((THUMBS / f"{name}.jpg").read_bytes()).decode()


class Canvas:
    def __init__(self, height, title, desc, width=W):
        self.h, self.w = height, width
        self.parts = [f'<rect width="{width}" height="{height}" fill="#fff"/>']
        self.defs = ['<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.38" stop-color="#061a36" stop-opacity="0"/>'
                     '<stop offset="1" stop-color="#061a36" stop-opacity="0.88"/></linearGradient>',
                     '<radialGradient id="hub" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#f2f8ff"/><stop offset="1" stop-color="#cfe5fa"/></radialGradient>',
                     f'<marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{CYAN}"/></marker>']
        self.title, self.desc, self.clip = title, desc, 0

    def add(self, *chunks):
        self.parts.extend(chunks)

    def image(self, name, x, y, w, h, rx=10, circle=False):
        self.clip += 1
        cid = f"c{self.clip}"
        shape = (f'<circle cx="{x + w / 2}" cy="{y + h / 2}" r="{w / 2}"/>' if circle else f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/>')
        self.defs.append(f'<clipPath id="{cid}">{shape}</clipPath>')
        self.add(f'<image href="{data_uri(name)}" x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#{cid})"/>')

    def chips(self, x, y, labels, max_w, size=12, fill=SOFT, color=ACCENT):
        """Lay chips left to right, wrapping rows; returns the number of rows used."""
        cx, cy, rows = x, y, 1
        for label in labels:
            w = chip_w(label, size)
            if cx > x and cx + w > x + max_w:
                cx, cy, rows = x, cy + 30, rows + 1
            self.add(f'<rect x="{cx}" y="{cy}" width="{w}" height="24" rx="12" fill="{fill}" stroke="{LINE}"/>'
                     f'<text x="{cx + w / 2}" y="{cy + 16.5}" text-anchor="middle" font-size="{size}" font-weight="700" fill="{color}">{esc(label)}</text>')
            cx += w + 8
        return rows

    def hub(self, cx, cy, r, title, sub, title_wrap=14, sub_wrap=22):
        self.add(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#hub)" stroke="#9cc7ef" stroke-width="2"/>')
        tl, sl = wrap(title, title_wrap), wrap(sub, sub_wrap)
        block = len(tl) * 28 + 18 + len(sl) * 19
        y = cy - block / 2 + 22
        for line in tl:
            self.add(f'<text x="{cx}" y="{y}" text-anchor="middle" font-size="24" font-weight="800" fill="{NAVY}">{esc(line)}</text>')
            y += 28
        self.add(f'<line x1="{cx - 28}" y1="{y - 12}" x2="{cx + 28}" y2="{y - 12}" stroke="{CYAN}" stroke-width="2.5" stroke-linecap="round"/>')
        y += 10
        for line in sl:
            self.add(f'<text x="{cx}" y="{y}" text-anchor="middle" font-size="14" font-weight="600" fill="{ACCENT}">{esc(line)}</text>')
            y += 19

    def ring(self, cx, cy, r, angles, dashed=True):
        dash = ' stroke-dasharray="6 8"' if dashed else ""
        self.add(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{CYAN}" stroke-width="2"{dash} opacity="0.75"/>')
        for ang in angles:  # clockwise arrowheads
            a = math.radians(ang)
            px, py = cx + r * math.cos(a), cy + r * math.sin(a)
            tx, ty = -math.sin(a), math.cos(a)
            self.add(f'<path d="M{px - tx * 10},{py - ty * 10} L{px + tx * 2},{py + ty * 2}" stroke="{CYAN}" stroke-width="2.5" marker-end="url(#arrow)"/>')

    def svg(self):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}" font-family="{FONT}" role="img" aria-labelledby="t d">'
                f'<title id="t">{esc(self.title)}</title><desc id="d">{esc(self.desc)}</desc><defs>{"".join(self.defs)}</defs>{"".join(self.parts)}</svg>')


def badge(c, x, y, number):
    c.add(f'<circle cx="{x}" cy="{y}" r="15" fill="{NAVY}" stroke="#fff" stroke-width="2"/>'
          f'<text x="{x}" y="{y + 5.5}" text-anchor="middle" font-size="15" font-weight="800" fill="#fff">{number}</text>')


def open_band(c, y, questions):
    c.add(f'<rect x="24" y="{y}" width="{W - 48}" height="96" rx="16" fill="{SOFT}" stroke="{LINE}"/>'
          f'<text x="48" y="{y + 43}" font-size="13" font-weight="800" letter-spacing="1.5" fill="{CYAN}">OPEN</text>'
          f'<text x="48" y="{y + 62}" font-size="13" font-weight="800" letter-spacing="1.5" fill="{CYAN}">QUESTIONS</text>')
    for k, q in enumerate(questions[:3]):
        qx = 172 + k * 336
        c.add(f'<circle cx="{qx + 14}" cy="{y + 48}" r="14" fill="#fff" stroke="{ACCENT}" stroke-width="2"/>'
              f'<text x="{qx + 14}" y="{y + 54}" text-anchor="middle" font-size="16" font-weight="800" fill="{ACCENT}">?</text>')
        lines = wrap(q, 30)[:3]
        y1 = y + 54 - (len(lines) - 1) * 9.5
        for j, line in enumerate(lines):
            c.add(f'<text x="{qx + 38}" y="{y1 + j * 19}" font-size="15" font-weight="600" fill="{INK}">{esc(line)}</text>')


def direction_figure(d):
    m = d["map"]
    CW, CH, GAP, TOP, IMG_H = 340, 272, 20, 64, 112
    cols = [[n for n in m["nodes"] if n.get("col", 0) == k] for k in (0, 1)]
    rows = max(len(c) for c in cols)
    area = rows * CH + (rows - 1) * GAP
    hx, hy, hr = W / 2, TOP + area / 2, 136
    band_y = TOP + area + 28
    desc = (f'{m["hub"]}: {m["core"]}. Sub-areas: ' + "; ".join(f'{n["name"]} ({n["desc"]})' for n in m["nodes"])
            + ". Open questions: " + "; ".join(m["open"]) + ".")
    c = Canvas(band_y + 96 + 24, f'{d["title"]}: research overview', desc)
    xs = (24, W - 24 - CW)
    number = 0
    placed = []
    for k, col in enumerate(cols):
        x = xs[k]
        c.add(f'<text x="{x + 4}" y="42" font-size="13" font-weight="800" letter-spacing="1.6" fill="{CYAN}">{esc(m["columns"][k].upper())}</text>'
              f'<line x1="{x + 4}" y1="52" x2="{x + CW}" y2="52" stroke="{LINE}" stroke-width="1.5"/>')
        offset = (area - (len(col) * CH + (len(col) - 1) * GAP)) / 2
        for j, node in enumerate(col):
            number += 1
            placed.append((x, TOP + offset + j * (CH + GAP), node, number, k))
    for x, y, node, n, k in placed:  # connectors first, so cards sit on top
        ax, ay = (x + CW, y + CH / 2) if k == 0 else (x, y + CH / 2)
        ang = math.atan2(ay - hy, ax - hx)
        ex, ey = hx + hr * math.cos(ang), hy + hr * math.sin(ang)
        dx = 1 if k == 0 else -1
        c.add(f'<path d="M{ax},{ay} C{ax + dx * 70},{ay} {ex - dx * 50},{ey} {ex},{ey}" fill="none" stroke="#b9c8da" stroke-width="2.5"/>'
              f'<circle cx="{ax}" cy="{ay}" r="5" fill="{CYAN}"/>')
    c.ring(hx, hy, hr + 26, (35, 125, 215, 305))
    c.hub(hx, hy, hr, m["hub"], m["core"])
    for x, y, node, n, k in placed:
        c.add(f'<rect x="{x}" y="{y}" width="{CW}" height="{CH}" rx="16" fill="#fff" stroke="{LINE}" stroke-width="1.5"/>')
        c.image(node["thumb"], x + 12, y + 12, CW - 24, IMG_H)
        badge(c, x + 32, y + 32, n)
        ty = y + IMG_H + 40
        for line in wrap(node["name"], 28)[:2]:
            c.add(f'<text x="{x + 18}" y="{ty}" font-size="19" font-weight="800" fill="{INK}">{esc(line)}</text>')
            ty += 23
        ty += 1
        for line in wrap(node["desc"], 39)[:2]:
            c.add(f'<text x="{x + 18}" y="{ty}" font-size="14.5" fill="{MUTED}">{esc(line)}</text>')
            ty += 19
        c.chips(x + 16, y + CH - 38, node["papers"], CW - 32)
    open_band(c, band_y, m["open"])
    return c.svg()


def card_figure(d):
    """16:10 card version: one photo tile per sub-area (numbered as in the full map) meeting at a light-blue hub."""
    m = d["map"]
    CW, CH, M, G = 720, 450, 12, 10
    left = [n for n in m["nodes"] if n.get("col", 0) == 0]
    right = [n for n in m["nodes"] if n.get("col", 0) == 1]
    rows = max(len(left), len(right))
    tw, th = (CW - 2 * M - G) / 2, (CH - 2 * M - (rows - 1) * G) / rows
    c = Canvas(CH, f'{d["title"]}: sub-areas', f'{m["hub"]}: ' + ", ".join(n["name"] for n in m["nodes"]) + ".", width=CW)
    number, tiles = 0, []
    for side, col in enumerate((left, right)):
        for r, node in enumerate(col):
            number += 1
            tiles.append((M + side * (tw + G), M + r * (th + G), node, number, side))
    fs = 22 if rows <= 2 else 20
    for x, y, node, n, side in tiles:
        c.image(node["thumb"], x, y, tw, th, rx=14)
        c.add(f'<rect x="{x}" y="{y}" width="{tw}" height="{th}" rx="14" fill="url(#shade)"/>')
        lines = wrap(node["name"], 16)[:2]
        tx, anchor = (x + 18, "start") if side == 0 else (x + tw - 18, "end")
        y0 = y + th - 18 - (len(lines) - 1) * (fs + 4)
        for j, line in enumerate(lines):
            c.add(f'<text x="{tx}" y="{y0 + j * (fs + 4)}" text-anchor="{anchor}" font-size="{fs}" font-weight="800" fill="#fff" '
                  f'stroke="#061a36" stroke-opacity="0.55" stroke-width="4" stroke-linejoin="round" paint-order="stroke">{esc(line)}</text>')
        badge(c, x + 30 if side == 0 else x + tw - 30, y + 30, n)
    hx, hy = CW / 2, CH / 2
    hr = 72 if rows <= 2 else 60
    c.add(f'<circle cx="{hx}" cy="{hy}" r="{hr + 18}" fill="none" stroke="{CYAN}" stroke-width="2.5" stroke-dasharray="6 6"/>'
          f'<circle cx="{hx}" cy="{hy}" r="{hr + 9}" fill="#fff"/>'
          f'<circle cx="{hx}" cy="{hy}" r="{hr}" fill="url(#hub)" stroke="#9cc7ef" stroke-width="2"/>')
    for ang in (45, 135, 225, 315):  # one dot towards each tile column/row
        a = math.radians(ang)
        c.add(f'<circle cx="{hx + (hr + 18) * math.cos(a)}" cy="{hy + (hr + 18) * math.sin(a)}" r="5" fill="{CYAN}" stroke="#fff" stroke-width="2"/>')
    hl = wrap(m["hub"], 13)
    hs = min(18 if len(hl) <= 3 else 16, (2 * hr - 22) / (max(len(x) for x in hl) * 0.62))  # shrink to fit the circle
    y0 = hy - (len(hl) - 1) * (hs + 3) / 2 + hs * 0.36
    for j, line in enumerate(hl):
        c.add(f'<text x="{hx}" y="{y0 + j * (hs + 3)}" text-anchor="middle" font-size="{hs}" font-weight="800" fill="{NAVY}">{esc(line)}</text>')
    return c.svg()


def overview_figure(lab):
    ov = lab["overview"]
    dirs = lab["directions"]
    CW, CH, IMG_H = 352, 330, 121
    pos = [(24, 24), (W - 24 - CW, 24), (W - 24 - CW, 24 + CH + 26), (24, 24 + CH + 26)]  # clockwise: TL, TR, BR, BL
    hx, hy = W / 2, 24 + CH + 13
    ring_r = 206
    band_y = 24 + 2 * CH + 26 + 26
    H = band_y + 150 + 24
    desc = (f'{ov["hub"]} at {ov["sub"]}: ' + "; ".join(f'{i + 1}. {d["title"]} ({ov["guides"][d["id"]]})' for i, d in enumerate(dirs))
            + ". Flows: " + "; ".join(f'{a} to {b}: {f}' for a, b, f in zip(range(1, 5), [2, 3, 4, 1], ov["flows"]))
            + ". Platforms: " + ", ".join(p["name"] for p in ov["platforms"]) + ". Applications: " + ", ".join(ov["applications"]) + ".")
    c = Canvas(H, f'{lab["short_name"]} research overview', desc)
    for i, (x, y) in enumerate(pos):  # connectors tile -> ring
        ax = x + CW if i in (0, 3) else x
        ay = y + CH / 2
        a = math.atan2(ay - hy, ax - hx)
        ex, ey = hx + ring_r * math.cos(a), hy + ring_r * math.sin(a)
        c.add(f'<line x1="{ax}" y1="{ay}" x2="{ex}" y2="{ey}" stroke="#b9c8da" stroke-width="2.5"/>'
              f'<circle cx="{ax}" cy="{ay}" r="5" fill="{CYAN}"/><circle cx="{ex}" cy="{ey}" r="5" fill="{CYAN}"/>')
    c.ring(hx, hy, ring_r, (-90, 0, 90, 180), dashed=False)
    # flow labels just inside the ring; the side labels run vertically so they clear the hub
    label_pos = [(hx, hy - ring_r + 30, 0), (hx + ring_r - 22, hy, 90), (hx, hy + ring_r - 20, 0), (hx - ring_r + 22, hy, -90)]
    for (lx, ly, rot), flow in zip(label_pos, ov["flows"]):
        turn = f' transform="rotate({rot} {lx} {ly})"' if rot else ""
        c.add(f'<text x="{lx}" y="{ly + (5 if rot else 0)}" text-anchor="middle"{turn} font-size="13.5" font-weight="700" font-style="italic" fill="{ACCENT}">{esc(flow)}</text>')
    c.hub(hx, hy, 104, ov["hub"], ov["sub"], title_wrap=10, sub_wrap=16)
    for i, ((x, y), d) in enumerate(zip(pos, dirs)):
        c.add(f'<rect x="{x}" y="{y}" width="{CW}" height="{CH}" rx="16" fill="#fff" stroke="{LINE}" stroke-width="1.5"/>')
        c.image(f'hero-{d["id"]}', x + 12, y + 12, CW - 24, IMG_H)
        badge(c, x + 32, y + 32, i + 1)
        ty = y + IMG_H + 42
        for line in wrap(d["title"], 27)[:2]:
            c.add(f'<text x="{x + 18}" y="{ty}" font-size="19" font-weight="800" fill="{INK}">{esc(line)}</text>')
            ty += 23
        for line in wrap(ov["guides"][d["id"]], 40)[:2]:
            c.add(f'<text x="{x + 18}" y="{ty + 2}" font-size="14.5" font-style="italic" fill="{MUTED}">{esc(line)}</text>')
            ty += 19
        c.chips(x + 16, ty + 12, [n.get("short", n["name"]) for n in d["map"]["nodes"]], CW - 32, size=11.5, fill="#fff")
    # platforms and applications
    c.add(f'<rect x="24" y="{band_y}" width="{W - 48}" height="150" rx="16" fill="{SOFT}" stroke="{LINE}"/>'
          f'<text x="48" y="{band_y + 32}" font-size="13" font-weight="800" letter-spacing="1.5" fill="{CYAN}">OUR PLATFORMS</text>'
          f'<text x="760" y="{band_y + 32}" font-size="13" font-weight="800" letter-spacing="1.5" fill="{CYAN}">APPLICATIONS</text>'
          f'<line x1="736" y1="{band_y + 18}" x2="736" y2="{band_y + 132}" stroke="{LINE}" stroke-width="1.5"/>')
    for i, p in enumerate(ov["platforms"]):
        px = 60 + i * 134
        c.add(f'<circle cx="{px + 34}" cy="{band_y + 82}" r="37" fill="#fff" stroke="{LINE}" stroke-width="1.5"/>')
        c.image(p["thumb"], px, band_y + 48, 68, 68, circle=True)
        c.add(f'<text x="{px + 34}" y="{band_y + 138}" text-anchor="middle" font-size="12.5" font-weight="700" fill="{INK}">{esc(p["name"])}</text>')
    c.chips(760, band_y + 52, ov["applications"], W - 48 - 760 + 4, size=12.5, fill="#fff")
    return c.svg()


def main():
    lab = json.loads((ROOT / "data/lab.json").read_text(encoding="utf-8"))
    made = []
    for d in lab["directions"]:
        if d.get("map"):
            (OUT / f'{d["id"]}.svg').write_text(direction_figure(d), encoding="utf-8")
            (OUT / f'{d["id"]}-card.svg').write_text(card_figure(d), encoding="utf-8")
            made.append(d["id"])
    if lab.get("overview") and all(d.get("map") for d in lab["directions"]):
        (OUT / "overview.svg").write_text(overview_figure(lab), encoding="utf-8")
        made.append("overview")
    return made


if __name__ == "__main__":
    print("Drew research figures:", ", ".join(main()))
