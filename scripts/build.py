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

ROOT = Path(__file__).resolve().parents[1]
LAB = json.loads((ROOT / "data/lab.json").read_text(encoding="utf-8"))
PAPERS = json.loads((ROOT / "data/publications.json").read_text(encoding="utf-8"))
NEWS = sorted(json.loads((ROOT / "data/news.json").read_text(encoding="utf-8")), key=lambda n: n["date"], reverse=True)
PAGES = [("", "Home"), ("research", "Research"), ("publications", "Publications"), ("projects", "Projects"),
         ("datasets", "Datasets"), ("news", "News"), ("people", "Member"), ("join", "Join Us")]
TYPE_LABEL = {"journal": "Journal", "conference": "Conference", "preprint": "Preprint"}
TYPE_ORDER = {"journal": 0, "conference": 1, "preprint": 2}
HIDDEN_STATUS = {"", "accepted", "published", "preprint"}
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


MEMBERS = {name_key(m["name"]) for g in LAB["people"] for m in g["members"]}


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

def citation(p):
    kind, field = {"journal": ("article", "journal"), "conference": ("inproceedings", "booktitle"),
                   "preprint": ("unpublished", "note")}[p["type"]]
    return (f'@{kind}{{{p["id"]},\n  title = {{{p["title"]}}},\n  author = {{{" and ".join(p["authors"])}}},\n'
            f'  {field} = {{{p["venue"]}}},\n  year = {{{p["year"]}}}\n}}')


def links(p):
    labels = {"website": "Project", "paper": "Paper", "code": "Code"}
    return "".join(f'<a class="chip-link" href="{esc(u)}">{labels.get(k, k.title())} {EXT}</a>'
                   for k, u in p["links"].items() if u)


def media(p, prefix):
    if p.get("image"):
        return f'<img src="{esc(prefix + p["image"])}" alt="" loading="lazy" decoding="async">'
    if p.get("video"):
        src = p["video"] if p["video"].startswith("http") else prefix + p["video"]
        poster = f' poster="{esc(prefix + p["poster"])}" preload="none"' if p.get("poster") else ' preload="metadata"'
        return (f'<video controls muted playsinline{poster} aria-label="Demo video: {esc(p["title"])}">'
                f'<source src="{esc(src)}" type="video/mp4"></video>')
    return ""


def authors(p):
    return ", ".join(f"<strong>{esc(a)}</strong>" if name_key(a) in MEMBERS else esc(a) for a in p["authors"])


def paper_card(p, prefix, compact=False):
    title = esc(p["title"])
    if p["links"].get("website"):
        title = f'<a href="{esc(p["links"]["website"])}">{title}</a>'
    status = f' <span class="status">{esc(p["status"])}</span>' if p.get("status", "") not in HIDDEN_STATUS else ""
    extra = ""
    if not compact:
        if p.get("abstract"):
            extra += f'<details><summary>Abstract</summary><p>{esc(p["abstract"])}</p></details>'
        extra += f'<details><summary>BibTeX</summary><pre><code>{esc(citation(p))}</code></pre></details>'
    pic = media(p, prefix)
    search = esc(" ".join([p["title"], *p["authors"], p["venue"], str(p["year"]), *p["topics"]]).lower())
    return (f'<article class="paper{"" if pic else " no-media"}" id="{esc(p["id"])}" data-type="{p["type"]}" '
            f'data-year="{p["year"]}" data-topics="{esc("|".join(p["topics"]))}" data-search="{search}">'
            + (f'<div class="paper-media">{pic}</div>' if pic else "")
            + f'<div class="paper-body"><p class="paper-meta"><span class="badge badge-{p["type"]}">{TYPE_LABEL[p["type"]]}</span>'
            f'{esc(p["venue"])} · {p["year"]}{status}</p><h3>{title}</h3><p class="authors">{authors(p)}</p>'
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
<div><p class="footer-label">Connect</p><p><a href="mailto:{esc(LAB["email"])}">{esc(LAB["email"])}</a><br><a href="{esc(LAB["github"])}">GitHub {EXT}</a><br><a href="{route("join", prefix)}">Join us {ARROW}</a></p></div>
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


def home():
    aff = LAB["affiliation"]
    hero_img = f'<img class="hero-bg" src="{esc(LAB["hero_image"])}" alt="" fetchpriority="high">' if (ROOT / LAB["hero_image"]).is_file() else ""
    by_id = {p["id"]: p for p in PAPERS}
    count = lambda t: sum(p["type"] == t for p in PAPERS)
    current = sum(len(g["members"]) for g in LAB["people"] if g["group"] != "Alumni")
    directions = "".join(
        f'<a class="direction-card" href="research/#{d["id"]}"><div class="direction-media"><img src="{esc(d["image"])}" alt="" decoding="async"></div>'
        f'<div class="direction-body"><span class="direction-num">0{i}</span><h3>{esc(d["title"])}</h3><p>{esc(d["summary"])}</p>'
        f'<span class="text-link">Explore direction {ARROW}</span></div></a>'
        for i, d in enumerate(LAB["directions"], 1))
    body = f'''<section class="hero">{hero_img}<div class="shell hero-inner">
<p class="kicker kicker-light">{esc(LAB["short_name"])} · {esc(aff["institution_short"])}</p>
<h1>{esc(LAB["name"])}</h1>
<p class="hero-lead">{esc(LAB["tagline"])}</p>
<div class="hero-actions"><a class="button" href="research/">Our research</a><a class="button button-ghost" href="join/">Join the lab</a></div>
</div></section>
<section class="section intro"><div class="shell intro-grid">
<p class="intro-text">{esc(LAB["short_name"])} is based in the <a href="{esc(aff["department_url"])}">{esc(aff["department"])}</a> at the <a href="{esc(aff["institution_url"])}">{esc(aff["institution"])}</a>, Hanoi. We study how robots perceive, map and act in the real world: active and semantic SLAM, robust perception and autonomous navigation, robot learning and human–robot interaction, and agentic robotics and industrial vision.</p>
<dl class="stats"><div><dt>{count("journal")}</dt><dd>journal articles</dd></div><div><dt>{count("conference")}</dt><dd>conference papers</dd></div><div><dt>{current}</dt><dd>current members</dd></div></dl>
</div></section>
<section class="section section-alt"><div class="shell">{section_head("Research directions", "research/", "Research overview")}<div class="direction-grid">{directions}</div></div></section>
<section class="section"><div class="shell two-col">
<div>{section_head("News", "news/", "All news")}<ul class="news-list">{news_items(NEWS[:5], "")}</ul></div>
<div>{section_head("Selected publications", "publications/", "All publications")}<div class="paper-list compact">{"".join(paper_card(by_id[i], "", compact=True) for i in LAB["selected_publications"])}</div></div>
</div></section>
<section class="cta"><div class="shell cta-inner"><div><h2>Join {esc(LAB["short_name"])}</h2><p>We welcome students and collaborators who want to build robots that work reliably in the real world.</p></div><a class="button button-light" href="join/">Open positions {ARROW}</a></div></section>'''
    render("", "Home", LAB["tagline"], body)


def research():
    blocks = ""
    for i, d in enumerate(LAB["directions"], 1):
        related = [p for p in sorted(PAPERS, key=lambda p: (-p["year"], TYPE_ORDER[p["type"]])) if set(p["topics"]) & set(d["topics"])]
        work = "".join(f'<li><a href="../publications/#{esc(p["id"])}">{esc(p["title"])}</a><span>{esc(p["venue"])} · {p["year"]}</span></li>' for p in related[:6])
        tags = "".join(f'<span class="tag">{esc(t)}</span>' for t in d.get("tags", d["topics"]))
        blocks += (f'<section class="direction" id="{d["id"]}"><div class="direction-text"><span class="direction-num">0{i}</span>'
                   f'<h2>{esc(d["title"])}</h2><p>{esc(d["description"])}</p><div class="tags">{tags}</div>'
                   f'<h3>Selected work</h3><ul class="work-list">{work}</ul>'
                   f'<a class="text-link" href="../publications/?topic={esc(d["topics"][0])}">All related publications {ARROW}</a></div>'
                   f'<div class="direction-figure"><img src="../{esc(d["image"])}" alt="" decoding="async"></div></section>')
    body = (page_head("Research", "Perception, representation and learning for robots that operate in the real world.", "Research directions")
            + f'<div class="shell">{blocks}<section class="section notice"><h2>Connected research interests</h2><p>{esc(LAB["research_interests"])}</p>'
            f'<div class="chips"><a class="chip-link" href="../projects/">Projects {ARROW}</a><a class="chip-link" href="../publications/">Publications {ARROW}</a></div></section></div>')
    render("research", "Research", "Research directions of PAIRS Lab: active and semantic SLAM, robust perception and navigation, robot learning and human–robot interaction, agentic robotics and industrial vision.", body)


def publications():
    years = sorted({p["year"] for p in PAPERS}, reverse=True)
    topics = ["SLAM", "Robot learning", "Human–robot interaction", "Navigation", "Computer vision"]
    buttons = "".join(f'<button type="button" class="topic" data-topic="{esc(t)}" aria-pressed="false">{esc(t)}</button>' for t in topics)
    toolbar = (f'<form class="filters" id="paper-filters" role="search" hidden>'
               f'<label class="sr-only" for="paper-q">Search publications</label><input id="paper-q" type="search" placeholder="Search title, author, venue or topic…" autocomplete="off">'
               f'<label class="sr-only" for="paper-type">Type</label><select id="paper-type"><option value="all">All types</option><option value="journal">Journal articles</option><option value="conference">Conference papers</option><option value="preprint">Preprints</option></select>'
               f'<label class="sr-only" for="paper-year">Year</label><select id="paper-year"><option value="all">All years</option>{"".join(f"<option>{y}</option>" for y in years)}</select>'
               f'<div class="topic-row">{buttons}</div></form>'
               f'<p class="results" id="paper-count" role="status">{len(PAPERS)} publications</p>')
    groups = "".join(f'<section class="year-group" data-year-group="{y}"><h2 class="year">{y}</h2><div class="paper-list">'
                     + "".join(paper_card(p, "../") for p in by_type_then_order(p for p in PAPERS if p["year"] == y)) + "</div></section>" for y in years)
    body = (page_head("Publications", "Journal articles, conference papers and preprints by lab members. Lab members are shown in bold; each entry links its paper, project page and code.", "Research output")
            + f'<div class="shell section">{toolbar}{groups}<p class="empty" id="paper-empty" hidden>No matching publications. Try another keyword.</p></div>')
    render("publications", "Publications", "Publications of PAIRS Lab in SLAM, robot learning, navigation and robot vision.", body)


def projects():
    funded = "".join(f'<article class="card funded"><p class="kicker">{esc(p["program"])} · {esc(p["status"])}</p><h3>{esc(p["title"])}</h3><p>{esc(p["description"])}</p>'
                     f'<dl class="meta-list"><dt>Call</dt><dd>{esc(p["grant"])}</dd><dt>Participation</dt><dd>{esc(p["role"])}</dd><dt>Period</dt><dd>{esc(p["period"])}</dd></dl></article>'
                     for p in LAB["funded_projects"])
    research_projects = "".join(f'<article class="timeline-item" id="{esc(p["id"])}"><p class="timeline-date">{esc(p["period"])}</p><div><h3>{esc(p["title"])}</h3>'
                                f'<p>{esc(p["description"])}</p><p class="muted">{esc(p["tools"])}</p></div></article>' for p in LAB["research_projects"])
    body = (page_head("Projects", "Funded projects and long-running research projects of the lab.", "Projects")
            + f'<div class="shell"><section class="section">{section_head("Funded projects")}<div class="card-grid">{funded}</div></section>'
            f'<section class="section">{section_head("Research projects")}<div class="timeline">{research_projects}</div></section></div>')
    render("projects", "Projects", "Funded projects and research projects of PAIRS Lab.", body)


def datasets():
    body = (page_head("Datasets", "Research datasets released by the lab.", "Open research")
            + f'<div class="shell"><section class="section notice" id="datasets"><p class="kicker">Dataset releases</p><h2>Coming soon</h2>'
            f'<p>Dataset download links will be listed here when available. For resources associated with an existing paper, see its project page and repository.</p>'
            f'<div class="chips"><a class="chip-link" href="mailto:{esc(LAB["email"])}?subject=Research%20dataset%20inquiry">Ask about research data {EXT}</a>'
            f'<a class="chip-link" href="../publications/">Code is linked from each publication {ARROW}</a><a class="chip-link" href="{esc(LAB["github"])}">GitHub organization {EXT}</a></div></section>'
            f'<p class="muted section-tight">Please consult each repository for its license, usage instructions and citation information.</p></div>')
    render("datasets", "Datasets", "Research datasets from PAIRS Lab.", body)


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
            papers = [p for p in PAPERS if name_key(m["name"]) in {name_key(a) for a in p["authors"]}]
            topics = [t for t, _ in Counter(t for p in papers for t in p["topics"]).most_common(3)]
            if m.get("bio"):
                bio = m["bio"]
            elif g["group"] == "Alumni":
                bio = f'{m["name"]} is a former member of {LAB["short_name"]}' + (f', now at {m["note"]}.' if m.get("note") else ".")
            else:
                bio = f'{m["name"]} is {"an" if g["role"][0] in "AEIOU" else "a"} {g["role"].lower()} at {LAB["short_name"]}, {LAB["affiliation"]["institution_short"]}.'
            if papers and not m.get("bio"):
                words = [t if t[:2].isupper() else t.lower() for t in topics]
                listed = words[0] if len(words) == 1 else ", ".join(words[:-1]) + " and " + words[-1]
                bio += f' {len(papers)} lab publication{"s" if len(papers) > 1 else ""} on {listed}.'
            records.append({**m, "group": g["group"], "role": g["role"], "slug": slugify(m["name"]), "papers": papers,
                            "bio_text": bio, "image": m.get("image") or "images/people/default.svg"})
    return records


def carousel(records, label, prefix, profiles=True):
    cards = "".join(f'<button class="carousel-card" type="button" data-card aria-label="Show {esc(r["name"])}">'
                    f'<span class="carousel-photo"><img src="{prefix}{esc(r["image"])}" alt="" loading="{"eager" if i < 6 else "lazy"}" decoding="async"></span>'
                    f'<span class="carousel-name">{esc(r["name"])}</span></button>' for i, r in enumerate(records))
    dots = "".join(f'<button type="button" data-dot aria-label="Show {esc(r["name"])}"></button>' for r in records)
    details = ""
    for r in records:
        if r["group"] == "Faculty":
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
    robots = [{**m, "group": "Robot", "role": m.get("category", "Platform"), "slug": slugify(m["name"]), "bio_text": m.get("description", ""),
               "image": m.get("image") or "images/people/default.svg"} for m in LAB.get("robots", [])]
    machines = (carousel(robots, LAB["short_name"] + " robots and research infrastructure", "../", profiles=False) if robots else
                '<p class="notice">Our robot platforms, sensors and computing infrastructure will be listed here soon.</p>')
    awards = LAB["student_awards"]
    body = f'''<section class="members-page"><div class="shell">
<header class="members-intro"><h1>Member</h1><p>Meet the faculty, students and alumni of {esc(LAB["short_name"])}.</p></header>
<div class="member-tabs" role="tablist" aria-label="Choose directory">
<button class="is-active" type="button" role="tab" aria-selected="true" aria-controls="panel-people" data-tab="people">People</button>
<button type="button" role="tab" aria-selected="false" aria-controls="panel-machines" data-tab="machines">Robots &amp; Infrastructure</button>
<button type="button" role="tab" aria-selected="false" aria-controls="panel-alumni" data-tab="alumni">Alumni</button>
</div>
<section class="member-panel" id="panel-people" role="tabpanel" data-panel="people">
<div class="panel-heading"><p class="kicker">01 / The team</p><h2>People</h2></div>
{search}
{carousel(current, LAB["short_name"] + " people", "../")}
</section>
<section class="member-panel" id="panel-machines" role="tabpanel" data-panel="machines">
<div class="panel-heading"><p class="kicker">02 / The platforms</p><h2>Robots &amp; Research Infrastructure</h2></div>
{machines}
</section>
<section class="member-panel" id="panel-alumni" role="tabpanel" data-panel="alumni">
<div class="panel-heading"><p class="kicker">03 / Alumni</p><h2>Alumni</h2></div>
{carousel(alumni, LAB["short_name"] + " alumni", "../")}
</section>
<section class="notice"><h2>Student awards</h2><p>{esc(awards["title"])}:</p><ul>{"".join(f"<li>{esc(x)}</li>" for x in awards["items"])}</ul><a class="text-link" href="../join/">Join the lab {ARROW}</a></section>
</div></section>'''
    render("people", "Member", "Faculty, students and alumni of PAIRS Lab.", body)
    for r in records:
        profile(r)


def profile(r):
    prefix = "../../"
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
    for build in (home, research, publications, projects, datasets, news, people, join):
        build()
    print(f"Built {len(PAGES)} pages and {len(MEMBERS)} member profiles from {len(PAPERS)} publications and {len(NEWS)} news items.")


if __name__ == "__main__":
    main()
