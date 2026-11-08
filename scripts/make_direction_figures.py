#!/usr/bin/env python3
"""Draw one 'research map' SVG per research direction from data/lab.json -> directions[].map.

Layout: a hub with the direction's core goal, four sub-problem nodes (guiding question, a thumbnail of
our own results, the papers that address it), and a band of open questions. Thumbnails in
images/directions/thumbs/ are embedded, so each SVG is self-contained and works in an <img> tag.
Standard library only. build.py runs this automatically.
"""

import base64
import html
import math
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
THUMBS = ROOT / "images/directions/thumbs"
OUT = ROOT / "images/directions"
W, H = 1200, 900
NAVY, ACCENT, CYAN, INK, MUTED, LINE, SOFT = "#063a7a", "#0b55ad", "#00b4cc", "#0a2342", "#5d7087", "#d9e2ec", "#f4f7fb"
FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
NODE_W, NODE_H = 300, 352
NODES = [(40, 28), (860, 28), (40, 410), (860, 410)]          # top-left, top-right, bottom-left, bottom-right
HUB = (600, 395, 128)
SHIELD = "M0,-34 L28,-24 L28,2 C28,22 14,34 0,40 C-14,34 -28,22 -28,2 L-28,-24 Z"


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


def chip_width(label):
    return int(len(label) * 7.2 + 22)


def node_svg(i, x, y, node):
    out = [f'<g id="node-{i + 1}">',
           f'<rect x="{x}" y="{y}" width="{NODE_W}" height="{NODE_H}" rx="16" fill="#fff" stroke="{LINE}" stroke-width="1.5"/>']
    ix, iy, iw, ih = x + 14, y + 14, NODE_W - 28, 152
    out.append(f'<clipPath id="clip-{i}"><rect x="{ix}" y="{iy}" width="{iw}" height="{ih}" rx="10"/></clipPath>')
    if node.get("thumb"):
        data = base64.b64encode((THUMBS / f'{node["thumb"]}.jpg').read_bytes()).decode()
        out.append(f'<image href="data:image/jpeg;base64,{data}" x="{ix}" y="{iy}" width="{iw}" height="{ih}" '
                   f'preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-{i})"/>')
    else:
        out.append(f'<rect x="{ix}" y="{iy}" width="{iw}" height="{ih}" rx="10" fill="url(#placeholder)"/>')
        out.append(f'<path d="{SHIELD}" transform="translate({ix + iw / 2},{iy + ih / 2 - 4})" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>')
        out.append(f'<path d="M-12,2 L-3,11 L14,-8" transform="translate({ix + iw / 2},{iy + ih / 2 - 4})" fill="none" stroke="{CYAN}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>')
    out.append(f'<circle cx="{ix + 22}" cy="{iy + 22}" r="16" fill="{NAVY}" stroke="#fff" stroke-width="2"/>'
               f'<text x="{ix + 22}" y="{iy + 28}" text-anchor="middle" font-size="16" font-weight="800" fill="#fff">{i + 1}</text>')
    ty = y + 196
    out.append(f'<text x="{x + 18}" y="{ty}" font-size="12.5" font-weight="800" letter-spacing="0.9" fill="{CYAN}">{esc(node["label"].upper())}</text>')
    for k, line in enumerate(wrap(node["question"], 23)[:3]):
        out.append(f'<text x="{x + 18}" y="{ty + 27 + k * 24}" font-size="19" font-weight="700" fill="{INK}">{esc(line)}</text>')
    rows, used = 1, 0
    for label in node["papers"]:  # count chip rows first so two rows still fit inside the card
        w = chip_width(label)
        if used and used + w > NODE_W - 32:
            rows, used = rows + 1, 0
        used += w + 8
    cx, cy = x + 18, y + NODE_H - 44 - (rows - 1) * 30
    for label in node["papers"]:
        w = chip_width(label)
        if cx + w > x + NODE_W - 14:
            cx, cy = x + 18, cy + 30
        out.append(f'<rect x="{cx}" y="{cy}" width="{w}" height="24" rx="12" fill="{SOFT}" stroke="{LINE}"/>'
                   f'<text x="{cx + w / 2}" y="{cy + 16.5}" text-anchor="middle" font-size="12.5" font-weight="700" fill="{ACCENT}">{esc(label)}</text>')
        cx += w + 8
    out.append("</g>")
    return "".join(out)


def connector(x, y, right_side, top):
    hx, hy, r = HUB
    ax = x + NODE_W if not right_side else x
    ay = y + NODE_H / 2
    dx = -1 if right_side else 1
    ex, ey = hx - dx * r * 0.82, hy + (-1 if top else 1) * r * 0.57
    return (f'<path d="M{ax},{ay} C{ax + dx * 70},{ay} {ex - dx * 40},{ey} {ex},{ey}" fill="none" stroke="#b9c8da" stroke-width="2.5"/>'
            f'<circle cx="{ax}" cy="{ay}" r="5" fill="{CYAN}"/><circle cx="{ex}" cy="{ey}" r="5" fill="{CYAN}"/>')


def figure(direction):
    m = direction["map"]
    hx, hy, r = HUB
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{FONT}" role="img" aria-labelledby="t d">',
             f'<title id="t">{esc(direction["title"])}: research map</title>',
             f'<desc id="d">{esc(m["core"])}. Sub-problems: ' + "; ".join(esc(n["label"] + " (" + n["question"] + ")") for n in m["nodes"])
             + ". Open questions: " + "; ".join(esc(q) for q in m["open"]) + ".</desc>",
             '<defs><radialGradient id="hub" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#0b55ad"/><stop offset="1" stop-color="#061a36"/></radialGradient>'
             '<linearGradient id="placeholder" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b55ad"/><stop offset="1" stop-color="#061a36"/></linearGradient>'
             f'<marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{CYAN}"/></marker></defs>',
             f'<rect width="{W}" height="{H}" fill="#fff"/>']
    for i, (x, y) in enumerate(NODES):
        parts.append(connector(x, y, right_side=i % 2 == 1, top=i < 2))
    # feedback loop around the hub: the sub-problems feed one another
    parts.append(f'<circle cx="{hx}" cy="{hy}" r="{r + 26}" fill="none" stroke="{CYAN}" stroke-width="2" stroke-dasharray="6 8" opacity="0.7"/>')
    for ang in (35, 125, 215, 305):
        a = math.radians(ang)
        px, py = hx + (r + 26) * math.cos(a), hy + (r + 26) * math.sin(a)
        tx, ty = -math.sin(a), math.cos(a)
        parts.append(f'<path d="M{px - tx * 10},{py - ty * 10} L{px + tx * 2},{py + ty * 2}" stroke="{CYAN}" stroke-width="2.5" marker-end="url(#arrow)"/>')
    parts.append(f'<circle cx="{hx}" cy="{hy}" r="{r}" fill="url(#hub)"/>')
    lines = wrap(m["core"], 16)
    y0 = hy - (len(lines) - 1) * 14 + 18  # text block centred a little low, kicker sits just above it
    parts.append(f'<text x="{hx}" y="{y0 - 34}" text-anchor="middle" font-size="12.5" font-weight="800" letter-spacing="1.5" fill="{CYAN}">CORE GOAL</text>')
    for k, line in enumerate(lines):
        parts.append(f'<text x="{hx}" y="{y0 + k * 28}" text-anchor="middle" font-size="23" font-weight="800" fill="#fff">{esc(line)}</text>')
    for i, ((x, y), node) in enumerate(zip(NODES, m["nodes"])):
        parts.append(node_svg(i, x, y, node))
    by = 790
    parts.append(f'<rect x="40" y="{by}" width="1120" height="92" rx="16" fill="{SOFT}" stroke="{LINE}"/>')
    parts.append(f'<text x="64" y="{by + 40}" font-size="13" font-weight="800" letter-spacing="1.5" fill="{CYAN}">OPEN</text>'
                 f'<text x="64" y="{by + 60}" font-size="13" font-weight="800" letter-spacing="1.5" fill="{CYAN}">QUESTIONS</text>')
    for k, q in enumerate(m["open"][:3]):
        qx = 190 + k * 325
        parts.append(f'<circle cx="{qx + 14}" cy="{by + 46}" r="14" fill="#fff" stroke="{ACCENT}" stroke-width="2"/>'
                     f'<text x="{qx + 14}" y="{by + 52}" text-anchor="middle" font-size="16" font-weight="800" fill="{ACCENT}">?</text>')
        ql = wrap(q, 28)[:3]
        y1 = by + 52 - (len(ql) - 1) * 9.5
        for j, line in enumerate(ql):
            parts.append(f'<text x="{qx + 38}" y="{y1 + j * 19}" font-size="15" font-weight="600" fill="{INK}">{esc(line)}</text>')
    parts.append("</svg>")
    return "".join(parts)


def main():
    lab = json.loads((ROOT / "data/lab.json").read_text(encoding="utf-8"))
    made = []
    for d in lab["directions"]:
        if d.get("map"):
            (OUT / f'{d["id"]}.svg').write_text(figure(d), encoding="utf-8")
            made.append(d["id"])
    return made


if __name__ == "__main__":
    print("Drew research maps:", ", ".join(main()))
