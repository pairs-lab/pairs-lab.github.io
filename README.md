# PAIRS Lab website

Website of the Perception, Autonomy, and Intelligent Robotics Systems Lab (PAIRS Lab),
Robotics Department, VNU University of Engineering and Technology.

Static HTML, built from JSON with the Python 3 standard library. No other dependencies.

## Edit and build

| To change | Edit |
|---|---|
| Lab name, research directions, people, projects, positions, robots | `data/lab.json` |
| Publications | `data/publications.json` |
| News | `data/news.json` |
| Look and behavior | `assets/site.css`, `assets/site.js` |
| Page layout | `scripts/build.py` |

```bash
python3 scripts/build.py          # rewrites index.html and */index.html
python3 -m http.server 8000       # preview at http://localhost:8000/
```

Commit the generated HTML together with the data change.

## Common tasks

- **Hero photo:** save it as `images/vnu-campus.jpg` (about 2000 px wide), then rebuild.
- **New member:** add an entry to the right group (Staff, PhD Students, Master Students, Undergraduate Students, Alumni) under `people` in `data/lab.json` with `name`, `image` (square photo in
  `images/people/`), optional `url`, `note` and `bio`. A profile page is created at `people/<name-slug>/`.
  Without `bio`, the page shows a short factual line and the member's lab publications.
- **Robots & infrastructure:** add entries to `robots` in `data/lab.json` with `name`, `category`,
  `description`, `image` and optional `url`. They appear on `datasets/#resources`.
- **Publication media:** `image`, or `video` plus `poster`, paths relative to the site root.
- **Research maps:** edit `map` (core goal, four sub-problem nodes, open questions) of each direction in
  `data/lab.json`; node thumbnails live in `images/directions/thumbs/`. The build redraws
  `images/directions/<id>.svg` (`scripts/make_direction_figures.py`).

## Deploy

GitHub Pages: Settings → Pages → Deploy from a branch → `main`, folder `/ (root)`.
`.nojekyll` makes Pages serve the files as they are.
