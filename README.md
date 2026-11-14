# PAIRS Lab website

Website of the Perception, Autonomy, and Intelligent Robotics Systems Lab (PAIRS Lab),
Robotics Department, VNU University of Engineering and Technology.

Static HTML, built from JSON with the Python 3 standard library. No other dependencies
(only `scripts/make_mascots.py`, which redraws the mascot art, needs Pillow and NumPy).

## Edit and build

| To change | Edit |
|---|---|
| Lab name, research directions, people, projects, positions, robots, mascots | `data/lab.json` |
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
- **External links in the top bar:** `NAV_LINKS` in `scripts/build.py` (now the Paper Explorer). With ten links and
  the mascot and theme buttons the bar fits on one row from 1220 px; below that it becomes the menu button (`assets/site.css`).
- **Lab mascots:** `mascots` in `data/lab.json` (`id`, `name`, `vi`, `kicker`, `bio`, `tags`, `hello`, `alt`, `moods`,
  `food`, `food_icon`, `ride`, `ride_label`) fill the Mascots tab of the Members page (`people/#mascots`) and the crane
  and buffalo that walk, run, sit and wave along the bottom of every page (`assets/mascots.js`). They are on by default
  on screens 720 px and wider, off with reduced motion; the crane button in the top bar switches them and the choice is
  saved per browser. Click a mascot for its care card: fullness, energy and happiness set its mood (one of the six mood
  poses), and Feed, Pet, Nap, Ride (drone or rover) and Team up change it; visiting a new page makes them curious.
  The minigame `mascot_game` (Landmark Relay) runs in a dialog: the crane drops landmarks from a drone, the buffalo
  catches them. Care and the best score are kept in the browser's localStorage (`mascot-care-v1`).
  New art: put the original PNGs in `images/mascots/` (file names in `scripts/make_mascots.py`), then run
  `python3 scripts/make_mascots.py`. It removes the background-removal glow and writes `<id>-sprite.webp`
  (4 × 4 frames; rows walk, run, sit, wave), `<id>.webp`, `<id>-moods.webp` and `mascot-face.webp`.
- **Research tools:** entries of `tools` in `data/lab.json` (`name`, `kicker`, `text`, `url`, `label`) appear on
  `datasets/#tools`, the Resources page.
- **Publication media:** `image`, or `video` plus `poster`, paths relative to the site root.
- **Research figures:** each direction's `map` in `data/lab.json` (hub, core goal, two `columns`, `nodes` with
  `name`, `desc`, `thumb`, `papers`, `col`, `short`, and `open` questions) and the lab-wide `overview`
  (guiding questions, flows between directions, platforms, applications). Thumbnails live in
  `images/directions/thumbs/`. The build redraws `images/directions/*.svg` via `scripts/make_direction_figures.py`:
  `<id>.svg` (full map, Research page), `<id>-card.svg` (compact version, home cards) and `overview.svg`.

## Deploy

GitHub Pages: Settings → Pages → Deploy from a branch → `main`, folder `/ (root)`.
`.nojekyll` makes Pages serve the files as they are.
