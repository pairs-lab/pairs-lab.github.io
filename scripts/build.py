#!/usr/bin/env python3
"""Build the PAIRS Lab website from data/*.json with the Python standard library.

Run from anywhere:  python3 scripts/build.py
All links are relative, so the site works at https://pairs-lab.github.io/ or under a sub-path.
"""

import datetime
import hashlib
import html
import json
import re
import shutil
import unicodedata
from collections import Counter
from pathlib import Path

import make_direction_figures

ROOT = Path(__file__).resolve().parents[1]
LAB = json.loads((ROOT / "data/lab.json").read_text(encoding="utf-8"))
PAPERS = json.loads((ROOT / "data/publications.json").read_text(encoding="utf-8"))
LIFE = json.loads((ROOT / "data/life.json").read_text(encoding="utf-8"))
NEWS = sorted(json.loads((ROOT / "data/news.json").read_text(encoding="utf-8")), key=lambda n: n["date"], reverse=True)
PAGES = [("", "Home"), ("research", "Research"), ("publications", "Publications"), ("projects", "Projects"),
         ("datasets", "Datasets & Resources"), ("news", "News"), ("life", "Lab Life"), ("people", "Members"), ("join", "Join Us")]
TYPE_LABEL = {"journal": "Journal", "conference": "Conference", "preprint": "Preprint"}
TYPE_ORDER = {"journal": 0, "conference": 1, "preprint": 2}
HIDDEN_STATUS = {"", "accepted", "published"}
REV = hashlib.sha256((ROOT / "assets/site.css").read_bytes() + (ROOT / "assets/site.js").read_bytes()).hexdigest()[:10]
ARROW = '<span aria-hidden="true">→</span>'
EXT = '<span aria-hidden="true">↗</span>'


def esc(value):
    return html.escape(str(value), quote=True)


def plain(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value))).strip()


def slugify(value):
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def name_key(name):
    """Order-free key so "Bao Nguyen Quoc", "Huy-Hoang Ngo" and "Kien HoangVan" match the member list."""
    return tuple(sorted(slugify(re.sub(r"([a-z])([A-Z])", r"\1 \2", name)).split("-")))


MEMBERS = {name_key(n) for g in LAB["people"] for m in g["members"] for n in [m["name"], *m.get("aliases", [])]}


def route(slug, prefix):
    return prefix + (slug + "/" if slug else "") or "./"


def relink(fragment, prefix):
    """Prefix site-relative hrefs inside stored HTML (news items) for pages below the root."""
    return re.sub(r'href="(?!https?:|mailto:|#|/)([^"]*)"', lambda m: f'href="{prefix}{m.group(1)}"', fragment)


def month(date):
    return datetime.datetime.strptime(date, "%Y-%m").strftime("%b %Y")


def section_head(title, link="", label="", kicker=""):
    action = f'<a class="section-link" href="{esc(link)}">{esc(label)} {ARROW}</a>' if link else ""
    kick = f'<p class="kicker">{esc(kicker)}</p>' if kicker else ""
    return f'<div class="section-head"><div>{kick}<h2>{esc(title)}</h2></div>{action}</div>'


def page_head(title, intro, kicker):
    return (f'<header class="page-head"><div class="shell"><p class="kicker">{esc(kicker)}</p>'
            f'<h1>{esc(title)}</h1><p class="lead">{intro}</p></div></header>')


def by_type_then_order(papers):
    return sorted(papers, key=lambda p: TYPE_ORDER[p["type"]])


# ---------- publications ----------

def in_review(p):
    return p.get("status", "") not in HIDDEN_STATUS or p["type"] == "preprint"


def citation(p):
    head = f'title = {{{p["title"]}}},\n  author = {{{" and ".join(p["authors"])}}},\n'
    arxiv = p["links"].get("arxiv", "")
    if in_review(p):  # not published yet: cite the arXiv version, never claim the target venue
        note = f'  note = {{{"Preprint" if not p.get("status") or p["status"] == "preprint" else "Preprint, " + p["status"]}}},\n'
        eprint = f'  eprint = {{{arxiv.rsplit("/", 1)[-1]}}},\n  archivePrefix = {{arXiv}},\n' if arxiv else ""
        return f'@misc{{{p["id"]},\n  {head}{eprint}{note}  year = {{{p["year"]}}}\n}}'
    kind, field = {"journal": ("article", "journal"), "conference": ("inproceedings", "booktitle")}[p["type"]]
    doi = p["links"].get("paper", "")
    doi_line = f'  doi = {{{doi.split("doi.org/", 1)[1]}}},\n' if "doi.org/" in doi else ""
    return f'@{kind}{{{p["id"]},\n  {head}  {field} = {{{p["venue"]}}},\n{doi_line}  year = {{{p["year"]}}}\n}}'


LINK_SLOTS = [("paper", "Paper"), ("arxiv", "arXiv"), ("code", "Code"), ("website", "Project")]


def links(p):
    """Always four slots in the same order; a missing link shows as a greyed-out placeholder."""
    out = ""
    for key, label in LINK_SLOTS:
        url = p["links"].get(key, "")
        if url:
            out += f'<a class="chip-link" href="{esc(url)}">{label} {EXT}</a>'
        else:
            out += f'<span class="chip-link is-empty" aria-disabled="true" title="Not available yet">{label}</span>'
    return out


def fresh(path):
    """Append a content fingerprint so browsers refetch an image as soon as it changes."""
    f = ROOT / path
    return f"{path}?v={hashlib.sha256(f.read_bytes()).hexdigest()[:8]}" if f.is_file() else path


def media(p, prefix):
    if p.get("image"):
        return f'<img src="{esc(prefix + fresh(p["image"]))}" alt="" loading="lazy" decoding="async">'
    if p.get("video"):
        src = p["video"] if p["video"].startswith("http") else prefix + p["video"]
        poster = f' poster="{esc(prefix + fresh(p["poster"]))}" preload="none"' if p.get("poster") else ' preload="metadata"'
        return (f'<video controls muted playsinline{poster} aria-label="Demo video: {esc(p["title"])}">'
                f'<source src="{esc(src)}" type="video/mp4"></video>')
    return ""


def authors(p):
    return ", ".join(f"<strong>{esc(a)}</strong>" if name_key(a) in MEMBERS else esc(a) for a in p["authors"])


def badge_and_venue(p):
    """Under review / preprint: 'Preprint' badge and year only; the target venue stays in the data for later."""
    if in_review(p):
        return f'<span class="badge badge-preprint">Preprint</span>{p["year"]}'
    return f'<span class="badge badge-{p["type"]}">{TYPE_LABEL[p["type"]]}</span>{esc(p["venue"])} · {p["year"]}'


def paper_card(p, prefix, compact=False):
    title = esc(p["title"])
    if p["links"].get("website"):
        title = f'<a href="{esc(p["links"]["website"])}">{title}</a>'
    status = f' <span class="status">{esc(p["status"])}</span>' if p.get("status", "") not in HIDDEN_STATUS | {"preprint"} else ""
    extra = ""
    if not compact:
        if p.get("abstract"):
            extra += f'<details><summary>Abstract</summary><p>{esc(p["abstract"])}</p></details>'
        extra += f'<details><summary>BibTeX</summary><pre><code>{esc(citation(p))}</code></pre></details>'
    pic = media(p, prefix)
    search = esc(" ".join([p["title"], *p["authors"], p["venue"], str(p["year"]), *p["topics"]]).lower())
    return (f'<article class="paper{"" if pic else " no-media"}" id="{esc(p["id"])}" data-type="{"preprint" if in_review(p) else p["type"]}" data-review="{1 if in_review(p) else 0}" '
            f'data-year="{p["year"]}" data-topics="{esc("|".join(p["topics"]))}" data-search="{search}">'
            + (f'<div class="paper-media">{pic}</div>' if pic else "")
            + f'<div class="paper-body"><p class="paper-meta">{badge_and_venue(p)}{status}</p><h3>{title}</h3><p class="authors">{authors(p)}</p>'
            f'<div class="chips">{links(p)}</div>{extra}</div></article>')


# ---------- page shell ----------

def render(slug, title, description, body):
    depth = slug.count("/") + 1 if slug else 0
    prefix = "../" * depth
    section = slug.split("/")[0]
    current = ' aria-current="page"'
    nav = "".join(f'<a href="{route(s, prefix)}"{current if s == section else ""}>{esc(label)}</a>' for s, label in PAGES)
    aff = LAB["affiliation"]
    office = LAB["office"]
    full_title = f'{title} · {LAB["short_name"]}' if slug else f'{LAB["short_name"]} · {LAB["name"]}'
    og_image = LAB["hero_image"] if (ROOT / LAB["hero_image"]).is_file() else "images/brand/og-image.png"
    doc = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(full_title)}</title>
<meta name="description" content="{esc(plain(description))}">
<meta property="og:type" content="website"><meta property="og:site_name" content="{esc(LAB["short_name"])}">
<meta property="og:title" content="{esc(full_title)}"><meta property="og:description" content="{esc(plain(description))}">
<meta property="og:url" content="{esc(LAB["site_url"] + (slug + "/" if slug else ""))}">
<meta property="og:image" content="{esc(LAB["site_url"] + og_image)}"><meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#063a7a"><meta name="color-scheme" content="light">
<link rel="icon" href="{prefix}images/brand/pairs-lab-icon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="{prefix}images/brand/pairs-lab-icon-180.png">
<link rel="stylesheet" href="{prefix}assets/site.css?v={REV}">
<script>document.documentElement.classList.add("js")</script>
<script src="{prefix}assets/site.js?v={REV}" defer></script>
</head>
<body class="page-{section or "home"}">
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header"><div class="shell header-row">
<a class="brand" href="{route("", prefix)}"><img src="{prefix}images/brand/pairs-lab-horizontal.png" width="164" height="48" alt="{esc(LAB["short_name"])} — {esc(LAB["name"])}"></a>
<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open navigation"><span></span><span></span><span></span></button>
<nav class="site-nav" id="site-nav" aria-label="Main navigation">{nav}</nav>
</div></header>
<main id="main" tabindex="-1">
{body}
</main>
<footer class="site-footer"><div class="shell footer-grid">
<div><a class="footer-logo" href="{route("", prefix)}"><img src="{prefix}images/brand/pairs-lab-horizontal.png" width="164" height="48" alt="{esc(LAB["short_name"])}"></a>
<p>{esc(LAB["name"])}<br><a href="{esc(aff["department_url"])}">{esc(aff["department"])}</a>, <a href="{esc(aff["institution_url"])}">{esc(aff["institution"])}</a></p></div>
<div><p class="footer-label">Visit</p><p>Room {esc(office["room"])}, {esc(office["building"])}<br>{esc(office["city"])}</p><a href="{esc(office["maps_url"])}">Google Maps {EXT}</a></div>
<div><p class="footer-label">Connect</p><p><a href="mailto:{esc(LAB["email"])}">{esc(LAB["email"])}</a><br><a href="{esc(LAB["github"])}">GitHub {EXT}</a><br><a href="{esc(LAB["youtube"])}">YouTube {EXT}</a><br><a href="{route("join", prefix)}">Join us {ARROW}</a></p></div>
</div><div class="shell footer-bottom">© {datetime.date.today().year} {esc(LAB["short_name"])}</div></footer>
</body>
</html>
'''
    target = ROOT / slug / "index.html" if slug else ROOT / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(doc, encoding="utf-8")


# ---------- pages ----------

def news_items(items, prefix):
    return "".join(f'<li class="news-item"><time datetime="{n["date"]}">{month(n["date"])}</time>'
                   f'<p>{relink(n["html"], prefix)}</p></li>' for n in items)


def hero_slider():
    """Home hero like a lab landing page: campus slide, then one video slide per research direction."""
    aff = LAB["affiliation"]
    total = 1 + len(LAB["directions"])
    campus = (f'<img class="hero-media" src="{esc(LAB["hero_image"])}" alt="" fetchpriority="high">'
              if (ROOT / LAB["hero_image"]).is_file() else "")
    slides = [f'<article class="hero-slide is-active" data-slide aria-roledescription="slide" aria-label="1 of {total}">{campus}'
              f'<div class="hero-content"><p class="kicker kicker-light">{esc(LAB["short_name"])} · {esc(aff["institution_short"])}</p>'
              f'<h1>{esc(LAB["name"])}</h1><p class="hero-lead">{esc(LAB["tagline"])}</p>'
              f'<div class="hero-actions"><a class="button" href="research/">Research</a><a class="button button-ghost" href="join/">Join the Lab</a></div></div></article>']
    for i, d in enumerate(LAB["directions"], 1):
        media = ""
        if d.get("video"):
            media = (f'<video class="hero-media" muted loop playsinline preload="none" poster="{esc(d.get("poster", ""))}" aria-hidden="true">'
                     f'<source src="{esc(d["video"])}" type="video/mp4"></video>')
        slides.append(f'<article class="hero-slide" data-slide aria-roledescription="slide" aria-label="{i + 1} of {total}">{media}'
                      f'<div class="hero-content"><p class="kicker kicker-light">Research direction 0{i}</p><h2>{esc(d["title"])}</h2>'
                      f'<p class="hero-lead">{esc(d.get("hero_text", d["summary"]))}</p>'
                      f'<div class="hero-actions"><a class="button" href="research/#{d["id"]}">Explore direction</a>'
                      f'<a class="button button-ghost" href="research/">Research overview</a></div></div></article>')
    dots = "".join(f'<button type="button" data-hero-dot aria-label="Show slide {i + 1}"></button>' for i in range(total))
    return (f'<section class="hero-slider" data-hero aria-roledescription="carousel" aria-label="{esc(LAB["short_name"])} highlights">'
            f'<div class="hero-slides">{"".join(slides)}</div>'
            f'<button class="hero-arrow hero-prev" type="button" data-hero-prev aria-label="Previous slide">‹</button>'
            f'<button class="hero-arrow hero-next" type="button" data-hero-next aria-label="Next slide">›</button>'
            f'<div class="hero-dots">{dots}</div></section>')


def card_media(d):
    """Home card picture: the compact research map when one exists, else the direction's result image."""
    card = f'images/directions/{d["id"]}-card.svg'
    if d.get("map") and (ROOT / card).is_file():
        alt = d["title"] + ": " + ", ".join(n["name"] for n in d["map"]["nodes"])
        return f'<div class="direction-media is-map"><img src="{fresh(card)}" alt="{esc(alt)}" width="720" height="450" loading="lazy" decoding="async"></div>'
    return f'<div class="direction-media"><img src="{esc(d["image"])}" alt="" decoding="async"></div>'


def home():
    aff = LAB["affiliation"]
    by_id = {p["id"]: p for p in PAPERS}
    directions = "".join(
        f'<a class="direction-card" href="research/#{d["id"]}">{card_media(d)}'
        f'<div class="direction-body"><span class="direction-num">0{i}</span><h3>{esc(d["title"])}</h3><p>{esc(d["summary"])}</p>'
        f'<span class="text-link">Explore direction {ARROW}</span></div></a>'
        for i, d in enumerate(LAB["directions"], 1))
    body = hero_slider() + f'''
<section class="section intro"><div class="shell">
<p class="intro-text">{esc(LAB["short_name"])} is based in the <a href="{esc(aff["department_url"])}">{esc(aff["department"])}</a> at the <a href="{esc(aff["institution_url"])}">{esc(aff["institution"])}</a>, Hanoi. We study how robots perceive, map and act in the real world: active and semantic SLAM, robust perception and autonomous navigation, robot learning and human–robot interaction, and agentic robotics and industrial vision.</p>
{overview_figure("")}</div></section>
<section class="section section-alt"><div class="shell">{section_head("Research directions", "research/", "Research overview")}<div class="direction-grid">{directions}</div></div></section>
<section class="section"><div class="shell two-col">
<div>{section_head("News", "news/", "All news")}<ul class="news-list">{news_items(NEWS[:5], "")}</ul></div>
<div>{section_head("Selected publications", "publications/", "All publications")}<div class="paper-list compact">{"".join(paper_card(by_id[i], "", compact=True) for i in LAB["selected_publications"])}</div></div>
</div></section>
<section class="cta"><div class="shell cta-inner"><div><h2>Join {esc(LAB["short_name"])}</h2><p>We welcome students and collaborators who want to build robots that work reliably in the real world.</p></div><a class="button button-light" href="join/">Open positions {ARROW}</a></div></section>'''
    render("", "Home", LAB["tagline"], body)


def map_alt(d):
    m = d["map"]
    return (f'{d["title"]} research overview. Core goal: {m["core"]}. Sub-areas: '
            + "; ".join(f'{n["name"]}: {n["desc"]}' for n in m["nodes"]) + ". Open questions: " + "; ".join(m["open"]) + ".")


def overview_alt():
    ov = LAB["overview"]
    steps = "; ".join(f'{i}. {d["title"]}: {ov["guides"][d["id"]]}' for i, d in enumerate(LAB["directions"], 1))
    return (f'Research overview of {LAB["short_name"]}: four directions around robot autonomy. {steps}. Each direction feeds the next: '
            + ", ".join(ov["flows"]) + ". Platforms: " + ", ".join(p["name"] for p in ov["platforms"])
            + ". Applications: " + ", ".join(ov["applications"]) + ".")


def svg_height(name):
    head = (ROOT / f"images/directions/{name}.svg").read_text(encoding="utf-8")[:300]
    return re.search(r'viewBox="0 0 \d+ (\d+)"', head).group(1)


def overview_figure(prefix):
    if not (ROOT / "images/directions/overview.svg").is_file():
        return ""
    return (f'<figure class="overview-map"><img src="{prefix}{fresh("images/directions/overview.svg")}" alt="{esc(overview_alt())}" width="1200" height="{svg_height("overview")}" loading="lazy" decoding="async">'
            f'<figcaption>How our four research directions fit together around robot autonomy: each one feeds the next, on our own robot platforms.</figcaption></figure>')


def topic_card(f, prefix):
    """One 'selected research' card: looping demo or figure, venue, title, two sentences, link."""
    p = next(x for x in PAPERS if x["id"] == f["paper"])
    video = f.get("video") or (p.get("video") if p.get("poster") else "")
    poster = f.get("poster") or p.get("poster", "")
    if video:
        src = video if video.startswith("http") else prefix + video
        poster_attr = ' poster="' + esc(prefix + poster) + '"' if poster else ""
        pic = (f'<video data-loop muted loop playsinline preload="none"{poster_attr} aria-hidden="true">'
               f'<source src="{esc(src)}" type="video/mp4"></video>')
    elif p.get("video"):
        pic = (f'<video data-loop muted loop playsinline preload="metadata" aria-hidden="true">'
               f'<source src="{esc(p["video"])}" type="video/mp4"></video>')
    elif p.get("image"):
        pic = f'<img src="{esc(prefix + fresh(p["image"]))}" alt="" loading="lazy" decoding="async">'
    else:
        pic = '<span class="topic-placeholder" aria-hidden="true"></span>'
    url = p["links"].get("website") or p["links"].get("paper") or p["links"].get("arxiv") or p["links"].get("code") or f'{prefix}publications/#{p["id"]}'
    return (f'<article class="topic-card"><div class="topic-media{" is-figure" if not video and not p.get("video") else ""}">{pic}'
            f'<span class="topic-label">{esc(f["label"])}</span></div><div class="topic-copy"><p class="topic-attribution">{esc(f["attribution"])}</p>'
            f'<h3>{esc(f["title"])}</h3><p>{esc(f["text"])}</p><a class="topic-link" href="{esc(url)}">Explore {esc(f["cta"])} {EXT}</a></div></article>')


def research():
    focus = LAB["focus"]
    choices = "".join(
        f'<a class="research-choice" href="#{d["id"]}"><video data-loop muted loop playsinline preload="none" poster="../{esc(d["poster"])}" aria-hidden="true">'
        f'<source src="../{esc(d["video"])}" type="video/mp4"></video><span class="choice-num">0{i}</span>'
        f'<span class="choice-title">{esc(d["title"])}</span><span class="choice-arrow" aria-hidden="true">↘</span></a>'
        for i, d in enumerate(LAB["directions"], 1))
    programs = ""
    for i, d in enumerate(LAB["directions"], 1):
        cards = "".join(topic_card(f, "../") for f in d.get("featured", []))
        programs += (f'<article class="research-program" id="{d["id"]}"><a class="back-to-grid" href="#research-directions">↑ All directions</a>'
                     f'<p class="program-kicker"><span>0{i}</span>{esc(d["kicker"])}</p><h2>{esc(d["title"])}</h2>'
                     f'<p class="program-copy">{esc(d["description"])}</p>'
                     + (f'<figure class="direction-map"><img src="../{fresh("images/directions/" + d["id"] + ".svg")}" alt="{esc(map_alt(d))}" width="1200" height="{svg_height(d["id"])}" loading="lazy" decoding="async">'
                        f'<figcaption>The core sub-areas of this direction, illustrated with results from our papers.</figcaption></figure>' if d.get("map") else "")
                     + f'<div class="work-heading"><h3>Featured projects and demos</h3>'
                     f'<p>Published work and papers under review are marked; each card links its project, paper or code.</p></div>'
                     f'<div class="topic-grid">{cards}</div>'
                     f'<a class="text-link" href="../publications/?topic={esc(d["topics"][0])}">All related publications {ARROW}</a></article>')
    paragraphs = "".join(f"<p>{esc(t)}</p>" for t in focus["paragraphs"])
    body = (f'<header class="research-hero"><div class="shell"><p class="kicker">{esc(LAB["short_name"])}</p><h1>Research</h1></div></header>'
            f'<section class="research-focus"><div class="shell focus-grid"><div><p class="kicker">What drives us</p><h2>{esc(focus["title"])}</h2></div>'
            f'<div class="focus-copy">{paragraphs}</div></div><div class="shell">{overview_figure("../")}</div></section>'
            f'<nav class="research-choices" id="research-directions" aria-label="Research directions"><div class="shell">'
            f'<div class="choices-head"><p class="kicker">Research</p><button class="preview-toggle" type="button" data-preview-toggle hidden>Pause previews</button></div>'
            f'<div class="choice-grid">{choices}</div></div></nav>'
            f'<div class="shell">{programs}<section class="section notice"><h2>Connected research interests</h2><p>{esc(LAB["research_interests"])}</p>'
            f'<div class="chips"><a class="chip-link" href="../projects/">Projects {ARROW}</a><a class="chip-link" href="../publications/">Publications {ARROW}</a></div></section></div>')
    render("research", "Research", "Research directions of PAIRS Lab: active and semantic SLAM, robust perception and navigation, robot learning and human–robot interaction, agentic robotics and industrial vision.", body)


def publications():
    years = sorted({p["year"] for p in PAPERS}, reverse=True)
    topics = ["SLAM", "Robot learning", "Human–robot interaction", "Navigation", "Computer vision"]
    buttons = "".join(f'<button type="button" class="topic" data-topic="{esc(t)}" aria-pressed="false">{esc(t)}</button>' for t in topics)
    toolbar = (f'<form class="filters" id="paper-filters" role="search" hidden>'
               f'<label class="sr-only" for="paper-q">Search publications</label><input id="paper-q" type="search" placeholder="Search title, author, venue or topic…" autocomplete="off">'
               f'<label class="sr-only" for="paper-type">Type</label><select id="paper-type"><option value="all">All types</option><option value="journal">Journal articles</option><option value="conference">Conference papers</option><option value="review">Under review &amp; preprints</option></select>'
               f'<label class="sr-only" for="paper-year">Year</label><select id="paper-year"><option value="all">All years</option>{"".join(f"<option>{y}</option>" for y in years)}</select>'
               f'<div class="topic-row">{buttons}</div></form>'
               f'<p class="results" id="paper-count" role="status">{len(PAPERS)} publications</p>')
    groups = "".join(f'<section class="year-group" data-year-group="{y}"><h2 class="year">{y}</h2><div class="paper-list">'
                     + "".join(paper_card(p, "../") for p in by_type_then_order(p for p in PAPERS if p["year"] == y)) + "</div></section>" for y in years)
    body = (page_head("Publications", "Journal articles, conference papers and preprints by lab members. Lab members are shown in bold; each entry links its paper, project page and code.", "Research output")
            + f'<div class="shell section">{toolbar}{groups}<p class="empty" id="paper-empty" hidden>No matching publications. Try another keyword.</p></div>')
    render("publications", "Publications", "Publications of PAIRS Lab in SLAM, robot learning, navigation and robot vision.", body)


def project_card(p):
    """One project: funded projects show program, call and participation; lab projects show their tools."""
    kicker = " · ".join(x for x in [p.get("program"), p.get("period"), p.get("status")] if x)
    meta = "".join(f"<dt>{label}</dt><dd>{esc(p[key])}</dd>" for key, label in (("grant", "Call"), ("role", "Participation")) if p.get(key))
    return (f'<article class="card funded" id="{esc(p.get("id", slugify(p["title"])))}"><p class="kicker">{esc(kicker)}</p><h3>{esc(p["title"])}</h3><p>{esc(p["description"])}</p>'
            + (f'<dl class="meta-list">{meta}</dl>' if meta else "") + (f'<p class="muted">{esc(p["tools"])}</p>' if p.get("tools") else "") + "</article>")


def projects():
    P = LAB["projects"]
    ongoing = (f'<div class="card-grid">{"".join(project_card(p) for p in P["ongoing"])}</div>' if P["ongoing"] else
               '<div class="notice"><h3>Coming soon</h3><p>Current projects will be listed here when they are announced.</p></div>')
    body = (page_head("Projects", "Ongoing and past projects of the lab, including funded research.", "Projects")
            + f'<div class="shell"><section class="section" id="ongoing">{section_head("Ongoing projects", kicker="01 / Now")}{ongoing}</section>'
            f'<section class="section" id="past">{section_head("Past projects", kicker="02 / Completed")}<div class="card-grid">{"".join(project_card(p) for p in P["past"])}</div></section></div>')
    render("projects", "Projects", "Ongoing and past projects of PAIRS Lab.", body)


def datasets():
    groups = {}
    for r in LAB.get("robots", []):
        groups.setdefault(r.get("group", "Robots"), []).append(
            {**r, "role": r["category"], "slug": slugify(r["name"]), "bio_text": r["description"], "group": r.get("group", "Robots")})
    machines = ""
    for name, items in groups.items():
        machines += (f'<div class="hw-group"><h3 class="hw-group-title">{esc(name)} <span>{len(items)}</span></h3>'
                     f'{carousel(items, LAB["short_name"] + " " + name.lower(), "../", profiles=False)}</div>')
    if not machines:
        machines = '<p class="notice">Our robot platforms, sensors and computing infrastructure will be listed here soon.</p>'
    body = (page_head("Datasets & Resources", "Research datasets, robot platforms and computing hardware of the lab.", "Open research")
            + f'<div class="shell"><section class="section" id="datasets">{section_head("Datasets", kicker="01 / Data")}'
            f'<div class="notice"><p class="kicker">Dataset releases</p><h3>Coming soon</h3>'
            f'<p>Dataset download links will be listed here when available. For resources associated with an existing paper, see its project page and repository.</p>'
            f'<div class="chips"><a class="chip-link" href="mailto:{esc(LAB["email"])}?subject=Research%20dataset%20inquiry">Ask about research data {EXT}</a>'
            f'<a class="chip-link" href="../publications/">Code is linked from each publication {ARROW}</a><a class="chip-link" href="{esc(LAB["github"])}">GitHub organization {EXT}</a></div></div>'
            f'<p class="muted">Please consult each repository for its license, usage instructions and citation information.</p></section>'
            f'<section class="section resources-panel" id="resources">{section_head("Robot Platforms & Computing", kicker="02 / Hardware")}{machines}</section></div>')
    render("datasets", "Datasets & Resources", "Research datasets, robot platforms and infrastructure of PAIRS Lab.", body)


def life():
    """Lab Life: one section per event (data/life.json), newest first, with a photo gallery."""
    events = ""
    for e in LIFE:
        n = len(e["photos"])
        cards = "".join(f'<button class="carousel-card" type="button" data-card aria-label="Show photo {i + 1} of {n}">'
                        f'<span class="carousel-photo"><img src="../{esc(fresh(ph["src"]))}" alt="{esc(ph["alt"])}" width="1600" height="1200" loading="{"eager" if i < 6 else "lazy"}" decoding="async"></span></button>'
                        for i, ph in enumerate(e["photos"]))
        dots = "".join(f'<button type="button" data-dot aria-label="Show photo {i + 1} of {n}"></button>' for i in range(n))
        details = "".join(f'<p class="carousel-detail life-caption" data-detail>{esc(ph["alt"])}</p>' for ph in e["photos"])
        ring = (f'<div class="carousel carousel-wide" data-carousel tabindex="0" aria-roledescription="carousel" aria-label="{esc(e["title"])} photos">'
                f'<div class="carousel-stage" data-stage>{cards}</div>'
                f'<button class="carousel-arrow carousel-prev" type="button" data-prev aria-label="Previous photo">◀</button>'
                f'<button class="carousel-arrow carousel-next" type="button" data-next aria-label="Next photo">▶</button>'
                f'<div class="carousel-dots" data-dots>{dots}</div></div>'
                f'<div class="carousel-details" aria-live="polite">{details}</div>')
        events += (f'<section class="life-event" id="{esc(e["id"])}"><div class="life-head"><p class="kicker">{esc(e["date"])} · {esc(e["place"])}</p>'
                   f'<h2>{esc(e["title"])}</h2><p>{esc(e["text"])}</p></div>{ring}</section>')
    body = (page_head("Lab Life", "Dinners, celebrations and trips: the people of PAIRS Lab outside the lab.", "Beyond research")
            + f'<div class="shell section">{events}</div>')
    render("life", "Lab Life", "Gatherings and events of PAIRS Lab.", body)


def news():
    years = sorted({n["date"][:4] for n in NEWS}, reverse=True)
    body = page_head("News", "Papers, awards and other updates from the lab.", "Lab updates") + '<div class="shell section">' + "".join(
        f'<section class="year-group"><h2 class="year">{y}</h2><ul class="news-list">{news_items([n for n in NEWS if n["date"].startswith(y)], "../")}</ul></section>' for y in years) + "</div>"
    render("news", "News", "News from PAIRS Lab.", body)


# ---------- people ----------

def member_records():
    """Flatten people groups and add slug, role, papers and a factual default bio."""
    records = []
    for g in LAB["people"]:
        for m in g["members"]:
            keys = {name_key(n) for n in [m["name"], *m.get("aliases", [])]}
            papers = [p for p in PAPERS if keys & {name_key(a) for a in p["authors"]}]
            topics = [t for t, _ in Counter(t for p in papers for t in p["topics"]).most_common(3)]
            if m.get("bio"):
                bio = m["bio"]
            elif g["group"] == "Alumni":
                bio = f'{m["name"]} is a former member of {LAB["short_name"]}' + (f', now at {m["note"]}.' if m.get("note") else ".")
            else:
                bio = f'{m["name"]} is {"an" if g["role"][0] in "AEIOU" else "a"} {g["role"].lower()} at {LAB["short_name"]}, {LAB["affiliation"]["institution_short"]}.'
            if papers and not m.get("bio"):
                words = [" ".join(w if w[:2].isupper() else w.lower() for w in t.split()) for t in topics]
                listed = words[0] if len(words) == 1 else ", ".join(words[:-1]) + " and " + words[-1]
                bio += f' {len(papers)} lab publication{"s" if len(papers) > 1 else ""} on {listed}.'
            records.append({**m, "group": g["group"], "role": m.get("role") or g["role"], "slug": slugify(m["name"]), "papers": papers,
                            "bio_text": bio, "image": m.get("image") or "images/people/default.svg"})
    return records


def carousel(records, label, prefix, profiles=True):
    cards = "".join(f'<button class="carousel-card" type="button" data-card aria-label="Show {esc(r["name"])}">'
                    f'<span class="carousel-photo{" is-contain" if r.get("fit") == "contain" else ""}"><img src="{prefix}{esc(r["image"])}" alt="" loading="{"eager" if i < 6 else "lazy"}" decoding="async"></span>'
                    f'<span class="carousel-name">{esc(r["name"])}</span></button>' for i, r in enumerate(records))
    dots = "".join(f'<button type="button" data-dot aria-label="Show {esc(r["name"])}"></button>' for r in records)
    details = ""
    for r in records:
        if r["group"] == "Staff":
            heading = f'<h2 class="carousel-lead-title"><span>{esc(r["role"])}:</span> {esc(r["name"])}</h2>'
        else:
            heading = f'<p class="carousel-role">{esc(r["role"])}</p><h2>{esc(r["name"])}</h2>'
        more = f'<a class="profile-link" href="{esc(r["slug"])}/">View profile {EXT}</a>' if profiles else (
            f'<a class="profile-link" href="{esc(r["url"])}">Learn more {EXT}</a>' if r.get("url") else "")
        details += (f'<article class="carousel-detail" id="{esc(r["slug"])}" data-detail>{heading}<p class="carousel-bio">{esc(r["bio_text"])}</p>'
                    f'{more}</article>')
    return (f'<div class="carousel" data-carousel tabindex="0" aria-roledescription="carousel" aria-label="{esc(label)}">'
            f'<div class="carousel-stage" data-stage>{cards}</div>'
            f'<button class="carousel-arrow carousel-prev" type="button" data-prev aria-label="Previous member">◀</button>'
            f'<button class="carousel-arrow carousel-next" type="button" data-next aria-label="Next member">▶</button>'
            f'<div class="carousel-dots" data-dots>{dots}</div></div>'
            f'<div class="carousel-details" aria-live="polite">{details}</div>')


def people():
    records = member_records()
    current = [r for r in records if r["group"] != "Alumni"]
    alumni = [r for r in records if r["group"] == "Alumni"]
    search = ('<div class="member-search" data-member-search hidden><label for="member-search">Find a member</label>'
              '<input id="member-search" type="search" role="combobox" autocomplete="off" spellcheck="false" placeholder="Search by name…" '
              'aria-autocomplete="list" aria-expanded="false" aria-controls="member-search-results">'
              '<div class="member-search-popup" hidden><div id="member-search-results" role="listbox" aria-label="Members"></div>'
              '<p class="member-search-empty" role="status" hidden>No matching members. Try another name.</p></div></div>')
    rings, n = "", 0
    for g in LAB["people"]:
        members = [r for r in current if r["group"] == g["group"]]
        if not members:
            continue  # e.g. PhD Students appears once it has members
        n += 1
        rings += (f'<section class="member-group" id="group-{slugify(g["group"])}"><div class="panel-heading">'
                  f'<p class="kicker">0{n} / {esc(g["group"])}</p><h2>{esc(g["group"])}</h2></div>'
                  f'{carousel(members, LAB["short_name"] + " " + g["group"].lower(), "../")}</section>')
    awards = LAB["student_awards"]
    body = f'''<section class="members-page"><div class="shell">
<header class="members-intro"><h1>Members</h1><p>Meet the staff, students and alumni of {esc(LAB["short_name"])}.</p></header>
<div class="member-tabs" role="tablist" aria-label="Choose directory">
<button class="is-active" type="button" role="tab" aria-selected="true" aria-controls="panel-people" data-tab="people">People</button>
<button type="button" role="tab" aria-selected="false" aria-controls="panel-alumni" data-tab="alumni">Alumni</button>
</div>
<section class="member-panel" id="panel-people" role="tabpanel" data-panel="people">
{search}
{rings}
</section>
<section class="member-panel" id="panel-alumni" role="tabpanel" data-panel="alumni">
<div class="panel-heading"><p class="kicker">Former members</p><h2>Alumni</h2></div>
{carousel(alumni, LAB["short_name"] + " alumni", "../")}
</section>
<section class="notice"><h2>Student awards</h2><p>{esc(awards["title"])}:</p><ul>{"".join(f"<li>{esc(x)}</li>" for x in awards["items"])}</ul><a class="text-link" href="../join/">Join the lab {ARROW}</a></section>
</div></section>'''
    render("people", "Members", "Faculty, students and alumni of PAIRS Lab.", body)
    for r in records:
        profile(r)


PROFILE_LINKS = [("website", "Personal website"), ("scholar", "Google Scholar"), ("orcid", "ORCID"), ("github", "GitHub")]


def profile(r):
    prefix = "../../"
    if r.get("links"):
        link = "".join(f'<a class="chip-link" href="{esc(r["links"][k])}">{label} {EXT}</a>' for k, label in PROFILE_LINKS if r["links"].get(k))
    else:
        link = f'<a class="chip-link" href="{esc(r["url"])}">{"Personal website" if "scholar.google" not in r["url"] else "Google Scholar"} {EXT}</a>' if r.get("url") else ""
    topics = "".join(f'<span class="tag">{esc(t)}</span>' for t, _ in Counter(t for p in r["papers"] for t in p["topics"]).most_common(6))
    papers = "".join(paper_card(p, prefix, compact=True) for p in sorted(r["papers"], key=lambda p: (-p["year"], TYPE_ORDER[p["type"]])))
    pubs = (f'<section class="section-tight">{section_head("Lab publications")}<div class="paper-list compact">{papers}</div></section>' if papers else "")
    body = (f'<section class="profile"><div class="shell"><a class="back-link" href="../">← All members</a><div class="profile-grid">'
            f'<img class="profile-photo" src="{prefix}{esc(r["image"])}" alt="{esc(r["name"])}" width="280" height="280">'
            f'<div><p class="kicker">{esc(r["role"])}</p><h1>{esc(r["name"])}</h1>' + (f'<p class="muted">{esc(r["note"])}</p>' if r.get("note") else "")
            + f'<p class="profile-bio">{esc(r["bio_text"])}</p><div class="tags">{topics}</div><div class="chips profile-links">{link}</div></div></div>{pubs}</div></section>')
    render(f'people/{r["slug"]}', r["name"], r["bio_text"], body)


def join():
    office = LAB["office"]
    aff = LAB["affiliation"]
    cards = "".join(f'<article class="position"><span class="direction-num">0{i}</span><h3>{esc(p["title"])}</h3><p>{esc(p["text"])}</p><p class="tag">{esc(p["tag"])}</p></article>'
                    for i, p in enumerate(LAB["positions"], 1))
    body = (page_head(f'Join {LAB["short_name"]}', "Information for prospective students, research visitors and collaborators.", "Work with us")
            + f'<div class="shell"><section class="section notice"><p class="kicker">Position announcements</p><h2>Future opportunities</h2>'
            f'<p>Specific positions, funding details and application deadlines will be posted here when announced.</p></section>'
            f'<section class="section">{section_head("Who can join")}<div class="position-grid">{cards}</div></section>'
            f'<section class="section two-col"><div><h2>Research topics</h2><ul class="topic-list">{"".join(f"<li>{esc(t)}</li>" for t in LAB["join_topics"])}</ul></div>'
            f'<div><h2>In your inquiry</h2><p>A brief introduction, your research interests, and links to relevant projects or publications will help start the discussion. Please write in English.</p>'
            f'<a class="button" href="mailto:{esc(LAB["email"])}?subject=PAIRS%20Lab%20inquiry">Email us {EXT}</a></div></section>'
            f'<section class="section two-col" id="contact"><div><h2>Contact</h2><p><a href="mailto:{esc(LAB["email"])}">{esc(LAB["email"])}</a></p>'
            f'<address>Room {esc(office["room"])}, {esc(office["building"])}<br>{esc(aff["institution"])}<br>{esc(office["city"])}</address>'
            f'<p class="chips"><a class="chip-link" href="{esc(office["maps_url"])}">Google Maps {EXT}</a><a class="chip-link" href="{esc(aff["institution_url"])}">{esc(aff["institution_short"])} admissions &amp; info {EXT}</a></p></div>'
            f'<iframe class="map" title="Map of {esc(aff["institution_short"])}" src="{esc(office["embed_url"])}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></section></div>')
    render("join", "Join Us", "Open positions and research inquiries at PAIRS Lab.", body)


def main():
    if not (ROOT / LAB["hero_image"]).is_file():
        print(f"note: {LAB['hero_image']} not found; the home hero uses a plain color.")
    profiles = ROOT / "people"
    if profiles.is_dir():  # drop profile pages of people who were removed from data/lab.json
        keep = {slugify(m["name"]) for g in LAB["people"] for m in g["members"]}
        for d in profiles.iterdir():
            if d.is_dir() and d.name not in keep:
                shutil.rmtree(d)
    make_direction_figures.main()
    for build in (home, research, publications, projects, datasets, news, life, people, join):
        build()
    print(f"Built {len(PAGES)} pages and {sum(len(g['members']) for g in LAB['people'])} member profiles from {len(PAPERS)} publications and {len(NEWS)} news items.")


if __name__ == "__main__":
    main()
