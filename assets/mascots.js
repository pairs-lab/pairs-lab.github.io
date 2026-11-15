// PAIRS Lab mascots: the crane and the buffalo (markup from scripts/build.py, data from "mascots" in data/lab.json).
// They walk, run, sit and wave along the bottom of the window. Fullness, energy and happiness (saved per browser) set
// their mood, shown with the six mood poses of <id>-moods.webp; feed, pet, nap, ride and team up change it.
// Landmark Relay is the minigame: the crane drops map landmarks from a drone and the buffalo catches them. No dependencies.
(() => {
  "use strict";
  // the mascots moved from a Members tab to their own page: send old links (people/#mascots, people/#mascot-carp) there
  const moved = location.hash.match(/^#mascots?(-[\w-]+)?$/), home = document.querySelector('.site-nav a[href$="mascots/"]');
  if (moved && home && /\/people\/$/.test(location.pathname)) { location.replace(home.href + (moved[1] ? "#mascot" + moved[1] : "")); return; }
  const yard = document.querySelector("[data-mascot-yard]");
  if (!yard) return;
  const toggle = document.querySelector("[data-mascot-toggle]");
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const get = (area, key) => { try { return window[area].getItem(key); } catch (e) { return null; } };
  const put = (area, key, value) => { try { window[area].setItem(key, value); } catch (e) { /* storage blocked: this visit only */ } };
  const width = () => document.documentElement.clientWidth || window.innerWidth;
  const now = () => performance.now();

  // sprite rows of <id>-sprite.webp: [frame, ms] steps and speed in body widths per second
  const MOVES = {
    walk: { row: 0, steps: [[0, 140], [1, 140], [2, 140], [3, 140]], speed: 0.6 },
    run: { row: 1, steps: [[0, 85], [1, 85], [2, 85], [3, 85]], speed: 1.8 },
    sit: { row: 2, steps: [[0, 2200], [1, 110], [2, 160], [1, 110], [0, 1500], [3, 1300]], speed: 0 },
    wave: { row: 3, steps: [[0, 170], [1, 170], [2, 220], [1, 170], [0, 170], [3, 170]], speed: 0 },
    ride: { row: 2, steps: [[0, 2600], [1, 110], [2, 160], [1, 110]], speed: 1.2 },
  };
  const LAST = { walk: [3500, 8000], run: [1200, 2600], sit: [4000, 9000], wave: [2150, 2150], ride: [6000, 12000], pose: [1800, 3000], nap: [6000, 6000] };
  const POSES = ["hello", "curious", "surprised", "thinking", "calm", "joy"];  // cells of <id>-moods.webp
  const POSE_LINES = { hello: "Xin chào!", curious: "Ooh, what is this?", surprised: "Whoa!", thinking: "Hmm… let me think.", calm: "So calm… zzz", joy: "Yay!" };

  const movesFor = (el) => {  // the mascot's own frame timing ("steps" in data/lab.json) over the defaults above
    let steps = {};
    try { steps = JSON.parse(el.dataset.steps || "{}") || {}; } catch (e) { steps = {}; }
    return Object.fromEntries(Object.keys(MOVES).map((k) => [k, Object.assign({}, MOVES[k], Array.isArray(steps[k]) && steps[k].length ? { steps: steps[k] } : {})]));
  };
  const RIDES = { drone: ["🚁 Fly", "Up we go!", "Landed!"], rover: ["🚜 Drive", "Let's roll!", "Parked!"], auv: ["🌊 Dive", "Dive, dive!", "Surfaced!"] };
  const mascots = [...yard.querySelectorAll("[data-mascot]")].map((el) => ({
    id: el.dataset.mascot, name: el.dataset.name, vi: el.dataset.vi, food: el.dataset.food, foodIcon: el.dataset.foodIcon,
    ride: el.dataset.ride, rideLabel: el.dataset.rideLabel, hello: el.dataset.hello, move: el.dataset.move || "walk", moves: movesFor(el),
    el, body: el.querySelector(".mascot-body"), sprite: el.querySelector(".mascot-sprite"), pose: el.querySelector(".mascot-pose"),
    vehicle: el.querySelector(".mascot-ride"), say: el.querySelector(".mascot-say"),
    x: 0, fx: 0, dir: 1, state: "walk", step: 0, next: 0, until: 0, shown: "", poseIdx: 0, timer: 0,
    riding: false, hold: false, goal: null, saidAt: -1e9, taps: [],
  }));
  if (!mascots.length) return;
  const byId = Object.fromEntries(mascots.map((m) => [m.id, m]));
  let pop = null, popFor = null, popOpener = null;  // the care card and the mascot it belongs to
  const size = () => mascots[0].el.offsetWidth || 100;
  const urlOf = (el) => (el.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/) || [])[1];

  // ---------- care: fullness, energy, happiness ----------
  const CARE = "mascot-care-v1";
  const FRESH = { full: 80, energy: 90, happy: 75, feeds: 0, pets: 0, naps: 0, rides: 0 };
  const care = (() => {
    let s = null;
    try { s = JSON.parse(get("localStorage", CARE)); } catch (e) { s = null; }
    if (!s || typeof s !== "object") s = {};
    s.pets = s.pets && typeof s.pets === "object" ? s.pets : {};
    const away = clamp((Date.now() - (+s.t || Date.now())) / 60000, 0, 7 * 24 * 60);  // minutes since the last visit, at most a week
    mascots.forEach((m) => {
      const p = Object.assign({}, FRESH, s.pets[m.id]);
      p.full = clamp(p.full - away * 0.25, 10, 100);    // they get hungry while you are away
      p.happy = clamp(p.happy - away * 0.15, 15, 100);  // and miss you a little
      p.energy = clamp(p.energy + away * 0.5, 0, 100);  // but they rest
      s.pets[m.id] = p;
    });
    s.best = +s.best || 0;  // Landmark Relay
    s.bestGate = +s.bestGate || 0;  // Dragon Gate
    s.games = +s.games || 0;
    s.together = +s.together || 0;
    s.explored = Array.isArray(s.explored) ? s.explored.filter((x) => typeof x === "string") : [];
    return s;
  })();
  const save = () => { care.t = Date.now(); put("localStorage", CARE, JSON.stringify(care)); };
  const moodOf = (p) => {
    if (p.energy < 25) return { key: "sleepy", label: "Sleepy", pose: "calm" };
    if (p.full < 25) return { key: "hungry", label: "Hungry", pose: "thinking" };
    if (p.happy < 30) return { key: "bored", label: "Bored", pose: "thinking" };
    if (p.happy >= 80 && p.full >= 50 && p.energy >= 50) return { key: "joyful", label: "Joyful", pose: "joy" };
    return { key: "content", label: "Content", pose: "hello" };
  };
  const NEED_LINES = { hungry: (m) => `I'm hungry… ${m.foodIcon}?`, sleepy: () => "So sleepy… ☾", bored: () => "Play with me? 🎮" };

  // ---------- drawing a walker ----------
  const draw = (m) => {
    const posing = m.state === "pose" || m.state === "nap";
    m.el.classList.toggle("is-posing", posing);
    m.el.classList.toggle("is-left", m.dir < 0);
    m.el.classList.toggle("is-riding", m.riding);
    m.el.classList.toggle("is-hopping", posing && POSES[m.poseIdx] === "joy" && !calm);
    if (posing) {
      const key = "p" + m.poseIdx;
      if (key !== m.shown) { m.pose.style.backgroundPosition = m.poseIdx * 20 + "% 0"; m.shown = key; }
    } else {
      const mv = m.moves[m.state], f = mv.steps[m.step % mv.steps.length][0], key = f + "/" + mv.row;
      if (key !== m.shown) { m.sprite.style.backgroundPosition = (f * 100) / 3 + "% " + (mv.row * 100) / 3 + "%"; m.shown = key; }
    }
    m.el.style.transform = "translateX(" + m.x.toFixed(1) + "px)";
  };
  const set = (m, state, t, ms, pose) => {
    m.state = state;
    m.step = 0;
    if (state === "pose" || state === "nap") m.poseIdx = Math.max(0, POSES.indexOf(pose || "calm"));
    m.next = m.moves[state] ? t + m.moves[state].steps[0][1] : Infinity;
    const span = LAST[state] || LAST.pose;
    m.until = t + (ms || rand(span[0], span[1]));
    draw(m);
  };
  const say = (m, text, ms) => {
    if (yard.hidden) return;
    m.say.textContent = text;
    m.say.hidden = false;
    m.say.style.removeProperty("--nudge");
    m.say.style.removeProperty("max-width");
    let lo = 8, hi = width() - 8;  // the bubble stays inside the window and clear of this mascot's open care card
    if (pop && !pop.hidden && popFor === m) {
      const c = pop.getBoundingClientRect(), me = m.el.getBoundingClientRect();
      if (c.left >= me.right - 1) hi = Math.min(hi, c.left - 8);
      else if (c.right <= me.left + 1) lo = Math.max(lo, c.right + 8);
    }
    m.say.style.maxWidth = Math.max(110, Math.min(220, hi - lo)) + "px";
    const r = m.say.getBoundingClientRect();
    if (r.left < lo) m.say.style.setProperty("--nudge", lo - r.left + "px");
    else if (r.right > hi) m.say.style.setProperty("--nudge", hi - r.right + "px");
    clearTimeout(m.timer);
    m.timer = setTimeout(() => { m.say.hidden = true; }, ms || 2600);
  };
  const burst = (m, chars, kind) => {  // small symbols that float up from the mascot (hearts, z, sparkles)
    if (calm || yard.hidden) return;
    const S = size();
    chars.forEach((c, i) => {
      const s = document.createElement("span");
      s.className = "mascot-fx is-" + kind;
      s.textContent = c;
      s.style.left = m.x + S * rand(0.3, 0.7) + "px";
      s.style.bottom = S * (m.riding ? 1.25 : 0.85) + "px";
      s.style.animationDelay = i * 140 + "ms";
      yard.appendChild(s);
      setTimeout(() => s.remove(), 1500 + i * 140);
    });
  };

  // what to do next: random, but the mood decides the odds
  const choose = (m, t) => {
    if (m.state === "nap" && !calm) { set(m, "wave", t); say(m, "All rested!"); return; }
    if (calm) { set(m, "sit", t, 1e9); m.next = Infinity; return; }  // reduced motion: they sit still
    if (m.hold) { set(m, m.riding ? "ride" : "sit", t, 1e9); return; }
    if (m.riding) { if (Math.random() < 0.3) m.dir = -m.dir; set(m, "ride", t); return; }
    const p = care.pets[m.id], mood = moodOf(p).key, s = m.state, r = Math.random();
    let next = "walk", pose = null;
    if (s === "walk") {
      if (mood === "sleepy") next = r < 0.45 ? "sit" : r < 0.65 ? "pose" : "walk";
      else if (mood === "hungry" || mood === "bored") next = r < 0.25 ? "pose" : r < 0.45 ? "sit" : "walk";
      else if (mood === "joyful") next = r < 0.18 ? "pose" : r < 0.36 ? "run" : r < 0.5 ? "wave" : r < 0.68 ? "sit" : "walk";
      else next = r < 0.25 ? "sit" : r < 0.37 ? "wave" : r < 0.55 ? "run" : r < 0.63 ? "pose" : "walk";
      if (next === "pose") pose = mood === "content" ? (Math.random() < 0.5 ? "curious" : "thinking") : moodOf(p).pose;
    } else if (s === "sit") {
      next = mood === "sleepy" && r < 0.5 ? "pose" : r < 0.3 ? "wave" : "walk";
      if (next === "pose") pose = "calm";
    }
    if (next === "pose" && NEED_LINES[mood] && t - m.saidAt > 45000) { m.saidAt = t; say(m, NEED_LINES[mood](m), 3200); }
    if (next === "walk" && (s === "walk" || s === "sit") && Math.random() < 0.4) m.dir = -m.dir;
    set(m, next, t, 0, pose);
    if (m.move === "swim" && (next === "walk" || next === "run") && Math.random() < 0.6) setTimeout(() => burst(m, ["○", "°", "○"], "bubble"), rand(300, 1500));
  };

  // ---------- the loop ----------
  let on = false, raf = 0, last = 0, savedAt = 0;
  const tick = (t) => {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0, S = size(), max = Math.max(0, width() - S);
    last = t;
    mascots.forEach((m) => {
      const p = care.pets[m.id];
      p.full = clamp(p.full - 0.01 * dt, 5, 100);
      p.happy = clamp(p.happy - 0.006 * dt, 5, 100);
      const gain = { nap: 5, sit: 0.02, run: -0.05, walk: -0.006 }[m.state] || 0;
      p.energy = clamp(p.energy + gain * dt, 0, 100);
      const mv = m.moves[m.state];
      if (m.goal) {
        const d = m.goal.x - m.x;
        if (Math.abs(d) < 3) { m.x = m.goal.x; const then = m.goal.then; m.goal = null; then(m, t); return; }
        m.dir = d < 0 ? -1 : 1;
        m.x += m.dir * Math.min(Math.abs(d), (mv ? mv.speed : 0.6) * S * dt);
      } else if (mv && mv.speed && !m.hold && !calm) {
        const sleepy = moodOf(p).key === "sleepy" && !m.riding;
        m.x += m.dir * mv.speed * (sleepy ? 0.7 : 1) * S * dt;
        if (m.x <= 0) { m.x = 0; m.dir = 1; } else if (m.x >= max) { m.x = max; m.dir = -1; }
      }
      if (!m.goal && t >= m.until) { choose(m, t); return; }
      if (mv && t >= m.next) { m.step = (m.step + 1) % mv.steps.length; m.next = t + mv.steps[m.step][1]; }
      draw(m);
    });
    if (t - savedAt > 15000) { savedAt = t; save(); }
    raf = window.requestAnimationFrame(tick);
  };

  // ---------- vehicles (APRL-style ride modes, drawn as SVG) ----------
  const VEHICLES = {
    auv: '<svg viewBox="0 0 100 34" aria-hidden="true"><path d="M22 9l-7-8h9l6 8zM22 25l-7 8h9l6-8z" fill="currentColor"/>' +
      '<rect x="14" y="8" width="70" height="18" rx="9" fill="#f5b400"/><path d="M82 8c11 0 15 4 15 9s-4 9-15 9z" fill="#f5b400"/>' +
      '<rect x="30" y="15" width="44" height="3.2" rx="1.6" fill="#0b55ad"/><circle cx="90" cy="17" r="2.6" fill="#7bcce4"/>' +
      '<rect x="8" y="13" width="7" height="8" rx="2" fill="currentColor"/><ellipse class="prop" cx="6" cy="17" rx="2" ry="8" fill="currentColor"/></svg>',
    drone: '<svg viewBox="0 0 100 34" aria-hidden="true"><g class="rotor"><ellipse cx="15" cy="5" rx="13" ry="2.4"/><ellipse cx="85" cy="5" rx="13" ry="2.4"/></g>' +
      '<path d="M15 6v6M85 6v6M15 12h70" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>' +
      '<rect x="32" y="9" width="36" height="13" rx="6" fill="#0b55ad"/><rect x="36" y="12" width="28" height="3" rx="1.5" fill="#00b4cc"/>' +
      '<circle cx="50" cy="25" r="4.2" fill="currentColor"/><circle cx="50" cy="25" r="1.8" fill="#7bcce4"/><circle cx="62" cy="15.5" r="1.4" fill="#ff5a5a"/></svg>',
    rover: '<svg viewBox="0 0 100 34" aria-hidden="true"><rect x="80" y="0" width="9" height="6" rx="2" fill="currentColor"/><rect x="82" y="2" width="5" height="1.6" fill="#00b4cc"/>' +
      '<rect x="8" y="6" width="84" height="15" rx="5" fill="#0b55ad"/><rect x="13" y="10" width="74" height="3.2" rx="1.6" fill="#00b4cc"/>' +
      '<g class="wheel"><circle cx="24" cy="25" r="8.5" fill="currentColor"/><path d="M24 18.5v13M17.5 25h13" stroke="#7bcce4" stroke-width="1.6"/></g>' +
      '<g class="wheel"><circle cx="76" cy="25" r="8.5" fill="currentColor"/><path d="M76 18.5v13M69.5 25h13" stroke="#7bcce4" stroke-width="1.6"/></g></svg>',
  };

  // ---------- actions ----------
  const visible = () => on && !yard.hidden;
  const fly = (from, m, icon) => {  // the food flies from the button to the mascot
    if (calm || !visible() || !from || !from.getBoundingClientRect) return;
    const a = from.getBoundingClientRect(), S = size();
    const bx = m.x + S / 2, by = window.innerHeight - S * 0.75, x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
    const s = document.createElement("span");
    s.className = "mascot-food";
    s.textContent = icon;
    document.body.appendChild(s);
    const anim = s.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(1)` },
      { transform: `translate(${(x0 + bx) / 2}px, ${Math.min(y0, by) - 90}px) scale(1.35)`, offset: 0.5 },
      { transform: `translate(${bx}px, ${by}px) scale(0.6)`, opacity: 0.3 },
    ], { duration: 750, easing: "ease-in-out" });
    anim.onfinish = () => s.remove();
  };
  const react = (m, pose, line, ms) => {  // show a mood pose for a moment
    if (!visible()) return;
    m.riding = false;  // the mood poses stand on the ground
    m.goal = null;
    set(m, "pose", now(), ms || 2000, pose);
    if (line) say(m, line, Math.max(2200, ms || 0));
  };
  const note = (m, text) => document.querySelectorAll(`[data-care-note="${m.id}"]`).forEach((n) => { n.textContent = text; });
  const hiddenHint = () => (visible() ? "" : " Show the mascots with the crane button in the top bar to watch.");
  const ACTIONS = {
    feed(m, from) {
      const p = care.pets[m.id];
      if (p.full >= 95) { react(m, "surprised", "I'm full! Let's play instead."); note(m, `${m.name} is full right now.`); return; }
      p.full = clamp(p.full + 30, 0, 100);
      p.happy = clamp(p.happy + 4, 0, 100);
      p.feeds += 1;
      fly(from, m, m.foodIcon);
      setTimeout(() => react(m, "joy", `Ngon quá! Yummy ${m.foodIcon}`), calm ? 0 : 700);
      note(m, `You fed the ${m.name.toLowerCase()} ${m.food}. Fullness ${Math.round(p.full)}.` + hiddenHint());
    },
    pet(m) {
      const p = care.pets[m.id], t = now();
      m.taps = m.taps.filter((x) => t - x < 3000).concat(t);
      p.happy = clamp(p.happy + 12, 0, 100);
      p.pets += 1;
      if (m.taps.length >= 4) react(m, "surprised", "Hehe, that tickles!");
      else react(m, "joy", "♡");
      burst(m, ["♥", "♡", "♥"], "heart");
      note(m, `Head pats! Happiness ${Math.round(p.happy)}.` + hiddenHint());
    },
    nap(m) {
      const p = care.pets[m.id];
      if (p.energy >= 95) { react(m, "curious", "Not sleepy yet!"); note(m, `${m.name} is full of energy.`); return; }
      p.naps += 1;
      if (visible()) {
        m.riding = false;
        m.goal = null;
        set(m, "nap", now(), LAST.nap[0], "calm");
        say(m, "Zzz…", 2000);
        [0, 1600, 3200].forEach((d) => setTimeout(() => { if (m.state === "nap") burst(m, ["z", "Z"], "zzz"); }, d));
      } else p.energy = clamp(p.energy + 30, 0, 100);  // the nap happens off screen
      note(m, `${m.name} takes a nap. Energy comes back.` + hiddenHint());
    },
    ride(m) {
      const t = now();
      m.riding = !m.riding;
      if (m.riding) {
        if (!m.vehicle.firstChild) m.vehicle.innerHTML = VEHICLES[m.ride] || "";
        m.vehicle.dataset.kind = m.ride;
        care.pets[m.id].rides += 1;
        care.pets[m.id].happy = clamp(care.pets[m.id].happy + 3, 0, 100);
        if (visible()) { m.goal = null; set(m, "ride", t, m.hold ? 1e9 : 0); say(m, (RIDES[m.ride] || RIDES.rover)[1]); }
      } else if (visible()) { set(m, "wave", t); say(m, (RIDES[m.ride] || RIDES.rover)[2]); }
      note(m, (m.riding ? `${m.name}: ${m.rideLabel.charAt(0).toLowerCase() + m.rideLabel.slice(1)}.` : `${m.name} is back ${m.move === "swim" ? "to swimming" : "on foot"}.`) + hiddenHint());
    },
  };
  const teamUp = () => {  // they all go to the middle, side by side, and share a high five
    if (mascots.length < 2) return;
    const crew = mascots.slice().sort((p, q) => p.x - q.x), n = crew.length;
    mascots.forEach((m) => { m.hold = false; m.riding = false; });
    closePop();
    const done = () => {
      care.together += 1;
      mascots.forEach((m) => { const p = care.pets[m.id]; p.happy = clamp(p.happy + 10, 0, 100); });
      save();
      refresh();
    };
    if (!visible()) { done(); mascots.forEach((m) => note(m, "They practised a high five." + hiddenHint())); return; }
    const S = size(), step = S * 0.8, span = step * (n - 1);
    const mid = clamp(crew.reduce((sum, m) => sum + m.x, 0) / n, span / 2, Math.max(span / 2, width() - S - span / 2));
    let arrived = 0;
    const meet = (m, t) => {
      arrived += 1;
      set(m, "wave", t, 8000);  // waits for the others (gives up after 8 s if one was called away)
      if (arrived < n) return;
      const t2 = now();
      crew.forEach((c, i) => { c.dir = i < (n - 1) / 2 ? 1 : i > (n - 1) / 2 ? -1 : c.dir; set(c, "pose", t2, 2300, "joy"); });
      say(crew[0], "Teamwork! ✋");
      burst(crew[Math.floor(n / 2)], ["✋", "✦", "✦"], "spark");
      done();
    };
    const go = (m, x) => {
      const t = now();
      set(m, Math.abs(x - m.x) > S * 2.5 ? "run" : "walk", t, 1e9);
      m.goal = { x: clamp(x, 0, width() - S), then: meet };
    };
    crew.forEach((m, i) => go(m, mid - span / 2 + i * step));
  };

  // ---------- care cards: the pop-up over a walker and the blocks on the Members page ----------
  const METERS = [["full", "Fullness"], ["energy", "Energy"], ["happy", "Happiness"]];
  const careUI = (m) => {
    const box = document.createElement("div");
    box.className = "mascot-care-ui";
    box.dataset.careFor = m.id;
    box.innerHTML =
      `<p class="mascot-mood-line"><span class="mascot-mood-face" aria-hidden="true"></span><span>Mood: <b data-care="mood"></b></span></p>` +
      `<div class="mascot-meters">${METERS.map(([k, label]) => `<div class="mascot-meter" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" data-meter="${k}">` +
        `<span>${label}</span><b>0</b><i><s></s></i></div>`).join("")}</div>` +
      `<div class="mascot-actions">` +
      `<button type="button" data-act="feed"><span aria-hidden="true">${esc(m.foodIcon)}</span> Feed</button>` +
      `<button type="button" data-act="pet"><span aria-hidden="true">♡</span> Pet</button>` +
      `<button type="button" data-act="nap"><span aria-hidden="true">☾</span> Nap</button>` +
      `<button type="button" data-act="ride" aria-pressed="false" aria-label="${esc(m.rideLabel)}" title="${esc(m.rideLabel)}">` +
      `${(RIDES[m.ride] || ["🚗 Ride"])[0].split(" ").map((x) => `<span aria-hidden="true">${x}</span>`).join("")}</button></div>` +
      `<p class="mascot-note" role="status" data-care-note="${esc(m.id)}"></p>`;
    box.querySelector(".mascot-mood-face").style.backgroundImage = m.pose.style.backgroundImage;
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      ACTIONS[b.dataset.act](m, b);
      save();
      refresh();
      placePop();
    });
    return box;
  };
  const refresh = () => {
    document.querySelectorAll("[data-care-for]").forEach((box) => {
      const m = byId[box.dataset.careFor], p = care.pets[m.id], mood = moodOf(p);
      box.querySelector('[data-care="mood"]').textContent = mood.label;
      box.querySelector(".mascot-mood-face").style.backgroundPosition = POSES.indexOf(mood.pose) * 20 + "% 0";
      METERS.forEach(([k]) => {
        const el = box.querySelector(`[data-meter="${k}"]`), v = Math.round(p[k]);
        el.setAttribute("aria-valuenow", v);
        el.querySelector("b").textContent = v;
        el.querySelector("s").style.width = v + "%";
        el.classList.toggle("is-low", v < 25);
      });
      box.querySelector('[data-act="ride"]').setAttribute("aria-pressed", String(m.riding));
    });
    document.querySelectorAll("[data-mascot-best]").forEach((el) => { el.textContent = el.dataset.mascotBest === "gate" ? care.bestGate : care.best; });
    document.querySelectorAll("[data-mascot-explored]").forEach((el) => { el.textContent = `${care.explored.length} / ${sections().length}`; });
  };

  const placePop = () => {  // beside the mascot, so its speech bubble, poses and hearts stay in view
    if (!pop || !popFor) return;
    const S = size(), w = pop.offsetWidth, h = pop.offsetHeight, vw = width(), x = popFor.x, gap = 14;
    let left, bottom = 8;
    if (x + S + gap + w <= vw - 8) left = x + S + gap;
    else if (x - gap - w >= 8) left = x - gap - w;
    else {  // narrow screen: above the mascot, with room for a two-line bubble in between
      const lift = popFor.riding ? (popFor.ride === "drone" ? 0.49 : 0.27) : 0;
      left = clamp(x + S / 2 - w / 2, 8, Math.max(8, vw - w - 8));
      bottom = Math.min(S * (1 + lift) + 74, Math.max(8, window.innerHeight - h - 8));
    }
    pop.style.left = left + "px";
    pop.style.bottom = bottom + "px";
  };
  const closePop = (restore) => {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    if (popFor) { popFor.hold = false; popFor.until = now(); }
    if (restore && popOpener) popOpener.focus();
    popFor = null;
  };
  const openPop = (m, opener) => {
    if (!pop) {
      pop = document.createElement("section");
      pop.className = "mascot-pop";
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-labelledby", "mascot-pop-title");
      pop.hidden = true;
      document.body.appendChild(pop);
      document.addEventListener("pointerdown", (e) => { if (pop && !pop.hidden && !pop.contains(e.target) && !e.target.closest("[data-mascot]")) closePop(false); });
    }
    popFor = m;
    popOpener = opener || null;
    pop.innerHTML = `<header><h2 id="mascot-pop-title">${esc(m.name)} <span lang="vi">${esc(m.vi)}</span></h2>` +
      `<button type="button" class="mascot-pop-close" aria-label="Close">×</button></header>`;
    pop.appendChild(careUI(m));
    const extra = document.createElement("div"), mine = GAMES.filter((x) => (x.players || []).includes(m.id));  // the games this mascot plays in
    extra.className = "mascot-pop-more";
    extra.innerHTML = (mascots.length > 1 ? `<button type="button" data-more="team"><span aria-hidden="true">✋</span> Team up</button>` : "") +
      mine.map((x) => `<button type="button" data-more="game:${esc(x.id)}" aria-label="Play ${esc(x.name)}, a minigame"><span aria-hidden="true">${x.id === "gate" ? "🐉" : "🎮"}</span> ${esc(x.name)}</button>`).join("") +
      `<p>Pages explored: <b data-mascot-explored></b>${mine.map((x) => ` · Best ${esc(x.name)}: <b data-mascot-best="${esc(x.id)}"></b>`).join("")}</p>`;
    extra.addEventListener("click", (e) => {
      const b = e.target.closest("[data-more]");
      if (!b) return;
      if (b.dataset.more === "team") teamUp();
      else { const game = games[b.dataset.more.slice(5)]; if (game) { closePop(false); game.open(b); } }
    });
    pop.appendChild(extra);
    pop.querySelector(".mascot-pop-close").addEventListener("click", () => closePop(true));
    pop.hidden = false;
    m.hold = true;
    m.goal = null;
    set(m, "wave", now());  // then it sits while the card is open (choose)
    refresh();
    const tip = { hungry: `Hungry: try Feed ${m.foodIcon}`, sleepy: "Sleepy: try Nap ☾", bored: "Bored: pet me or play Landmark Relay",
      joyful: "Feeling great!", content: "Feeling fine. Pick something to do together." }[moodOf(care.pets[m.id]).key];
    note(m, tip);
    placePop();
    pop.querySelector('[data-act="feed"]').focus({ preventScroll: true });
  };
  mascots.forEach((m) => {
    m.el.addEventListener("click", () => {
      if (pop && !pop.hidden && popFor === m) { closePop(false); return; }
      closePop(false);
      openPop(m, m.el);
      say(m, m.hello);
    });
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && pop && !pop.hidden && !anyGameOpen()) closePop(true); });

  // ---------- exploring the site: a new page makes them curious ----------
  const sections = () => [...document.querySelectorAll(".site-nav a")].filter((a) => a.origin === location.origin).map((a) => a.pathname);
  const exploreHere = () => {
    const here = sections().filter((p) => location.pathname.startsWith(p)).sort((p, q) => q.length - p.length)[0];
    if (!here || care.explored.includes(here)) return;
    care.explored.push(here);
    save();
    const n = care.explored.length, total = sections().length;
    setTimeout(() => {
      if (!visible()) return;
      const m = mascots[Math.floor(Math.random() * mascots.length)];
      if (n >= total) {
        mascots.forEach((x) => react(x, "joy", null, 2600));
        say(m, "You explored the whole lab! 🎉", 3600);
      } else if (n > 1) react(m, "curious", `A new page! ${n} of ${total} explored.`, 2600);
    }, 1800);
  };

  // ---------- Members page: picker, care blocks, mood buttons, team up and the game ----------
  const picker = document.querySelector("[data-mascot-picker]");
  if (picker) {  // show one mascot card at a time; without JavaScript all cards stay visible
    const picks = [...picker.querySelectorAll("[data-pick]")];
    const pick = (id) => {
      picks.forEach((b) => { const on = b.dataset.pick === id; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
      document.querySelectorAll(".mascot-card").forEach((c) => { c.hidden = c.id !== "mascot-" + id; });
    };
    picks.forEach((b, i) => {
      b.addEventListener("click", () => {
        pick(b.dataset.pick);
        const m = byId[b.dataset.pick];
        if (m && visible()) react(m, "hello", m.hello, 2400);  // the walker on the page says hello too
      });
      b.addEventListener("keydown", (e) => {
        const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!k) return;
        e.preventDefault();
        const next = picks[(i + k + picks.length) % picks.length];
        pick(next.dataset.pick);
        next.focus();
      });
    });
    picker.hidden = false;
    const linked = (location.hash.match(/^#mascot-([\w-]+)$/) || [])[1];
    pick(linked && picks.some((b) => b.dataset.pick === linked) ? linked : picks[0].dataset.pick);
    if (linked) {
      const tab = document.querySelector('[data-tab="mascots"]');
      if (tab) tab.click();
      // after the browser's own jump to the card: show the picker with the card under it
      window.addEventListener("load", () => setTimeout(() => picker.scrollIntoView({ block: "start", behavior: "instant" }), 0), { once: true });
    }
  }
  document.querySelectorAll("[data-mascot-care]").forEach((slot) => {
    const m = byId[slot.dataset.mascotCare];
    if (!m) return;
    slot.appendChild(careUI(m));
    slot.hidden = false;
  });
  document.querySelectorAll("[data-mascot-mood]").forEach((b) => {
    b.addEventListener("click", () => {
      const m = byId[b.dataset.mascotMood], pose = POSES[+b.dataset.pose];
      if (!m || !pose) return;
      if (visible()) react(m, pose, POSE_LINES[pose], 2600);
      note(m, visible() ? `${m.name} shows: ${b.textContent.trim()}.` : `Show the mascots with the crane button in the top bar to see ${m.name.toLowerCase()} do this.`);
    });
  });
  document.querySelectorAll("[data-mascot-play]").forEach((box) => {
    box.hidden = false;
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-play]");
      if (!b) return;
      if (b.dataset.play === "team") teamUp();
      else if (games[b.dataset.play]) games[b.dataset.play].open(b);
    });
  });

  // ---------- show / hide ----------
  const show = (value, remember) => {
    on = value;
    yard.hidden = !on;
    if (toggle) {
      toggle.setAttribute("aria-pressed", String(on));  // the label stays "Show the lab mascots"; pressed means shown
      toggle.title = on ? "Hide the mascots" : "Show the mascots";
    }
    if (remember) put("localStorage", "mascots", on ? "on" : "off");
    window.cancelAnimationFrame(raf);
    last = 0;
    if (!on) { closePop(false); return; }
    const t = now(), max = Math.max(0, width() - size());
    mascots.forEach((m) => {
      m.x = clamp(m.fx * width(), 0, max);
      if (calm) { set(m, "sit", t, 1e9); m.next = Infinity; }
      else set(m, m.riding ? "ride" : "walk", t);
    });
    raf = window.requestAnimationFrame(tick);
  };
  let saved = {};
  try { saved = JSON.parse(get("sessionStorage", "mascot-pos")) || {}; } catch (e) { saved = {}; }
  mascots.forEach((m, i) => {
    const s = Array.isArray(saved[m.id]) ? saved[m.id] : [0.06 + (0.8 * i) / Math.max(1, mascots.length - 1), i % 2 ? -1 : 1, 0];
    m.fx = clamp(+s[0] || 0, 0, 1);
    m.dir = s[1] < 0 ? -1 : 1;
    m.riding = !!s[2];
    if (m.riding) { m.vehicle.innerHTML = VEHICLES[m.ride] || ""; m.vehicle.dataset.kind = m.ride; }
  });
  const choice = get("localStorage", "mascots");
  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener("click", () => show(!on, true));
  }
  show(choice ? choice === "on" : !calm && width() >= 720, false);
  refresh();
  exploreHere();
  setInterval(() => { if (document.querySelector("[data-care-for]")) refresh(); }, 1000);
  window.addEventListener("resize", () => {
    const max = Math.max(0, width() - size());
    mascots.forEach((m) => { m.x = Math.min(m.x, max); draw(m); });
    placePop();
  });
  window.addEventListener("pagehide", () => {  // walk on from the same place on the next page
    save();
    if (!on) return;
    const pos = {};
    mascots.forEach((m) => { m.fx = m.x / Math.max(1, width()); pos[m.id] = [+m.fx.toFixed(4), m.dir, m.riding ? 1 : 0]; });
    put("sessionStorage", "mascot-pos", JSON.stringify(pos));
  });

  // ---------- minigames ("mascot_games" in data/lab.json): one dialog shell, Landmark Relay and Dragon Gate ----------
  const GAMES = (() => { try { return JSON.parse(yard.dataset.games || "[]"); } catch (e) { return []; } })();
  const img = {};
  const image = (key, url) => { if (!img[key]) { img[key] = new Image(); img[key].src = url; } return img[key]; };
  const dark = () => document.documentElement.dataset.theme === "dark";
  const drawSprite = (ctx, im, cx, by, s, face, col, row) => {  // one 200 px cell of a sheet, bottom-centred at (cx, by)
    if (!im.complete || !im.naturalWidth) return;
    ctx.save();
    ctx.translate(cx, by);
    if (face < 0) ctx.scale(-1, 1);
    ctx.drawImage(im, col * 200, row * 200, 200, 200, -s / 2, -s, s, s);
    ctx.restore();
  };
  const roundRect = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };

  // The dialog every game runs in: header with score boxes, a canvas, a message screen, keys, pause, focus trap, resize.
  const gameDialog = (o) => {
    let box = null, raf = 0, last = 0, opener = null;
    const g = { W: 760, H: 440, u: 1, kx: 1, ky: 1, dpr: 1, paused: false, cv: null, ctx: null, screen: null, hud: {} };
    const isOpen = () => !!box && !box.hidden;
    g.show = (html) => {
      g.screen.innerHTML = html;
      g.screen.hidden = !html;
      const b = g.screen.querySelector("button");
      if (b) b.focus({ preventScroll: true });
    };
    g.pause = () => { if (!o.running() || g.paused) return; g.paused = true; g.show(`<h3>Paused</h3><button type="button" class="button" data-g="resume">Resume</button>`); };
    g.resume = () => { g.paused = false; last = 0; g.show(""); g.cv.focus({ preventScroll: true }); };
    g.togglePause = () => (g.paused ? g.resume() : g.pause());
    const fit = () => {
      const stage = g.cv.parentElement, oldW = g.W;
      g.W = Math.round(stage.clientWidth);
      g.H = Math.round(stage.clientHeight);
      g.kx = g.W / 760;
      g.ky = g.H / 440;
      g.u = Math.max(0.68, g.kx);  // phones: the field shrinks, the mascots stay readable
      g.dpr = Math.min(2, window.devicePixelRatio || 1);
      g.cv.width = Math.round(g.W * g.dpr);
      g.cv.height = Math.round(g.H * g.dpr);
      o.fit(oldW);
    };
    const loop = (t) => {
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;  // slow frames slow the game a little, never jump it
      last = t;
      if (!g.paused) o.step(dt);
      o.paint();
      o.hud();
      raf = window.requestAnimationFrame(loop);
    };
    const build = () => {
      box = document.createElement("div");
      box.className = "mascot-game";
      box.hidden = true;
      const tid = "mascot-game-title-" + o.id;
      box.innerHTML = `<div class="mascot-game-box" role="dialog" aria-modal="true" aria-labelledby="${tid}">` +
        `<header class="mascot-game-head"><div><p class="kicker">Lab mascots · minigame</p><h2 id="${tid}">${esc(o.title)}</h2></div>` +
        `<p class="mascot-game-hud" aria-live="off">${o.boxes.map(([k, label]) => `<span>${esc(label)} <b data-g="${k}"></b></span>`).join("")}</p>` +
        `<button type="button" class="mascot-game-close" data-g="close" aria-label="Close the game">×</button></header>` +
        `<div class="mascot-game-stage"><canvas tabindex="0" role="img" aria-label="${esc(o.label)}"></canvas>` +
        `<div class="mascot-game-screen" data-g="screen" role="status"></div></div>` +
        `<p class="mascot-game-help">${esc(o.help)}</p></div>`;
      document.body.appendChild(box);
      g.cv = box.querySelector("canvas");
      g.ctx = g.cv.getContext("2d");
      g.screen = box.querySelector('[data-g="screen"]');
      o.boxes.forEach(([k]) => { g.hud[k] = box.querySelector(`[data-g="${k}"]`); });
      box.addEventListener("click", (e) => {
        const b = e.target.closest("[data-g]");
        if (!b) { if (e.target === box) close(); return; }
        if (b.dataset.g === "close") close();
        if (b.dataset.g === "start") { g.paused = false; last = 0; g.show(""); o.start(); g.cv.focus({ preventScroll: true }); }
        if (b.dataset.g === "resume") g.resume();
      });
      ["pointerdown", "pointermove", "pointerup", "pointercancel"].forEach((type) => g.cv.addEventListener(type, (e) => {
        if (type === "pointerdown" && g.cv.setPointerCapture) g.cv.setPointerCapture(e.pointerId);
        o.pointer(type, e);
      }));
      box.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); close(); return; }
        if (e.key === "Tab") {  // keep the focus inside the dialog
          const f = [...box.querySelectorAll("button")].filter((b) => b.offsetParent);
          if (f.length && e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (f.length && !e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
          return;
        }
        if ((e.key === " " || e.key === "Enter") && e.target.closest("button")) return;  // Space and Enter press buttons
        o.key(e, true);
      });
      box.addEventListener("keyup", (e) => o.key(e, false));
      document.addEventListener("visibilitychange", () => { if (document.hidden && isOpen()) g.pause(); });
      window.addEventListener("resize", () => { if (isOpen()) { fit(); o.paint(); } });
    };
    const close = () => {
      if (!isOpen()) return;
      window.cancelAnimationFrame(raf);
      box.hidden = true;
      document.documentElement.classList.remove("mascot-game-open");
      o.close();
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    };
    g.open = (from) => {
      if (!box) build();
      opener = from || document.activeElement;
      g.paused = false;
      box.hidden = false;
      document.documentElement.classList.add("mascot-game-open");
      fit();
      o.open();
      last = 0;
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(loop);
    };
    g.close = close;
    g.isOpen = isOpen;
    return g;
  };
  const cheer = (players) => {  // after a game: happier, a little tired and hungry
    players.forEach((m) => {
      const p = care.pets[m.id];
      p.happy = clamp(p.happy + 15, 0, 100);
      p.energy = clamp(p.energy - 12, 0, 100);
      p.full = clamp(p.full - 8, 0, 100);
    });
    care.games += 1;
    save();
    refresh();
  };

  // ---------- Landmark Relay: the crane drops landmarks from a drone, the buffalo catches them ----------
  const relay = (() => {
    const info = GAMES.find((x) => x.id === "relay") || {}, SECONDS = +info.seconds || 45;
    const crane = byId.crane || mascots[0], buffalo = byId.buffalo || mascots[mascots.length - 1];
    let st = null, tufts = [], col = null, W = 760, H = 440, u = 1, kx = 1, ky = 1, dpr = 1, ctx = null;
    const colors = () => (dark()
      ? { sky0: "#1d2a35", sky1: "#24323d", field: "#2f4a2a", water: "#2a4256", tuft: "#7fb069", text: "#e8e8e8", dot: "#7bcce4", shade: "rgba(0,0,0,.35)", arm: "#9fb3c8", rotor: "rgba(190,205,220,.55)" }
      : { sky0: "#dcecfb", sky1: "#f7fbff", field: "#9ccc65", water: "#b3e5fc", tuft: "#558b2f", text: "#0a2342", dot: "#0b55ad", shade: "rgba(6,26,54,.18)", arm: "#24364f", rotor: "rgba(36,54,79,.55)" });
    const G = () => H - 38 * u;            // ground line
    const BUF = () => Math.max(60, 98 * u);  // buffalo size
    const DRONE_Y = () => 82 * u;
    const sprite = (im, cx, by, s, face, c, r) => drawSprite(ctx, im, cx, by, s, face, c, r);

    const newRound = () => ({
      t: 0, left: SECONDS, score: 0, caught: 0, dropped: 0, loops: 0, outCaught: 0, over: false, countdown: 1.8, shake: 0,
      items: [], fx: [], graph: [], closures: [],
      buf: { x: W / 2, vx: 0, face: 1, step: 0, joy: 0, oops: 0 },
      crane: { x: W * 0.3, dir: 1, turnAt: 2, dropAt: 0.6 }, keys: { l: false, r: false }, target: null,
    });
    const drop = () => {
      const r = Math.random(), pOut = Math.min(0.3, 0.16 + st.t * 0.004);
      const kind = r < 0.09 ? "loop" : r < 0.09 + pOut ? "out" : "land";
      st.items.push({ kind, x: st.crane.x + rand(-6, 6) * u, y: DRONE_Y() + 24 * u, v: (125 + 4.2 * st.t + rand(0, 40)) * ky, spin: rand(0, 6.28) });
      if (kind !== "out") st.dropped += 1;
    };
    const text = (x, y, s, color, big) => st.fx.push({ x, y, s, color, big: !!big, age: 0 });
    const grow = (loop) => {  // each catch adds a robot pose and the landmark it saw; a loop closure links back to an old pose
      const k = st.graph.length, x = 0.06 + 0.88 * ((k % 48) / 47), y = 0.42 + 0.1 * Math.sin(k * 0.45) + rand(-0.015, 0.015);
      st.graph.push({ x, y, lx: x + rand(-0.035, 0.035), ly: y + (Math.random() < 0.5 ? -1 : 1) * rand(0.06, 0.13) });
      if (loop && k > 4) st.closures.push([k, Math.floor(rand(0, k - 3))]);
    };
    const step = (dt) => {
      if (!st || st.over) return;
      if (st.countdown > 0) { st.countdown -= dt; return; }
      st.t += dt;
      st.left = Math.max(0, SECONDS - st.t);
      const c = st.crane;
      c.x += c.dir * (150 + 2 * st.t) * kx * dt;
      if (c.x < 50 * u) { c.x = 50 * u; c.dir = 1; }
      if (c.x > W - 50 * u) { c.x = W - 50 * u; c.dir = -1; }
      c.turnAt -= dt;
      if (c.turnAt <= 0) { if (Math.random() < 0.5) c.dir = -c.dir; c.turnAt = rand(1.2, 2.8); }
      c.dropAt -= dt;
      if (c.dropAt <= 0) { drop(); c.dropAt = Math.max(0.42, 1.05 - 0.013 * st.t) * rand(0.8, 1.2); }
      const b = st.buf, maxV = 470 * kx, S = BUF();
      let want = 0;
      if (st.keys.l || st.keys.r) want = ((st.keys.r ? 1 : 0) - (st.keys.l ? 1 : 0)) * maxV;
      else if (st.target != null) { const d = st.target - b.x; want = Math.abs(d) < 4 ? 0 : clamp(d * 9, -maxV, maxV); }
      b.vx += (want - b.vx) * Math.min(1, dt * 14);
      b.x = clamp(b.x + b.vx * dt, S * 0.4, W - S * 0.4);
      if (Math.abs(b.vx) > 8) b.face = b.vx < 0 ? -1 : 1;
      b.step += dt * (Math.abs(b.vx) > 220 * kx ? 11.8 : 7.1);
      b.joy = Math.max(0, b.joy - dt);
      b.oops = Math.max(0, b.oops - dt);
      st.shake = Math.max(0, st.shake - dt);
      const top = G() - S * 0.95, bottom = G() - S * 0.32, half = S * 0.42, R = 12.5 * u;
      st.items = st.items.filter((it) => {
        it.y += it.v * dt;
        it.spin += dt * 2.4;
        if (it.y + R > top && it.y - R < bottom && Math.abs(it.x - b.x) < half) {
          if (it.kind === "land") { st.score += 1; st.caught += 1; b.joy = 0.35; text(it.x, it.y, "+1", "#0b55ad"); }
          if (it.kind === "loop") {
            st.score += 5; st.caught += 1; st.loops += 1; b.joy = 0.7; text(it.x, it.y - 10 * u, "+5 loop closure!", "#b77900", true);
          }
          if (it.kind === "out") { st.score = Math.max(0, st.score - 2); st.outCaught += 1; b.oops = 0.7; st.shake = calm ? 0 : 0.25; text(it.x, it.y, "−2 outlier", "#d32f2f"); }
          if (it.kind !== "out") grow(it.kind === "loop");
          return false;
        }
        if (it.y > G() - R * 0.4) { if (it.kind !== "out") text(it.x, G() - 14 * u, "miss", "#7b8794"); return false; }
        return true;
      });
      st.fx = st.fx.filter((f) => (f.age += dt) < 0.9);
      if (st.left <= 0) finish();
    };

    // drawing
    const cube = (x, y, r, top, left, right) => {
      const w = r * 0.87;
      const face = (pts, fill) => { ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); };
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(6,26,54,.35)";
      face([[x, y - r], [x + w, y - r / 2], [x, y], [x - w, y - r / 2]], top);
      face([[x - w, y - r / 2], [x, y], [x, y + r], [x - w, y + r / 2]], left);
      face([[x, y], [x + w, y - r / 2], [x + w, y + r / 2], [x, y + r]], right);
    };
    const item = (it) => {
      const R = 12.5 * u;
      if (it.kind === "land") cube(it.x, it.y, R, "#9ee0ff", "#1e88e5", "#0b55ad");
      if (it.kind === "loop") {
        ctx.save();
        ctx.strokeStyle = "rgba(245,180,0,.85)";
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.ellipse(it.x, it.y, R * 1.7, R * 0.7, it.spin, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        cube(it.x, it.y, R, "#ffe58a", "#f5b400", "#c98a00");
      }
      if (it.kind === "out") {
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.rotate(it.spin);
        ctx.fillStyle = "#e53935";
        ctx.beginPath();
        for (let i = 0; i < 16; i += 1) { const a = (i * Math.PI) / 8, rad = i % 2 ? R * 0.55 : R * 1.15; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2.2 * u;
        ctx.beginPath();
        ctx.moveTo(-R * 0.35, -R * 0.35); ctx.lineTo(R * 0.35, R * 0.35); ctx.moveTo(R * 0.35, -R * 0.35); ctx.lineTo(-R * 0.35, R * 0.35);
        ctx.stroke();
        ctx.restore();
      }
    };
    const drone = (x, y, t) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(u, u);
      ctx.strokeStyle = col.arm;
      ctx.lineWidth = 3.4;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-36, 2); ctx.lineTo(36, 2); ctx.moveTo(-36, 2); ctx.lineTo(-36, -5); ctx.moveTo(36, 2); ctx.lineTo(36, -5); ctx.stroke();
      ctx.fillStyle = col.rotor;
      const w = 13 + 3 * Math.sin(t * 50);
      ctx.beginPath(); ctx.ellipse(-36, -6, w, 2.3, 0, 0, Math.PI * 2); ctx.ellipse(36, -6, w, 2.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0b55ad"; roundRect(ctx, -19, -4, 38, 13, 6); ctx.fill();
      ctx.fillStyle = "#00b4cc"; roundRect(ctx, -15, -1, 30, 3, 1.5); ctx.fill();
      ctx.fillStyle = col.arm; ctx.beginPath(); ctx.arc(0, 12, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    const paint = () => {
      if (!ctx) return;
      const t = now() / 1000, S = BUF(), gl = G();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (st && st.shake > 0) ctx.translate(rand(-3, 3) * u, rand(-2, 2) * u);
      const sky = ctx.createLinearGradient(0, 0, 0, gl);
      sky.addColorStop(0, col.sky0);
      sky.addColorStop(1, col.sky1);
      ctx.fillStyle = sky;
      ctx.fillRect(-10, -10, W + 20, H + 20);
      if (st && st.graph.length) {  // the map they are building: a pose graph with landmarks and loop closures
        const P = (n) => [n.x * W, n.y * gl], L = (n) => [n.lx * W, n.ly * gl];
        ctx.lineWidth = 1;
        ctx.strokeStyle = col.dot;
        ctx.globalAlpha = 0.14;
        ctx.beginPath();
        st.graph.forEach((n) => { ctx.moveTo(...P(n)); ctx.lineTo(...L(n)); });
        ctx.stroke();
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1.6 * u;
        ctx.beginPath();
        st.graph.forEach((n, i) => (i && i % 48 ? ctx.lineTo(...P(n)) : ctx.moveTo(...P(n))));
        ctx.stroke();
        ctx.strokeStyle = "#f5b400";
        ctx.globalAlpha = 0.6;
        ctx.setLineDash([4 * u, 3 * u]);
        ctx.beginPath();
        st.closures.forEach(([a, b]) => { const [x1, y1] = P(st.graph[a]), [x2, y2] = P(st.graph[b]); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, Math.min(y1, y2) - 40 * u, x2, y2); });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col.dot;
        ctx.globalAlpha = 0.55;
        st.graph.forEach((n) => { ctx.beginPath(); ctx.arc(...L(n), 2.4 * u, 0, Math.PI * 2); ctx.fill(); });
        ctx.globalAlpha = 0.35;
        st.graph.forEach((n) => { ctx.beginPath(); ctx.arc(...P(n), 1.6 * u, 0, Math.PI * 2); ctx.fill(); });
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = col.field;
      ctx.fillRect(-10, gl, W + 20, H - gl + 10);
      ctx.fillStyle = col.water;
      ctx.fillRect(-10, gl + 16 * u, W + 20, 5 * u);
      ctx.strokeStyle = col.tuft;
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      tufts.forEach((f) => { ctx.moveTo(f.x, gl + 2 * u); ctx.lineTo(f.x + f.lean - 3 * u, gl - f.h); ctx.moveTo(f.x, gl + 2 * u); ctx.lineTo(f.x + f.lean + 3 * u, gl - f.h * 0.85); });
      ctx.stroke();
      const c = st ? st.crane : { x: W * 0.3, dir: 1 };
      const cy = DRONE_Y() + Math.sin(t * 3) * 3 * u;
      drone(c.x, cy, t);
      const blink = Math.floor(t * 1.2) % 5 === 4 ? 2 : 0;
      sprite(image("crane-sprite", urlOf(crane.sprite)), c.x, cy - 3 * u, 64 * u, c.dir, blink, 2);
      if (st) st.items.forEach(item);
      const b = st ? st.buf : { x: W / 2, vx: 0, face: 1, step: 0, joy: 0, oops: 0 };
      ctx.fillStyle = col.shade;
      ctx.beginPath();
      ctx.ellipse(b.x, gl + 3 * u, S * 0.3, 5 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      const moods = image("buffalo-moods", urlOf(buffalo.pose)), walk = image("buffalo-sprite", urlOf(buffalo.sprite));
      if (b.oops > 0) sprite(moods, b.x, gl + 4 * u, S, b.face, 2, 0);
      else if (b.joy > 0) sprite(moods, b.x, gl + 4 * u, S, b.face, 5, 0);
      else if (Math.abs(b.vx) > 220 * kx) sprite(walk, b.x, gl + 4 * u, S, b.face, Math.floor(b.step) % 4, 1);
      else if (Math.abs(b.vx) > 20 * kx) sprite(walk, b.x, gl + 4 * u, S, b.face, Math.floor(b.step) % 4, 0);
      else sprite(moods, b.x, gl + 4 * u, S, b.face, 0, 0);
      if (st) {
        ctx.textAlign = "center";
        st.fx.forEach((f) => {
          ctx.globalAlpha = 1 - f.age / 0.9;
          ctx.fillStyle = f.color;
          ctx.font = `700 ${Math.round((f.big ? 17 : 15) * Math.max(0.8, u))}px system-ui, sans-serif`;
          ctx.fillText(f.s, f.x, f.y - f.age * 40 * u);
        });
        ctx.globalAlpha = 1;
        if (st.countdown > 0 && !st.over) {
          ctx.fillStyle = col.text;
          ctx.font = `800 ${Math.round(54 * Math.max(0.7, u))}px system-ui, sans-serif`;
          ctx.fillText(st.countdown > 1.2 ? "3" : st.countdown > 0.6 ? "2" : "1", W / 2, H * 0.48);
        }
      }
    };
    const finish = () => {
      st.over = true;
      const best = st.score > care.best;
      care.best = Math.max(care.best, st.score);
      cheer([crane, buffalo]);
      g.hud.best.textContent = care.best;
      const built = st.dropped ? Math.round((100 * st.caught) / st.dropped) : 0;
      g.show(`<h3>Map built: ${built}%</h3><p class="mascot-game-score">Score <b>${st.score}</b>${best ? " · new best!" : ` · best ${care.best}`}</p>` +
        `<p>${st.caught} of ${st.dropped} landmarks caught (${st.loops} loop closure${st.loops === 1 ? "" : "s"}); ${st.outCaught} outlier${st.outCaught === 1 ? "" : "s"} caught.</p>` +
        `<p class="mascot-game-small">Playing makes them hungry: feed them after the game.</p>` +
        `<button type="button" class="button" data-g="start">Play again</button> <button type="button" class="button button-quiet" data-g="close">Close</button>`);
    };
    const aim = (e) => { if (!st) return; const r = g.cv.getBoundingClientRect(); st.target = clamp(e.clientX - r.left, 0, W); st.keys.l = st.keys.r = false; };
    const g = gameDialog({
      id: "relay", title: info.name || "Landmark Relay",
      label: "Game field: the crane drops landmarks from a drone, the buffalo catches them",
      help: "Move the buffalo with ← → or A D, or with the mouse or a finger. Space pauses, Esc closes.",
      boxes: [["score", "Score"], ["time", "Time"], ["best", "Best"]],
      fit: (oldW) => {
        ({ W, H, u, kx, ky, dpr, ctx } = g);
        tufts = Array.from({ length: Math.ceil(W / (16 * u)) }, (_, i) => ({ x: i * 16 * u + rand(-4, 4) * u, h: rand(9, 16) * u, lean: rand(-3, 3) * u }));
        if (st && oldW && oldW !== W) {  // keep everything where it was, in proportion
          const k = W / oldW;
          st.buf.x *= k; st.crane.x *= k; st.items.forEach((it) => { it.x *= k; });
          if (st.target != null) st.target *= k;
        }
      },
      open: () => {
        col = colors();
        st = null;
        g.hud.best.textContent = care.best;
        g.hud.score.textContent = 0;
        g.hud.time.textContent = SECONDS;
        g.show(`<h3>Map the lab together</h3><p>The crane flies the drone and drops landmarks. Catch them with the buffalo.</p>` +
          `<ul class="mascot-game-legend"><li><i class="is-land"></i>Landmark <b>+1</b></li><li><i class="is-loop"></i>Loop closure <b>+5</b></li>` +
          `<li><i class="is-out"></i>Outlier <b>−2</b>, let it fall</li></ul><button type="button" class="button" data-g="start">Start · ${SECONDS} s</button>`);
      },
      start: () => { st = newRound(); },
      running: () => !!st && !st.over,
      step,
      paint,
      hud: () => { if (st) { g.hud.score.textContent = st.score; g.hud.time.textContent = Math.ceil(st.left); } },
      key: (e, down) => {
        if (!st || st.over) return;
        const k = e.key.toLowerCase();
        if (k === "arrowleft" || k === "a") { st.keys.l = down; if (down) { st.target = null; e.preventDefault(); } }
        if (k === "arrowright" || k === "d") { st.keys.r = down; if (down) { st.target = null; e.preventDefault(); } }
        if (k === " " && down) { e.preventDefault(); g.togglePause(); }
      },
      pointer: (type, e) => { if (type === "pointermove" || type === "pointerdown") aim(e); },
      close: () => {
        const score = st && st.over ? st.score : null;
        st = null;
        if (score !== null && visible()) { react(buffalo, "joy", `Great mapping! ${score} points.`, 2600); react(crane, "joy", null, 2600); }
      },
    });
    return g;
  })();

  // ---------- Dragon Gate (Vượt Vũ Môn): the carp swims up the river to the Dragon Gate ----------
  // Leap over rocks and logs. Before each tall rock the crane flies over and lowers a rope: leap, grab the ring at the top
  // of the leap, and the crane carries the carp across. Three lives; pearls on the way; reach the gate to become a dragon.
  const dragonGate = (() => {
    const info = GAMES.find((x) => x.id === "gate") || {}, METERS = +info.meters || 1000;
    const carp = byId.carp, crane = byId.crane;
    if (!carp || !crane) return null;
    let st = null, col = null, W = 760, H = 440, u = 1, dpr = 1, ctx = null, ridges = { far: [], near: [] }, reeds = [];
    const colors = () => (dark()
      ? { sky0: "#132230", sky1: "#24384a", far: "#2b3f50", near: "#2d4838", bank: "#35552f", reed: "#6f9a5b", water0: "#1f5a78", water1: "#0e2a3a",
          wave: "rgba(170,220,245,.38)", front: "rgba(16,58,82,.55)", text: "#eef2f5", sun: "#e9edf2", rock: "#76828e", rockHi: "#97a2ad",
          log: "#7d5034", logHi: "#a06c45", moss: "#5d8c4a", rope: "#c9a27a", gold: "#f5b400", pearl: "#ffd54f", bar: "rgba(255,255,255,.18)", fill: "#7bcce4", drop: "#9fd8f0" }
      : { sky0: "#b9e0fa", sky1: "#eef8ff", far: "#a6c6d6", near: "#8dbd98", bank: "#79b26a", reed: "#4e8a3e", water0: "#4fb3d9", water1: "#1f78a8",
          wave: "rgba(255,255,255,.6)", front: "rgba(38,138,188,.5)", text: "#0a2342", sun: "#ffd166", rock: "#7c8794", rockHi: "#a3adb8",
          log: "#8d5a36", logHi: "#b07a4f", moss: "#6aa84f", rope: "#8d6e63", gold: "#f5b400", pearl: "#ffca28", bar: "rgba(6,26,54,.14)", fill: "#0b55ad", drop: "#d6f1fb" });
    const WATER = () => H * 0.68;            // river surface
    const SZ = () => 80 * u;                 // carp size
    const CX = () => W * 0.24;               // carp's screen x (sprite centre)
    const PXM = () => 14 * u;                // world px per metre
    const END = () => METERS * PXM();        // the gate's world x
    const base = () => WATER() + 0.3 * SZ(); // sprite bottom while swimming
    const JUMP = () => 640 * u, GRAV = () => 1600 * u;
    const sx = (x) => x - st.x + CX();       // world x -> screen x
    const meters = () => Math.min(METERS, Math.round((st ? st.x : 0) / PXM()));
    const total = () => (st ? Math.floor(meters() / 10) + st.score + (st.won ? 50 : 0) : 0);
    const sprite = (im, cx, by, s, face, c, r) => drawSprite(ctx, im, cx, by, s, face, c, r);

    const newRound = () => ({
      t: 0, x: 0, speed: 280 * u, lives: 3, score: 0, pearls: 0, vaults: 0, over: false, won: false, done: false, endIn: 0,
      countdown: 1.8, shake: 0, leap: false, next: W * 1.15, ropeAt: 2500 * u,
      carp: { y: 0, vy: 0, air: false, rope: null, inv: 0, oops: 0, step: 0 },
      obs: [], gems: [], cranes: [], fx: [], drops: [],
    });
    const text = (x, y, s, color, big, life) => st.fx.push({ x, y, s, color, big: !!big, age: 0, life: life || 1 });
    const splash = (n) => {
      if (calm) return;
      const x = CX() + 0.05 * SZ(), y = WATER();
      for (let i = 0; i < n; i += 1) st.drops.push({ x: x + rand(-14, 14) * u, y, vx: rand(-110, 110) * u, vy: -rand(110, 280) * u, life: rand(0.45, 0.8) });
    };
    const spawn = () => {  // the next obstacle pattern at world x st.next
      const s = st.speed, x = st.next;
      if (x > END() - 700 * u) { st.next = Infinity; return; }  // a clear run-up to the gate
      const gap = () => s * rand(0.95, 1.6) + 70 * u;
      if (x >= st.ropeAt) {  // the crane brings a rope before a tall rock
        const px = x + s * 0.55, pillar = { kind: "pillar", x: px, w: 80 * u, h: 104 * u };
        st.obs.push(pillar);
        st.cranes.push({ x, state: "wait", ringY: WATER() - 165 * u, len: 55 * u, carry: 0, pillar });  // the crane carries the carp over this rock
        [0, 1, 2].forEach((k) => st.gems.push({ x: px - 10 * u + k * 45 * u, y: -150 * u }));
        st.next = px + 80 * u + gap();
        st.ropeAt = st.next + s * rand(7, 10);
        return;
      }
      const add = (kind, at) => {
        const o = kind === "rock" ? { kind, x: at, w: 52 * u, h: 40 * u } : { kind, x: at, w: 94 * u, h: 22 * u };
        st.obs.push(o);
        if (Math.random() < 0.6) [-0.6, 0, 0.6].forEach((f) => st.gems.push({ x: at + o.w / 2 + f * 55 * u, y: -(o.h + 58 * u + (1 - Math.abs(f)) * 26 * u) }));
        return o;
      };
      if (st.x > END() * 0.35 && Math.random() < 0.3) {  // later on: a rock, then a log right after
        add("rock", x);
        add("log", x + s * 1.15 + 30 * u);
        st.next = x + s * 1.15 + 124 * u + gap();
      } else {
        const o = add(Math.random() < 0.55 ? "rock" : "log", x);
        st.next = x + o.w + gap();
      }
    };
    const press = (repeat) => {
      if (!st || st.over || st.countdown > 0 || g.paused || repeat) return;
      const c = st.carp;
      if (!c.air && !c.rope) { c.air = true; c.vy = JUMP(); splash(7); }
    };
    const release = () => {  // a short tap gives a lower leap
      if (!st) return;
      const c = st.carp;
      if (c.air && !c.rope && c.vy > 260 * u) c.vy = 260 * u;
    };
    const hit = () => {
      const c = st.carp;
      c.inv = 1.4;
      c.oops = 0.6;
      st.lives -= 1;
      st.shake = calm ? 0 : 0.3;
      text(CX(), base() - SZ() * 1.15, "−1 ♥", "#d32f2f");
      if (st.lives <= 0) { st.over = true; st.endIn = 1.1; }
    };
    const step = (dt) => {
      if (!st || st.done) return;
      const c = st.carp, S = SZ(), b = base();
      st.fx = st.fx.filter((f) => (f.age += dt) < f.life);
      st.drops = st.drops.filter((d) => { d.vy += 900 * u * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt; return d.life > 0; });
      c.inv = Math.max(0, c.inv - dt);
      c.oops = Math.max(0, c.oops - dt);
      st.shake = Math.max(0, st.shake - dt);
      if (st.countdown > 0) { st.countdown -= dt; c.step += dt * 7; return; }
      // the carp: in the water, in the air, or hanging on the crane's rope
      if (c.rope) {
        const cr = c.rope;
        cr.carry += dt;
        cr.ringY += (WATER() - 175 * u - cr.ringY) * Math.min(1, dt * 6);
        cr.len += (38 * u - cr.len) * Math.min(1, dt * 5);
        c.y = b - (cr.ringY + 0.88 * S);
        if (sx(cr.pillar.x) + cr.pillar.w < CX() - 0.3 * S || cr.carry > 3) {  // let go once its tall rock is behind the carp
          c.rope = null;
          c.air = true;
          c.vy = 60 * u;
          cr.state = "leave";
          st.vaults += 1;
          st.score += 5;
          text(CX(), b - c.y - S * 1.1, "+5 rope vault!", "#b77900", true);
        }
      } else if (c.air) {
        c.vy -= GRAV() * dt;
        c.y += c.vy * dt;
        if (c.y <= 0 && c.vy < 0) { c.y = 0; c.vy = 0; c.air = false; splash(9); }
      }
      c.step += dt * (c.air || c.rope ? 0 : 9);
      if (st.over) {  // lost, or through the gate: the river stops, the last moment plays out
        st.endIn -= dt;
        if (st.endIn <= 0) finish();
        return;
      }
      st.t += dt;
      st.speed = (280 + 90 * Math.min(1, st.x / END())) * u;
      st.x += st.speed * dt;
      while (st.next < st.x + W + 300 * u) spawn();
      // the cranes: wait with the rope down, carry the carp, then fly away
      const gx = CX() + 0.18 * S, gy = b - c.y - 0.88 * S;  // where the carp grabs: the raised fin above its head
      st.cranes = st.cranes.filter((cr) => {
        if (cr.state === "wait") {
          cr.ringY = WATER() - 165 * u + Math.sin(st.t * 2.2 + cr.x) * 4 * u;
          if (c.air && !c.rope && Math.abs(gx - sx(cr.x)) < 28 * u && Math.abs(gy - cr.ringY) < 30 * u) {
            c.rope = cr;
            c.air = false;
            c.vy = 0;
            cr.state = "carry";
            text(CX(), cr.ringY - 40 * u, "Grab!", "#0b55ad");
          }
          return sx(cr.x) > -140 * u;
        }
        if (cr.state === "carry") { cr.x = st.x + 0.18 * S; return true; }
        cr.x += st.speed * 0.7 * dt;  // leave: up and ahead
        cr.ringY -= 190 * u * dt;
        cr.len += (12 * u - cr.len) * Math.min(1, dt * 4);
        return cr.ringY > -160 * u;
      });
      // rocks, logs and tall rocks
      const hx = CX() + 0.06 * S, hy = b - c.y - 0.5 * S, r = 0.25 * S;
      if (!c.rope && c.inv <= 0) {
        for (const o of st.obs) {
          const pad = o.kind === "rock" ? 6 * u : 2 * u, x0 = sx(o.x) + pad, x1 = sx(o.x) + o.w - pad, y0 = WATER() - o.h, y1 = WATER() + 30 * u;
          const nx = clamp(hx, x0, x1), ny = clamp(hy, y0, y1);
          if ((hx - nx) ** 2 + (hy - ny) ** 2 < r * r) { hit(); break; }
        }
      }
      st.gems = st.gems.filter((p) => {
        const px = sx(p.x), py = WATER() + p.y;
        if ((hx - px) ** 2 + (hy - py) ** 2 < (r + 9 * u) ** 2) { st.pearls += 1; st.score += 1; text(px, py - 10 * u, "+1", "#b77900"); return false; }
        return px > -30 * u;
      });
      st.obs = st.obs.filter((o) => sx(o.x) + o.w > -60 * u);
      // the Dragon Gate: one big leap through it
      const gxs = sx(END());
      if (!st.leap && gxs - CX() < st.speed * 0.62 && !c.air && !c.rope) { st.leap = true; c.air = true; c.vy = 760 * u; splash(12); }
      if (gxs < CX() - 30 * u && !st.won) {  // past the gate (with or without the big leap)
        st.won = true;
        st.over = true;
        st.endIn = 2.4;
        text(W / 2, H * 0.3, "Cá chép hóa rồng!", "#f5b400", true, 2.4);
        if (!calm) for (let i = 0; i < 26; i += 1) st.drops.push({ x: CX() + rand(-60, 60) * u, y: b - c.y - S * 0.6, vx: rand(-160, 160) * u, vy: -rand(100, 320) * u, life: rand(0.8, 1.6), gold: true });
      }
    };

    // drawing
    const ridge = (color, baseY, par, pts, amp) => {
      const P = Math.max(W, 600 * u) * 1.5, stp = P / pts.length, off = -(((st ? st.x : 0) * par) % P);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-10, WATER());
      for (let k = 0; k <= pts.length * 2; k += 1) ctx.lineTo(off + k * stp, baseY - pts[k % pts.length] * amp);
      ctx.lineTo(W + 10, WATER());
      ctx.closePath();
      ctx.fill();
    };
    const rock = (x, wy, w, h, tall) => {
      ctx.fillStyle = col.rock;
      ctx.beginPath();
      ctx.moveTo(x, wy + 10 * u);
      ctx.lineTo(x + w * 0.08, wy - h * 0.55);
      ctx.lineTo(x + w * 0.3, wy - h);
      ctx.lineTo(x + w * 0.72, wy - h * 0.94);
      ctx.lineTo(x + w * 0.95, wy - h * 0.45);
      ctx.lineTo(x + w, wy + 10 * u);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = col.rockHi;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, wy - h);
      ctx.lineTo(x + w * 0.5, wy - h * 0.96);
      ctx.lineTo(x + w * 0.36, wy - h * 0.4);
      ctx.lineTo(x + w * 0.16, wy - h * 0.5);
      ctx.closePath();
      ctx.fill();
      if (tall) { ctx.fillStyle = col.moss; ctx.beginPath(); ctx.ellipse(x + w * 0.5, wy - h * 0.97, w * 0.28, 6 * u, 0, 0, Math.PI * 2); ctx.fill(); }
    };
    const log = (x, wy, w, h) => {
      ctx.fillStyle = col.log;
      roundRect(ctx, x, wy - h, w, h + 8 * u, (h + 8 * u) / 2);
      ctx.fill();
      ctx.fillStyle = col.logHi;
      ctx.beginPath();
      ctx.ellipse(x + w - (h + 8 * u) / 2, wy - h / 2 + 4 * u, (h + 8 * u) / 2.6, (h + 8 * u) / 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = col.log;
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath();
      ctx.arc(x + w - (h + 8 * u) / 2, wy - h / 2 + 4 * u, (h + 8 * u) / 5, 0, Math.PI * 2);
      ctx.stroke();
    };
    const gateArt = (gx, wy) => {
      if (gx < -260 * u || gx > W + 260 * u) return;
      const ph = 175 * u, half = 82 * u;
      ctx.fillStyle = "rgba(255,255,255,.55)";  // white water under the gate
      for (let i = 0; i < 9; i += 1) ctx.fillRect(gx - half + i * 20 * u, wy - 4 * u + ((st ? st.t : 0) * 60 + i * 13) % 10 * u, 10 * u, 3 * u);
      ctx.fillStyle = "#c62828";
      roundRect(ctx, gx - half - 10 * u, wy - ph, 20 * u, ph + 14 * u, 3 * u); ctx.fill();
      roundRect(ctx, gx + half - 10 * u, wy - ph, 20 * u, ph + 14 * u, 3 * u); ctx.fill();
      ctx.fillStyle = "#8e1b1b";
      ctx.fillRect(gx - half - 14 * u, wy - ph + 22 * u, 2 * half + 28 * u, 10 * u);
      ctx.fillStyle = "#d4a017";  // the curved roof
      ctx.beginPath();
      ctx.moveTo(gx - half - 44 * u, wy - ph - 20 * u);
      ctx.quadraticCurveTo(gx - half - 22 * u, wy - ph + 2 * u, gx - half, wy - ph - 2 * u);
      ctx.lineTo(gx + half, wy - ph - 2 * u);
      ctx.quadraticCurveTo(gx + half + 22 * u, wy - ph + 2 * u, gx + half + 44 * u, wy - ph - 20 * u);
      ctx.lineTo(gx + half + 20 * u, wy - ph - 30 * u);
      ctx.lineTo(gx - half - 20 * u, wy - ph - 30 * u);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#0b2a4a";
      roundRect(ctx, gx - 40 * u, wy - ph + 2 * u, 80 * u, 20 * u, 4 * u);
      ctx.fill();
      ctx.fillStyle = "#f5b400";
      ctx.textAlign = "center";
      ctx.font = `800 ${Math.round(12 * u)}px system-ui, sans-serif`;
      ctx.fillText("VŨ MÔN", gx, wy - ph + 16 * u);
    };
    const craneArt = (cr, t) => {
      const x = sx(cr.x), feet = cr.ringY - cr.len, sway = Math.sin(t * 2 + cr.x) * 5 * u;
      ctx.strokeStyle = col.rope;
      ctx.lineWidth = 2.2 * u;
      ctx.beginPath();
      ctx.moveTo(x, feet);
      ctx.quadraticCurveTo(x + sway, (feet + cr.ringY) / 2, x, cr.ringY - 9 * u);
      ctx.stroke();
      ctx.strokeStyle = col.gold;
      ctx.lineWidth = 3 * u;
      ctx.beginPath();
      ctx.arc(x, cr.ringY, 9 * u, 0, Math.PI * 2);
      ctx.stroke();
      const flap = Math.floor(t * 7) % 2, cs = 72 * u;  // wings up (joy pose) and spread (run frame) in turn
      if (flap) sprite(image("crane-moods", urlOf(crane.pose)), x - 4 * u, feet + 10 * u, cs, 1, 5, 0);
      else sprite(image("crane-sprite", urlOf(crane.sprite)), x - 4 * u, feet + 10 * u, cs, 1, 1, 1);
    };
    const paint = () => {
      if (!ctx) return;
      const t = now() / 1000, S = SZ(), wy = WATER(), X = st ? st.x : 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (st && st.shake > 0) ctx.translate(rand(-3, 3) * u, rand(-2, 2) * u);
      const sky = ctx.createLinearGradient(0, 0, 0, wy);
      sky.addColorStop(0, col.sky0);
      sky.addColorStop(1, col.sky1);
      ctx.fillStyle = sky;
      ctx.fillRect(-10, -10, W + 20, wy + 10);
      ctx.fillStyle = col.sun;
      ctx.beginPath();
      ctx.arc(W * 0.86, H * 0.15, 22 * u, 0, Math.PI * 2);
      ctx.fill();
      ridge(col.far, wy - 70 * u, 0.08, ridges.far, 70 * u);
      ridge(col.near, wy - 20 * u, 0.25, ridges.near, 42 * u);
      ctx.fillStyle = col.bank;
      ctx.fillRect(-10, wy - 9 * u, W + 20, 12 * u);
      ctx.strokeStyle = col.reed;
      ctx.lineWidth = 1.4 * u;
      ctx.beginPath();
      const rp = Math.max(W, 600 * u), roff = -((X * 0.6) % rp);
      reeds.forEach((r) => { const x = (((r.x + roff) % rp) + rp) % rp; ctx.moveTo(x, wy - 6 * u); ctx.lineTo(x + r.lean, wy - 6 * u - r.h); });
      ctx.stroke();
      const water = ctx.createLinearGradient(0, wy, 0, H);
      water.addColorStop(0, col.water0);
      water.addColorStop(1, col.water1);
      ctx.fillStyle = water;
      ctx.fillRect(-10, wy, W + 20, H - wy + 10);
      ctx.strokeStyle = col.wave;
      ctx.lineWidth = 1.5 * u;
      for (let row = 0; row < 3; row += 1) {
        const y = wy + (18 + row * 24) * u;
        ctx.beginPath();
        for (let x = -10; x <= W + 10; x += 14 * u) {
          const yy = y + Math.sin((x + X * (0.9 - row * 0.15)) / (26 * u) + row) * 2.4 * u;
          x === -10 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      if (st) {
        gateArt(sx(END()), wy);
        st.obs.forEach((o) => (o.kind === "log" ? log(sx(o.x), wy, o.w, o.h) : rock(sx(o.x), wy, o.w, o.h, o.kind === "pillar")));
        st.gems.forEach((p) => {
          const px = sx(p.x), py = wy + p.y;
          ctx.fillStyle = col.pearl;
          ctx.beginPath(); ctx.arc(px, py, 7 * u, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.85)";
          ctx.beginPath(); ctx.arc(px - 2.2 * u, py - 2.2 * u, 2.2 * u, 0, Math.PI * 2); ctx.fill();
        });
        st.cranes.forEach((cr) => craneArt(cr, t));
      }
      // the carp
      const c = st ? st.carp : { y: 0, air: false, rope: null, inv: 0, oops: 0, step: t * 7 };
      const bottom = base() - c.y + (c.air || c.rope ? 0 : Math.sin(t * 3) * 2 * u);
      const swim = image("carp-sprite", urlOf(carp.sprite)), moods = image("carp-moods", urlOf(carp.pose));
      if (st && st.won) {
        const glow = ctx.createRadialGradient(CX(), bottom - S * 0.5, 4 * u, CX(), bottom - S * 0.5, S);
        glow.addColorStop(0, "rgba(255,213,79,.8)");
        glow.addColorStop(1, "rgba(255,213,79,0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(CX(), bottom - S * 0.5, S, 0, Math.PI * 2); ctx.fill();
      }
      if (!(c.inv > 0 && Math.floor(t * 12) % 2)) {
        if (c.oops > 0) sprite(moods, CX(), bottom, S, 1, 2, 0);
        else if (c.rope) sprite(moods, CX(), bottom, S, 1, 0, 0);
        else if (c.air) sprite(moods, CX(), bottom, S, 1, 5, 0);
        else sprite(swim, CX(), bottom, S, 1, Math.floor(c.step) % 4, 1);
      }
      ctx.fillStyle = col.front;  // the river in front: the carp and the rocks sit in the water
      ctx.fillRect(-10, wy + 3 * u, W + 20, H - wy);
      ctx.strokeStyle = col.wave;
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      for (let x = -10; x <= W + 10; x += 12 * u) { const yy = wy + 2 * u + Math.sin((x + X) / (20 * u)) * 1.6 * u; x === -10 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
      ctx.stroke();
      if (!st) return;
      st.drops.forEach((d) => { ctx.fillStyle = d.gold ? col.gold : col.drop; ctx.beginPath(); ctx.arc(d.x, d.y, (d.gold ? 3 : 2.4) * u, 0, Math.PI * 2); ctx.fill(); });
      ctx.textAlign = "center";
      st.fx.forEach((f) => {
        ctx.globalAlpha = Math.max(0, 1 - f.age / f.life);
        ctx.fillStyle = f.color;
        ctx.font = `800 ${Math.round((f.big ? (f.life > 2 ? 30 : 17) : 15) * Math.max(0.8, u))}px system-ui, sans-serif`;
        ctx.fillText(f.s, f.x, f.y - (f.life > 2 ? 0 : f.age * 40 * u));
      });
      ctx.globalAlpha = 1;
      // the way to the gate
      const bx = 12 * u, bw = Math.min(W * 0.42, 300 * u), by = 14 * u, frac = meters() / METERS;
      ctx.fillStyle = col.bar;
      roundRect(ctx, bx, by, bw, 7 * u, 3.5 * u); ctx.fill();
      ctx.fillStyle = col.fill;
      roundRect(ctx, bx, by, Math.max(7 * u, bw * frac), 7 * u, 3.5 * u); ctx.fill();
      ctx.fillStyle = "#c62828";
      ctx.fillRect(bx + bw + 6 * u, by - 4 * u, 4 * u, 15 * u);
      ctx.fillRect(bx + bw + 16 * u, by - 4 * u, 4 * u, 15 * u);
      ctx.fillStyle = "#d4a017";
      ctx.fillRect(bx + bw + 3 * u, by - 7 * u, 20 * u, 4 * u);
      if (st.countdown > 0 && !st.over) {
        ctx.fillStyle = col.text;
        ctx.font = `800 ${Math.round(54 * Math.max(0.7, u))}px system-ui, sans-serif`;
        ctx.fillText(st.countdown > 1.2 ? "3" : st.countdown > 0.6 ? "2" : "1", W / 2, H * 0.4);
      }
    };
    const finish = () => {
      st.done = true;
      const score = total(), best = score > care.bestGate;
      care.bestGate = Math.max(care.bestGate, score);
      cheer([carp, crane]);
      g.hud.best.textContent = care.bestGate;
      const head = st.won ? `<h3>Vượt Vũ Môn!</h3><p>The carp leapt through the Dragon Gate and became a dragon.</p>`
        : `<h3>Swam ${meters()} of ${METERS} m</h3><p>The river won this time. Leap a little earlier, hold for higher leaps, and grab the crane's rope before tall rocks.</p>`;
      g.show(head + `<p class="mascot-game-score">Score <b>${score}</b>${best ? " · new best!" : ` · best ${care.bestGate}`}</p>` +
        `<p>${st.pearls} pearl${st.pearls === 1 ? "" : "s"}, ${st.vaults} rope vault${st.vaults === 1 ? "" : "s"}.</p>` +
        `<button type="button" class="button" data-g="start">Play again</button> <button type="button" class="button button-quiet" data-g="close">Close</button>`);
    };
    const g = gameDialog({
      id: "gate", title: (info.name || "Dragon Gate") + (info.vi ? " · " + info.vi : ""),
      label: "Game field: the golden carp swims up the river to the Dragon Gate; the crane lowers a rope over tall rocks",
      help: "Leap: Space, ↑ or tap; hold for a higher leap. Touch the crane's ring at the top of a leap to be carried. P pauses, Esc closes.",
      boxes: [["score", "Score"], ["dist", "Distance"], ["lives", "Lives"], ["best", "Best"]],
      fit: () => {
        ({ W, H, u, dpr, ctx } = g);
        ridges = { far: Array.from({ length: 14 }, () => rand(0.35, 1)), near: Array.from({ length: 20 }, () => rand(0.3, 1)) };
        reeds = Array.from({ length: Math.ceil(Math.max(W, 600 * u) / (9 * u)) }, (_, i) => ({ x: i * 9 * u + rand(-3, 3) * u, h: rand(6, 15) * u, lean: rand(-3, 3) * u }));
      },
      open: () => {
        col = colors();
        st = null;
        g.hud.best.textContent = care.bestGate;
        g.hud.score.textContent = 0;
        g.hud.dist.textContent = "0 m";
        g.hud.lives.textContent = "♥♥♥";
        g.show(`<h3>Swim to the Dragon Gate</h3><p>Leap over rocks and logs. Before a tall rock the crane lowers a rope: leap and grab the ring to fly across.</p>` +
          `<ul class="mascot-game-legend"><li><i class="is-rock"></i>Rock or log: leap over it</li><li><i class="is-ring"></i>Crane's ring: grab it <b>+5</b></li>` +
          `<li><i class="is-pearl"></i>Pearl <b>+1</b></li></ul><button type="button" class="button" data-g="start">Start · ${METERS} m</button>`);
      },
      start: () => { st = newRound(); },
      running: () => !!st && !st.over,
      step,
      paint,
      hud: () => {
        if (!st) return;
        g.hud.score.textContent = total();
        g.hud.dist.textContent = meters() + " m";
        g.hud.lives.textContent = "♥".repeat(Math.max(0, st.lives)) + "♡".repeat(3 - Math.max(0, st.lives));
      },
      key: (e, down) => {
        const k = e.key.toLowerCase();
        if (k === " " || k === "arrowup" || k === "w") { e.preventDefault(); if (down) press(e.repeat); else release(); }
        if (k === "p" && down) g.togglePause();
      },
      pointer: (type) => { if (type === "pointerdown") press(false); if (type === "pointerup" || type === "pointercancel") release(); },
      close: () => {
        const ended = st && st.done ? st : null;
        st = null;
        if (ended && visible()) {
          react(carp, ended.won ? "joy" : "thinking", ended.won ? "I passed the Dragon Gate!" : "So close! Let's try again.", 2800);
          react(crane, "joy", null, 2600);
        }
      },
    });
    return g;
  })();
  const games = { relay, gate: dragonGate };
  const anyGameOpen = () => Object.values(games).some((x) => x && x.isOpen());
})();
