// PAIRS Lab mascots: the crane and the buffalo (markup from scripts/build.py, data from "mascots" in data/lab.json).
// They walk, run, sit and wave along the bottom of the window. Fullness, energy and happiness (saved per browser) set
// their mood, shown with the six mood poses of <id>-moods.webp; feed, pet, nap, ride and team up change it.
// Landmark Relay is the minigame: the crane drops map landmarks from a drone and the buffalo catches them. No dependencies.
(() => {
  "use strict";
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

  const mascots = [...yard.querySelectorAll("[data-mascot]")].map((el) => ({
    id: el.dataset.mascot, name: el.dataset.name, vi: el.dataset.vi, food: el.dataset.food, foodIcon: el.dataset.foodIcon,
    ride: el.dataset.ride, rideLabel: el.dataset.rideLabel, hello: el.dataset.hello,
    el, body: el.querySelector(".mascot-body"), sprite: el.querySelector(".mascot-sprite"), pose: el.querySelector(".mascot-pose"),
    vehicle: el.querySelector(".mascot-ride"), say: el.querySelector(".mascot-say"),
    x: 0, fx: 0, dir: 1, state: "walk", step: 0, next: 0, until: 0, shown: "", poseIdx: 0, timer: 0,
    riding: false, hold: false, goal: null, saidAt: -1e9, taps: [],
  }));
  if (!mascots.length) return;
  const byId = Object.fromEntries(mascots.map((m) => [m.id, m]));
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
    s.best = +s.best || 0;
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
      const mv = MOVES[m.state], f = mv.steps[m.step % mv.steps.length][0], key = f + "/" + mv.row;
      if (key !== m.shown) { m.sprite.style.backgroundPosition = (f * 100) / 3 + "% " + (mv.row * 100) / 3 + "%"; m.shown = key; }
    }
    m.el.style.transform = "translateX(" + m.x.toFixed(1) + "px)";
  };
  const set = (m, state, t, ms, pose) => {
    m.state = state;
    m.step = 0;
    if (state === "pose" || state === "nap") m.poseIdx = Math.max(0, POSES.indexOf(pose || "calm"));
    m.next = MOVES[state] ? t + MOVES[state].steps[0][1] : Infinity;
    const span = LAST[state] || LAST.pose;
    m.until = t + (ms || rand(span[0], span[1]));
    draw(m);
  };
  const say = (m, text, ms) => {
    if (yard.hidden) return;
    m.say.textContent = text;
    m.say.hidden = false;
    m.say.style.removeProperty("--nudge");
    const r = m.say.getBoundingClientRect(), room = width() - 8;  // keep the bubble inside the window
    if (r.left < 8) m.say.style.setProperty("--nudge", 8 - r.left + "px");
    else if (r.right > room) m.say.style.setProperty("--nudge", room - r.right + "px");
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
      const mv = MOVES[m.state];
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
        if (visible()) { m.goal = null; set(m, "ride", t, m.hold ? 1e9 : 0); say(m, m.ride === "drone" ? "Up we go!" : "Let's roll!"); }
      } else if (visible()) { set(m, "wave", t); say(m, m.ride === "drone" ? "Landed!" : "Parked!"); }
      note(m, (m.riding ? `${m.name}: ${m.rideLabel.toLowerCase()}.` : `${m.name} is back on foot.`) + hiddenHint());
    },
  };
  const teamUp = () => {  // both walk to the middle and share a high five
    if (mascots.length < 2) return;
    const [a, b] = mascots.slice().sort((p, q) => p.x - q.x);
    mascots.forEach((m) => { m.hold = false; m.riding = false; });
    closePop();
    const done = () => {
      care.together += 1;
      mascots.forEach((m) => { const p = care.pets[m.id]; p.happy = clamp(p.happy + 10, 0, 100); });
      save();
      refresh();
    };
    if (!visible()) { done(); mascots.forEach((m) => note(m, "They practised a high five." + hiddenHint())); return; }
    const S = size(), mid = clamp((a.x + b.x) / 2, S * 0.5, width() - S * 1.5);
    let arrived = 0;
    const meet = (m, t) => {
      arrived += 1;
      set(m, "wave", t, 8000);  // waits for the other one (gives up after 8 s if it was called away)
      if (arrived < 2) return;
      const t2 = now();
      a.dir = 1;
      b.dir = -1;
      set(a, "pose", t2, 2300, "joy");
      set(b, "pose", t2, 2300, "joy");
      say(a, "Teamwork! ✋");
      burst(a, ["✋", "✦", "✦"], "spark");
      done();
    };
    const go = (m, x) => {
      const t = now();
      set(m, Math.abs(x - m.x) > S * 2.5 ? "run" : "walk", t, 1e9);
      m.goal = { x: clamp(x, 0, width() - S), then: meet };
    };
    go(a, mid - S * 0.4);
    go(b, mid + S * 0.4);
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
      `<span aria-hidden="true">${m.ride === "drone" ? "🚁 Fly" : "🚜 Drive"}</span></button></div>` +
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
    document.querySelectorAll("[data-mascot-best]").forEach((el) => { el.textContent = care.best; });
    document.querySelectorAll("[data-mascot-explored]").forEach((el) => { el.textContent = `${care.explored.length} / ${sections().length}`; });
  };

  let pop = null, popFor = null, popOpener = null;
  const placePop = () => {
    if (!pop || !popFor) return;
    const S = size(), w = pop.offsetWidth, vw = width();
    pop.style.left = clamp(popFor.x + S / 2 - w / 2, 8, Math.max(8, vw - w - 8)) + "px";
    pop.style.bottom = S * (popFor.riding ? 1.55 : 1.08) + 8 + "px";
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
    const extra = document.createElement("div");
    extra.className = "mascot-pop-more";
    extra.innerHTML = (mascots.length > 1 ? `<button type="button" data-more="team"><span aria-hidden="true">✋</span> Team up</button>` : "") +
      `<button type="button" data-more="play" aria-label="Play Landmark Relay, the minigame"><span aria-hidden="true">🎮</span> Landmark Relay</button>` +
      `<p>Pages explored: <b data-mascot-explored></b> · Best relay score: <b data-mascot-best></b></p>`;
    extra.addEventListener("click", (e) => {
      const b = e.target.closest("[data-more]");
      if (!b) return;
      if (b.dataset.more === "team") teamUp();
      else { closePop(false); relay.open(b); }
    });
    pop.appendChild(extra);
    pop.querySelector(".mascot-pop-close").addEventListener("click", () => closePop(true));
    pop.hidden = false;
    m.hold = true;
    m.goal = null;
    set(m, "wave", now());  // then it sits while the card is open (choose)
    refresh();
    placePop();
    pop.querySelector('[data-act="feed"]').focus({ preventScroll: true });
  };
  mascots.forEach((m) => {
    m.el.addEventListener("click", () => {
      if (pop && !pop.hidden && popFor === m) { closePop(false); return; }
      closePop(false);
      say(m, m.hello);
      openPop(m, m.el);
    });
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && pop && !pop.hidden && !relay.isOpen()) closePop(true); });

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

  // ---------- Members page: care blocks, mood buttons, team up and the game ----------
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
      else relay.open(b);
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
    const s = Array.isArray(saved[m.id]) ? saved[m.id] : [i ? 0.72 : 0.06, i ? -1 : 1, 0];
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

  // ---------- Landmark Relay (minigame) ----------
  const relay = (() => {
    const SECONDS = +yard.dataset.gameSeconds || 45;
    const crane = byId.crane || mascots[0], buffalo = byId.buffalo || mascots[mascots.length - 1];
    let box = null, cv = null, ctx = null, screen = null, hud = {}, opener = null, st = null, raf2 = 0, last2 = 0;
    let W = 760, H = 440, u = 1, kx = 1, ky = 1, dpr = 1, tufts = [], paused = false;  // u: sizes, kx and ky: speeds across and down
    const img = {};
    const image = (key, url) => { if (!img[key]) { img[key] = new Image(); img[key].src = url; } return img[key]; };
    const colors = () => {
      const dark = document.documentElement.dataset.theme === "dark";
      return dark
        ? { sky0: "#1d2a35", sky1: "#24323d", field: "#2f4a2a", water: "#2a4256", tuft: "#7fb069", text: "#e8e8e8", dot: "#7bcce4", shade: "rgba(0,0,0,.35)", arm: "#9fb3c8", rotor: "rgba(190,205,220,.55)" }
        : { sky0: "#dcecfb", sky1: "#f7fbff", field: "#9ccc65", water: "#b3e5fc", tuft: "#558b2f", text: "#0a2342", dot: "#0b55ad", shade: "rgba(6,26,54,.18)", arm: "#24364f", rotor: "rgba(36,54,79,.55)" };
    };
    let col = colors();

    const build = () => {
      box = document.createElement("div");
      box.className = "mascot-game";
      box.hidden = true;
      box.innerHTML = `<div class="mascot-game-box" role="dialog" aria-modal="true" aria-labelledby="mascot-game-title">` +
        `<header class="mascot-game-head"><div><p class="kicker">Lab mascots · minigame</p><h2 id="mascot-game-title">Landmark Relay</h2></div>` +
        `<p class="mascot-game-hud" aria-live="off"><span>Score <b data-g="score">0</b></span><span>Time <b data-g="time">${SECONDS}</b></span><span>Best <b data-g="best">0</b></span></p>` +
        `<button type="button" class="mascot-game-close" data-g="close" aria-label="Close the game">×</button></header>` +
        `<div class="mascot-game-stage"><canvas tabindex="0" role="img" aria-label="Game field: the crane drops landmarks from a drone, the buffalo catches them"></canvas>` +
        `<div class="mascot-game-screen" data-g="screen" role="status"></div></div>` +
        `<p class="mascot-game-help">Move the buffalo with ← → or A D, or with the mouse or a finger. Space pauses, Esc closes.</p></div>`;
      document.body.appendChild(box);
      cv = box.querySelector("canvas");
      ctx = cv.getContext("2d");
      screen = box.querySelector('[data-g="screen"]');
      ["score", "time", "best"].forEach((k) => { hud[k] = box.querySelector(`[data-g="${k}"]`); });
      box.addEventListener("click", (e) => {
        const b = e.target.closest("[data-g]");
        if (!b) { if (e.target === box) close(); return; }
        if (b.dataset.g === "close") close();
        if (b.dataset.g === "start") start();
        if (b.dataset.g === "resume") resume();
      });
      const aim = (e) => { if (!st) return; const r = cv.getBoundingClientRect(); st.target = clamp(e.clientX - r.left, 0, W); st.keys.l = st.keys.r = false; };
      cv.addEventListener("pointermove", aim);
      cv.addEventListener("pointerdown", (e) => { aim(e); if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId); });
      box.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); close(); return; }
        if (e.key === "Tab") {  // keep the focus inside the dialog
          const f = [...box.querySelectorAll("button:not([hidden])")].filter((b) => b.offsetParent);
          if (f.length && e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (f.length && !e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
          return;
        }
        if (!st || st.over) return;
        const k = e.key.toLowerCase();
        if (k === "arrowleft" || k === "a") { st.keys.l = true; st.target = null; e.preventDefault(); }
        if (k === "arrowright" || k === "d") { st.keys.r = true; st.target = null; e.preventDefault(); }
        if (k === " " && !e.target.closest("button")) { e.preventDefault(); paused ? resume() : pause(); }
      });
      box.addEventListener("keyup", (e) => {
        if (!st) return;
        const k = e.key.toLowerCase();
        if (k === "arrowleft" || k === "a") st.keys.l = false;
        if (k === "arrowright" || k === "d") st.keys.r = false;
      });
      document.addEventListener("visibilitychange", () => { if (document.hidden && st && !st.over) pause(); });
      window.addEventListener("resize", () => { if (!box.hidden) { fit(); paint(); } });
    };
    const fit = () => {
      const stage = cv.parentElement, oldW = W;
      W = Math.round(stage.clientWidth);
      H = Math.round(stage.clientHeight);
      kx = W / 760;
      ky = H / 440;
      u = Math.max(0.68, kx);  // phones: the field shrinks, the mascots and landmarks stay readable
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      tufts = Array.from({ length: Math.ceil(W / (16 * u)) }, (_, i) => ({ x: i * 16 * u + rand(-4, 4) * u, h: rand(9, 16) * u, lean: rand(-3, 3) * u }));
      if (st && oldW && oldW !== W) {  // keep everything where it was, in proportion
        const k = W / oldW;
        st.buf.x *= k; st.crane.x *= k; st.items.forEach((it) => { it.x *= k; });
        if (st.target != null) st.target *= k;
      }
    };
    const G = () => H - 38 * u;            // ground line
    const BUF = () => Math.max(60, 98 * u);  // buffalo size
    const DRONE_Y = () => 82 * u;

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
    const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
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
    const sprite = (im, cx, by, s, face, col2, row) => {
      if (!im.complete || !im.naturalWidth) return;
      ctx.save();
      ctx.translate(cx, by);
      if (face < 0) ctx.scale(-1, 1);
      ctx.drawImage(im, col2 * 200, row * 200, 200, 200, -s / 2, -s, s, s);
      ctx.restore();
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
      ctx.fillStyle = "#0b55ad"; rr(-19, -4, 38, 13, 6); ctx.fill();
      ctx.fillStyle = "#00b4cc"; rr(-15, -1, 30, 3, 1.5); ctx.fill();
      ctx.fillStyle = col.arm; ctx.beginPath(); ctx.arc(0, 12, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    const paint = () => {
      if (!ctx) return;
      const t = now() / 1000, S = BUF(), g = G();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (st && st.shake > 0) ctx.translate(rand(-3, 3) * u, rand(-2, 2) * u);
      const sky = ctx.createLinearGradient(0, 0, 0, g);
      sky.addColorStop(0, col.sky0);
      sky.addColorStop(1, col.sky1);
      ctx.fillStyle = sky;
      ctx.fillRect(-10, -10, W + 20, H + 20);
      if (st && st.graph.length) {  // the map they are building: a pose graph with landmarks and loop closures
        const P = (n) => [n.x * W, n.y * g], L = (n) => [n.lx * W, n.ly * g];
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
      ctx.fillRect(-10, g, W + 20, H - g + 10);
      ctx.fillStyle = col.water;
      ctx.fillRect(-10, g + 16 * u, W + 20, 5 * u);
      ctx.strokeStyle = col.tuft;
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      tufts.forEach((f) => { ctx.moveTo(f.x, g + 2 * u); ctx.lineTo(f.x + f.lean - 3 * u, g - f.h); ctx.moveTo(f.x, g + 2 * u); ctx.lineTo(f.x + f.lean + 3 * u, g - f.h * 0.85); });
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
      ctx.ellipse(b.x, g + 3 * u, S * 0.3, 5 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      const moods = image("buffalo-moods", urlOf(buffalo.pose)), walk = image("buffalo-sprite", urlOf(buffalo.sprite));
      if (b.oops > 0) sprite(moods, b.x, g + 4 * u, S, b.face, 2, 0);
      else if (b.joy > 0) sprite(moods, b.x, g + 4 * u, S, b.face, 5, 0);
      else if (Math.abs(b.vx) > 220 * kx) sprite(walk, b.x, g + 4 * u, S, b.face, Math.floor(b.step) % 4, 1);
      else if (Math.abs(b.vx) > 20 * kx) sprite(walk, b.x, g + 4 * u, S, b.face, Math.floor(b.step) % 4, 0);
      else sprite(moods, b.x, g + 4 * u, S, b.face, 0, 0);
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
    const loop = (t) => {
      const dt = last2 ? Math.min(0.1, (t - last2) / 1000) : 0;  // slow frames slow the game a little, never jump it
      last2 = t;
      if (st && !st.over && !paused) step(dt);
      paint();
      if (st) {
        hud.score.textContent = st.score;
        hud.time.textContent = Math.ceil(st.left);
      }
      raf2 = window.requestAnimationFrame(loop);
    };
    const showScreen = (html) => {
      screen.innerHTML = html;
      screen.hidden = !html;
      const b = screen.querySelector("button");
      if (b) b.focus({ preventScroll: true });
    };
    const intro = () => showScreen(
      `<h3>Map the lab together</h3><p>The crane flies the drone and drops landmarks. Catch them with the buffalo.</p>` +
      `<ul class="mascot-game-legend"><li><i class="is-land"></i>Landmark <b>+1</b></li><li><i class="is-loop"></i>Loop closure <b>+5</b></li>` +
      `<li><i class="is-out"></i>Outlier <b>−2</b>, let it fall</li></ul><button type="button" class="button" data-g="start">Start · ${SECONDS} s</button>`);
    const start = () => {
      st = newRound();
      paused = false;
      showScreen("");
      cv.focus({ preventScroll: true });
    };
    const pause = () => { if (!st || st.over || paused) return; paused = true; showScreen(`<h3>Paused</h3><button type="button" class="button" data-g="resume">Resume</button>`); };
    const resume = () => { paused = false; last2 = 0; showScreen(""); cv.focus({ preventScroll: true }); };
    const finish = () => {
      st.over = true;
      const best = st.score > care.best;
      care.best = Math.max(care.best, st.score);
      care.games += 1;
      [crane, buffalo].forEach((m) => {
        const p = care.pets[m.id];
        p.happy = clamp(p.happy + 15, 0, 100);
        p.energy = clamp(p.energy - 12, 0, 100);
        p.full = clamp(p.full - 8, 0, 100);
      });
      save();
      refresh();
      hud.best.textContent = care.best;
      const built = st.dropped ? Math.round((100 * st.caught) / st.dropped) : 0;
      showScreen(`<h3>Map built: ${built}%</h3><p class="mascot-game-score">Score <b>${st.score}</b>${best ? " · new best!" : ` · best ${care.best}`}</p>` +
        `<p>${st.caught} of ${st.dropped} landmarks caught (${st.loops} loop closure${st.loops === 1 ? "" : "s"}); ${st.outCaught} outlier${st.outCaught === 1 ? "" : "s"} caught.</p>` +
        `<p class="mascot-game-small">Playing makes them hungry: feed them after the game.</p>` +
        `<button type="button" class="button" data-g="start">Play again</button> <button type="button" class="button button-quiet" data-g="close">Close</button>`);
    };
    const open = (from) => {
      if (!box) build();
      opener = from || document.activeElement;
      col = colors();
      st = null;
      paused = false;
      box.hidden = false;
      document.documentElement.classList.add("mascot-game-open");
      fit();
      hud.best.textContent = care.best;
      hud.score.textContent = 0;
      hud.time.textContent = SECONDS;
      intro();
      last2 = 0;
      window.cancelAnimationFrame(raf2);
      raf2 = window.requestAnimationFrame(loop);
    };
    const close = () => {
      if (!box || box.hidden) return;
      window.cancelAnimationFrame(raf2);
      box.hidden = true;
      document.documentElement.classList.remove("mascot-game-open");
      const score = st && st.over ? st.score : null;
      st = null;
      if (opener && opener.focus) opener.focus({ preventScroll: true });
      if (score !== null && visible()) { react(buffalo, "joy", `Great mapping! ${score} points.`, 2600); react(crane, "joy", null, 2600); }
    };
    return { open, close, isOpen: () => !!box && !box.hidden };
  })();
})();
