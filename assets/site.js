// PAIRS Lab website: navigation, publication filters, member tabs, carousel and search. No dependencies.
(function () {
  "use strict";
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // ---- mobile navigation ----
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      document.body.classList.toggle("nav-open", open);
    });
  }

  // ---- home hero slider ----
  var hero = document.querySelector("[data-hero]");
  if (hero) {
    var slides = $$("[data-slide]", hero);
    var heroDots = $$("[data-hero-dot]", hero);
    var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var current = 0, timer = null, paused = false;
    var show = function (i) {
      current = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) {
        var on = k === current;
        s.classList.toggle("is-active", on);
        s.setAttribute("aria-hidden", String(!on));
        $$("a, button", s).forEach(function (el) { el.tabIndex = on ? 0 : -1; });
        var v = s.querySelector("video");
        if (!v) return;
        if (on && !still) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        else v.pause();
      });
      heroDots.forEach(function (d, k) { d.setAttribute("aria-current", String(k === current)); });
    };
    var schedule = function () {
      clearTimeout(timer);
      if (!still && !paused) timer = setTimeout(function () { show(current + 1); schedule(); }, 8000);
    };
    hero.querySelector("[data-hero-prev]").addEventListener("click", function () { show(current - 1); schedule(); });
    hero.querySelector("[data-hero-next]").addEventListener("click", function () { show(current + 1); schedule(); });
    heroDots.forEach(function (d, k) { d.addEventListener("click", function () { show(k); schedule(); }); });
    hero.addEventListener("mouseenter", function () { paused = true; clearTimeout(timer); });
    hero.addEventListener("mouseleave", function () { paused = false; schedule(); });
    hero.addEventListener("focusin", function () { paused = true; clearTimeout(timer); });
    hero.addEventListener("focusout", function () { paused = false; schedule(); });
    var sx = null;
    hero.addEventListener("pointerdown", function (e) { sx = e.clientX; });
    hero.addEventListener("pointerup", function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx;
      sx = null;
      if (Math.abs(dx) > 50) { show(current + (dx < 0 ? 1 : -1)); schedule(); }
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden) clearTimeout(timer); else schedule(); });
    show(0);
    schedule();
  }

  // ---- research page: autoplay muted previews while visible, with a pause toggle ----
  var loops = $$("video[data-loop]");
  if (loops.length) {
    var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var stopped = calm;
    var visible = new Set();
    var sync = function (v) {
      if (!stopped && visible.has(v)) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      else v.pause();
    };
    var toggle = document.querySelector("[data-preview-toggle]");
    if (toggle) {
      toggle.hidden = false;
      var label = function () { toggle.textContent = stopped ? "Play previews" : "Pause previews"; };
      label();
      toggle.addEventListener("click", function () { stopped = !stopped; label(); loops.forEach(sync); });
    }
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target); sync(e.target); });
      }, { threshold: 0.35 });
      loops.forEach(function (v) { io.observe(v); });
    }
  }

  // ---- publication filters ----
  var form = document.getElementById("paper-filters");
  if (form) {
    form.hidden = false;
    var query = document.getElementById("paper-q");
    var type = document.getElementById("paper-type");
    var year = document.getElementById("paper-year");
    var count = document.getElementById("paper-count");
    var empty = document.getElementById("paper-empty");
    var topics = $$(".topic", form);
    var papers = $$(".paper");
    var groups = $$("[data-year-group]");
    var params = new URLSearchParams(window.location.search);
    var topic = params.get("topic") || "";
    if (params.get("q")) query.value = params.get("q");
    var apply = function () {
      var words = query.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      var shown = 0;
      papers.forEach(function (paper) {
        var ok = (type.value === "all" || (type.value === "review" ? paper.dataset.review === "1" : paper.dataset.type === type.value && paper.dataset.review === "0")) &&
          (year.value === "all" || paper.dataset.year === year.value) &&
          (!topic || paper.dataset.topics.split("|").indexOf(topic) !== -1) &&
          words.every(function (w) { return paper.dataset.search.indexOf(w) !== -1; });
        paper.hidden = !ok;
        if (ok) shown += 1;
      });
      groups.forEach(function (g) { g.hidden = !g.querySelector(".paper:not([hidden])"); });
      topics.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.topic === topic)); });
      count.textContent = shown + " of " + papers.length + " publications";
      empty.hidden = shown !== 0;
    };
    form.addEventListener("submit", function (e) { e.preventDefault(); });
    query.addEventListener("input", apply);
    type.addEventListener("change", apply);
    year.addEventListener("change", apply);
    topics.forEach(function (b) {
      b.addEventListener("click", function () { topic = topic === b.dataset.topic ? "" : b.dataset.topic; apply(); });
    });
    apply();
    if (window.location.hash) {
      var target = document.getElementById(window.location.hash.slice(1));
      if (target) target.scrollIntoView();
    }
  }

  // ---- member tabs ----
  var tabs = $$("[data-tab]");
  var panels = $$("[data-panel]");
  function showTab(name) {
    tabs.forEach(function (t) {
      var on = t.dataset.tab === name;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", String(on));
    });
    panels.forEach(function (p) { p.hidden = p.dataset.panel !== name; });
    carousels.forEach(function (c) { c.layout(); });
  }
  tabs.forEach(function (t) { t.addEventListener("click", function () { showTab(t.dataset.tab); }); });

  // ---- coverflow carousel ----
  var carousels = $$("[data-carousel]").map(function (root) {
    var cards = $$("[data-card]", root);
    var dots = $$("[data-dot]", root);
    var details = $$("[data-detail]", root.nextElementSibling);
    var panel = root.closest("[data-panel]");
    var active = 0;
    if (cards.length < 2) root.classList.add("is-single");
    var api = {
      root: root, panel: panel, cards: cards, details: details,
      layout: function () {
        var n = cards.length;
        var width = root.clientWidth || 1160;
        var unit = Math.max(0.42, Math.min(1, width / 1160));
        var spread = cards.length ? (cards[0].offsetWidth || 260) / 260 : 1;  // wider cards (photos) need wider spacing
        var maxVisible = width < 600 ? 2 : width < 900 ? 4 : 6;
        cards.forEach(function (card, i) {
          var o = i - active;
          if (o > n / 2) o -= n;
          if (o < -n / 2) o += n;
          var a = Math.abs(o), s = o < 0 ? -1 : 1;
          var x = a === 0 ? 0 : s * (225 + (a - 1) * 58) * unit * spread;
          var y = a === 0 ? 0 : 34 * unit;
          var z = a === 0 ? 40 : -70 - a * 55;
          var ry = a === 0 ? 0 : -s * Math.min(14 + a * 3, 32);
          var scale = a === 0 ? 1.08 : 0.86;
          card.style.transform = "translateX(" + x + "px) translateY(" + y + "px) translateZ(" + z + "px) rotateY(" + ry + "deg) scale(" + scale + ")";
          card.style.zIndex = String(100 - a);
          card.style.opacity = a > maxVisible ? "0" : "1";
          card.style.pointerEvents = a > maxVisible ? "none" : "";
          card.classList.toggle("is-active", a === 0);
          card.tabIndex = a === 0 ? 0 : -1;
        });
        dots.forEach(function (d, i) { d.setAttribute("aria-current", String(i === active)); });
        details.forEach(function (d, i) { d.hidden = i !== active; });
      },
      go: function (i) { active = (i + cards.length) % cards.length; api.layout(); }
    };
    cards.forEach(function (card, i) { card.addEventListener("click", function () { api.go(i); }); });
    dots.forEach(function (dot, i) { dot.addEventListener("click", function () { api.go(i); }); });
    root.querySelector("[data-prev]").addEventListener("click", function () { api.go(active - 1); });
    root.querySelector("[data-next]").addEventListener("click", function () { api.go(active + 1); });
    root.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { api.go(active - 1); e.preventDefault(); }
      if (e.key === "ArrowRight") { api.go(active + 1); e.preventDefault(); }
    });
    var startX = null;
    root.addEventListener("pointerdown", function (e) { startX = e.clientX; });
    root.addEventListener("pointerup", function (e) {
      if (startX === null) return;
      var dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) api.go(active + (dx < 0 ? 1 : -1));
    });
    api.layout();  // arrange the ring and show only the first item's details right away (pages without tabs)
    return api;
  });
  if (carousels.length) {
    window.addEventListener("resize", function () { carousels.forEach(function (c) { c.layout(); }); });
    var opened = false;
    var openBySlug = function (slug) {
      var hit = null;
      carousels.forEach(function (c) {
        c.details.forEach(function (d, i) {
          if (d.id === slug) { if (c.panel) showTab(c.panel.dataset.panel); c.go(i); opened = true; hit = c.root; }
        });
      });
      return hit;
    };
    var hash = decodeURIComponent(window.location.hash.slice(1));
    if (tabs.some(function (t) { return t.dataset.tab === hash; })) { showTab(hash); opened = true; }
    else if (hash) { var ring = openBySlug(hash); if (ring) ring.scrollIntoView({ block: "center" }); }
    if (!opened && tabs.length) showTab("people");

    // ---- member search (combobox) ----
    var box = document.querySelector("[data-member-search]");
    if (box) {
      box.hidden = false;
      var input = box.querySelector("input");
      var popup = box.querySelector(".member-search-popup");
      var list = box.querySelector("[role=listbox]");
      var none = box.querySelector(".member-search-empty");
      var people = [];
      carousels.forEach(function (c) {
        c.cards.forEach(function (card, i) {
          var role = c.details[i].querySelector(".carousel-role, .carousel-lead-title span");
          people.push({ name: card.getAttribute("aria-label").replace(/^Show /, ""), role: role ? role.textContent.replace(/:$/, "") : "",
            img: card.querySelector("img").getAttribute("src"), slug: c.details[i].id });
        });
      });
      var matches = [], cursor = -1;
      var close = function () { popup.hidden = true; input.setAttribute("aria-expanded", "false"); cursor = -1; };
      var choose = function (p) { input.value = p.name; close(); var ring = openBySlug(p.slug); if (ring) ring.scrollIntoView({ block: "center" }); };
      var draw = function () {
        var q = input.value.toLowerCase().trim();
        if (!q) { close(); return; }
        matches = people.filter(function (p) { return p.name.toLowerCase().indexOf(q) !== -1; });
        list.innerHTML = "";
        matches.forEach(function (p, i) {
          var opt = document.createElement("div");
          opt.setAttribute("role", "option");
          opt.id = "member-option-" + i;
          opt.setAttribute("aria-selected", String(i === cursor));
          var img = document.createElement("img"); img.src = p.img; img.alt = "";
          var label = document.createElement("span"); label.textContent = p.name;
          var small = document.createElement("small"); small.textContent = p.role; label.appendChild(small);
          opt.appendChild(img); opt.appendChild(label);
          opt.addEventListener("mousedown", function (e) { e.preventDefault(); choose(p); });
          list.appendChild(opt);
        });
        none.hidden = matches.length !== 0;
        popup.hidden = false;
        input.setAttribute("aria-expanded", "true");
        input.setAttribute("aria-activedescendant", cursor >= 0 ? "member-option-" + cursor : "");
      };
      input.addEventListener("input", function () { cursor = -1; draw(); });
      input.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown" && matches.length) { cursor = (cursor + 1) % matches.length; draw(); e.preventDefault(); }
        else if (e.key === "ArrowUp" && matches.length) { cursor = (cursor - 1 + matches.length) % matches.length; draw(); e.preventDefault(); }
        else if (e.key === "Enter") { e.preventDefault(); if (matches.length) choose(matches[Math.max(cursor, 0)]); }
        else if (e.key === "Escape") { close(); }
      });
      input.addEventListener("blur", function () { setTimeout(close, 120); });
    }
  }
})();
