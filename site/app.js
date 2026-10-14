// Page behaviour: point the download buttons at the visitor's platform, filter the games, the CRT
// toggle, placeholder art for games without screenshots, and the attract-mode scene in the hero.
(() => {
  const LABEL = Object.fromEntries([...document.querySelectorAll("#ridPick option")].map(o => [o.value, o.textContent]));

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  // ---------- Platform detection ----------
  let mobile = false;
  function guessRid() {
    const ua = navigator.userAgent;
    if (/Android|iPhone|iPad|iPod/i.test(ua)) { mobile = true; return "win-x64"; }
    if (/Windows/i.test(ua)) return /ARM64|aarch64/i.test(ua) ? "win-arm64" : (/WOW64|Win64|x64/i.test(ua) ? "win-x64" : "win-x86");
    if (/Mac OS X|Macintosh/i.test(ua)) return "osx-arm64"; // every Mac browser claims Intel; most Macs are Apple Silicon now
    if (/aarch64|arm64/i.test(ua)) return "linux-arm64";
    if (/armv7|armv6|armhf/i.test(ua)) return "linux-arm";
    return "linux-x64";
  }
  async function refineRid(rid) {
    const uad = navigator.userAgentData;
    if (!uad?.getHighEntropyValues) return rid;
    try {
      const v = await uad.getHighEntropyValues(["architecture", "bitness"]);
      const arm = v.architecture === "arm", p = (uad.platform || "").toLowerCase();
      if (p.includes("windows")) return arm ? "win-arm64" : (v.bitness === "32" ? "win-x86" : "win-x64");
      if (p.includes("mac")) return arm ? "osx-arm64" : "osx-x64";
      if (p.includes("linux") || p.includes("chrome os")) return arm ? (v.bitness === "32" ? "linux-arm" : "linux-arm64") : "linux-x64";
    } catch {}
    return rid;
  }

  const pick = document.getElementById("ridPick");
  const cards = [...document.querySelectorAll(".cab")].map(card => ({
    downloads: JSON.parse(card.dataset.downloads || "{}"),
    button: card.querySelector(".dl"),
  }));
  let detected = guessRid();
  let current = store.get("rid") || detected;
  pick.value = current;

  function paint() {
    for (const { downloads, button } of cards) {
      if (!button) continue;
      if (downloads[current]) {
        button.href = downloads[current];
        button.removeAttribute("aria-disabled");
        button.textContent = `⬇ ${LABEL[current]}`;
      } else {
        button.href = button.dataset.releases;
        button.setAttribute("aria-disabled", "true");
        button.textContent = `No ${LABEL[current]} build`;
      }
    }
    document.getElementById("detected").textContent = mobile ? "Phone or tablet" : LABEL[detected];
    document.getElementById("platformNote").textContent = mobile
      ? "These games are desktop programs. Pick the computer you'll play on."
      : current === detected
        ? "Download buttons below are set for this machine. Change it to grab a build for another computer."
        : `Buttons are set for ${LABEL[current]}, not this machine.`;
  }
  pick.addEventListener("change", () => { current = pick.value; store.set("rid", current); paint(); });
  paint();
  refineRid(detected).then(r => {
    if (r === detected) return;
    if (!store.get("rid")) { current = r; pick.value = r; }
    detected = r;
    paint();
  });

  // ---------- Finding a game: filter buttons, search and sort ----------
  const chips = [...document.querySelectorAll(".chip")];
  const cabinets = document.getElementById("cabinets");
  const all = [...cabinets.children];
  all.forEach((card, i) => card.dataset.order = i);
  const search = document.getElementById("gameSearch"), sort = document.getElementById("gameSort");
  const count = document.getElementById("gameCount"), noMatch = document.getElementById("noMatch");
  let filter = "all";
  const byText = k => (a, b) => a.dataset[k].localeCompare(b.dataset[k], undefined, { sensitivity: "base" });
  const SORTS = {
    // Newest repo first; the order in portfolio.json breaks ties and covers any without a date.
    new: (a, b) => (b.dataset.created || "").localeCompare(a.dataset.created || "") || a.dataset.order - b.dataset.order,
    az: byText("original"),
    year: (a, b) => a.dataset.year - b.dataset.year || byText("original")(a, b),
    publisher: (a, b) => byText("publisher")(a, b) || a.dataset.year - b.dataset.year,
  };
  function apply() {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const card of all) {
      const inGroup = filter === "all" || card.dataset.genre === filter || card.dataset.style === filter;
      const ok = inGroup && words.every(w => card.dataset.search.includes(w));
      card.hidden = !ok;
      if (ok) shown++;
    }
    const sorted = [...all].sort(SORTS[sort.value] ?? SORTS.new);
    if (sorted.some((c, i) => cabinets.children[i] !== c)) cabinets.append(...sorted);
    count.textContent = `${shown} ${shown === 1 ? "game" : "games"}`;
    noMatch.hidden = shown > 0;
  }
  for (const chip of chips) chip.addEventListener("click", () => {
    for (const c of chips) c.setAttribute("aria-pressed", String(c === chip));
    filter = chip.dataset.f;
    apply();
  });
  search.addEventListener("input", apply);
  sort.value = store.get("sort") || "new";
  sort.addEventListener("change", () => { store.set("sort", sort.value); apply(); });
  apply();

  // ---------- Compact tiles or full cards ----------
  const html = document.documentElement, viewBtn = document.getElementById("viewToggle");
  const setView = full => { html.classList.toggle("compact", !full); viewBtn.setAttribute("aria-pressed", String(full)); };
  setView(store.get("view") === "full");
  viewBtn.addEventListener("click", () => {
    const full = html.classList.contains("compact");
    setView(full);
    store.set("view", full ? "full" : "compact");
  });

  // A compact tile opens the whole card in a panel.
  const dialog = document.getElementById("gameDialog"), dialogBody = dialog.querySelector(".body");
  cabinets.addEventListener("click", e => {
    const open = e.target.closest(".open");
    if (!open || !html.classList.contains("compact")) return;
    const card = open.closest(".cab").cloneNode(true);
    card.removeAttribute("id");
    card.hidden = false;
    card.querySelector(".open")?.remove();
    card.querySelectorAll("canvas[data-placeholder]").forEach(cv => drawPlaceholder(cv, cv.dataset.placeholder));
    dialogBody.replaceChildren(card);
    dialog.showModal();
  });
  dialog.querySelector(".close").addEventListener("click", () => dialog.close());
  // A click on the dimmed page around the panel closes it too.
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  // A link to a game (from the high-score table, say) shows it whatever the filter.
  function reveal() {
    const target = location.hash.startsWith("#game-") && document.getElementById(location.hash.slice(1));
    if (target?.hidden) { search.value = ""; chips[0].click(); }
  }
  addEventListener("hashchange", reveal);
  reveal();

  // ---------- CRT toggle ----------
  const root = document.getElementById("top"), crtBtn = document.getElementById("crtToggle");
  const setCrt = on => { root.classList.toggle("crt", on); crtBtn.setAttribute("aria-pressed", String(on)); };
  setCrt(store.get("crt") !== "off");
  crtBtn.addEventListener("click", () => {
    const on = !root.classList.contains("crt");
    setCrt(on);
    store.set("crt", on ? "on" : "off");
  });

  // ---------- Placeholder art for games without a screenshot ----------
  function drawPlaceholder(canvas, kind) {
    const w = canvas.width, h = canvas.height, c = canvas.getContext("2d");
    c.fillStyle = "#000"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "rgba(92,225,255,.12)"; c.lineWidth = 1;
    for (let x = 0; x < w; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y < h; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.shadowBlur = 12;
    if (kind === "invader") {
      const rows = ["00100000100", "00010001000", "00111111100", "01101110110", "11111111111", "10111111101", "10100000101", "00011011000"];
      const s = 14, ox = (w - 11 * s) / 2, oy = 110;
      c.fillStyle = c.shadowColor = "#72ff8f";
      rows.forEach((r, y) => [...r].forEach((b, x) => b === "1" && c.fillRect(ox + x * s, oy + y * s, s - 2, s - 2)));
    } else {
      c.strokeStyle = c.shadowColor = "#5ce1ff"; c.lineWidth = 2;
      const P = [[360, 120], [250, 200], [470, 200], [300, 250], [420, 250], [360, 215]]; // a Cobra-ish wireframe
      const E = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 4], [0, 5], [1, 5], [2, 5], [3, 5], [4, 5]];
      c.beginPath(); for (const [a, b] of E) { c.moveTo(...P[a]); c.lineTo(...P[b]); } c.stroke();
    }
    c.shadowBlur = 0; c.fillStyle = "#7d91a5"; c.font = "26px VT323, monospace"; c.textAlign = "center";
    c.fillText("SCREENSHOT PENDING", w / 2, h - 40);
  }
  const placeholders = () => document.querySelectorAll("canvas[data-placeholder]").forEach(cv => drawPlaceholder(cv, cv.dataset.placeholder));
  placeholders();
  document.fonts?.ready.then(placeholders); // redraw once VT323 has loaded

  // ---------- Attract-mode vector scene ----------
  const cv = document.getElementById("attract"), cx = cv.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, ridge = [], rocks = [], sparks = [], stars = [], visible = true, running = false, last = 0, spawnWait = 0;
  const t0 = performance.now();
  const rand = (a, b) => a + Math.random() * (b - a);

  // Rocks come in three sizes, like the arcade game: big ones split into two medium, medium into two
  // small, and small ones burst into sparks. Fragments ignore collisions for a moment so they can separate.
  const BIG = 26, SMALLEST = 11, MAX_ROCKS = 14;
  function makeRock(x, y, size, vx, vy, immune = 0) {
    const n = 9;
    return { x, y, size, vx, vy, immune, a: rand(0, 6.3), va: rand(-.3, .3) * (BIG / size) ** .5,
             pts: Array.from({ length: n }, (_, i) => [i / n * Math.PI * 2, size * rand(.7, 1.1)]) };
  }
  function drift(speedLo, speedHi) {
    const ang = rand(0, Math.PI * 2), sp = rand(speedLo, speedHi);
    return [Math.cos(ang) * sp, Math.sin(ang) * sp * .6];
  }
  const bigRocks = () => W < 600 ? 3 : 5;
  function burst(x, y, n, speed) {
    for (let i = 0; i < n; i++) {
      const ang = rand(0, Math.PI * 2), sp = rand(speed * .4, speed);
      sparks.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(.5, 1.1), age: 0 });
    }
  }
  function shatter(r, from) {
    // Push the pieces away from whatever hit this rock, plus a little sideways spread.
    let dx = r.x - from.x, dy = r.y - from.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    burst(r.x, r.y, r.size >= SMALLEST * 1.6 ? 12 : 18, 90);
    if (r.size < SMALLEST * 1.6 || rocks.length >= MAX_ROCKS) return [];
    const size = r.size * .58;
    return [1, -1].map(side => {
      const kick = rand(14, 24), spread = rand(6, 12) * side;
      return makeRock(r.x + dx * size * .5 - dy * size * side * .6, r.y + dy * size * .5 + dx * size * side * .6, size,
                      r.vx * .5 + dx * kick - dy * spread, r.vy * .5 + dy * kick + dx * spread, 2);
    });
  }
  function collide() {
    for (let i = 0; i < rocks.length; i++) {
      const a = rocks[i];
      if (a.immune > 0) continue;
      for (let j = i + 1; j < rocks.length; j++) {
        const b = rocks[j];
        if (b.immune > 0) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < (a.size + b.size) * .8) {
          const pieces = [...shatter(a, b), ...shatter(b, a)];
          rocks.splice(j, 1); rocks.splice(i, 1);
          rocks.push(...pieces);
          return; // one collision per frame is plenty; the list just changed
        }
      }
    }
  }
  function replenish(dt) {
    // Keep a few big rocks around: when collisions have used them up, float a new one in from a side.
    spawnWait -= dt;
    if (spawnWait > 0 || rocks.filter(r => r.size >= BIG * .9).length >= bigRocks() || rocks.length >= MAX_ROCKS) return;
    spawnWait = rand(2, 5);
    const left = Math.random() < .5, [vx, vy] = drift(9, 16);
    rocks.push(makeRock(left ? -38 : W + 38, rand(0, H * .55), rand(BIG, 40), Math.abs(vx) * (left ? 1 : -1), vy, 1));
  }

  function layout() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ridge = []; let y = H * .82;
    for (let x = 0; x <= W + 40; x += 40) { y = Math.min(H - 12, Math.max(H * .66, y + rand(-36, 36))); ridge.push([x, y]); }
    const padAt = Math.floor(ridge.length * .72); // a flat landing pad
    if (ridge[padAt + 1]) ridge[padAt + 1][1] = ridge[padAt][1];
    stars = Array.from({ length: Math.round(W * H / 9000) }, () => [rand(0, W), rand(0, H * .62), rand(.3, 1)]);
    rocks = Array.from({ length: bigRocks() + 3 }, (_, i) => {
      const [vx, vy] = drift(8, 16);
      return makeRock(rand(0, W), rand(0, H * .55), i < bigRocks() ? rand(BIG, 40) : rand(16, 24), vx, vy);
    });
    sparks = [];
  }
  const beam = (color, blur) => { cx.strokeStyle = color; cx.shadowColor = color; cx.shadowBlur = blur; };

  function frame(now) {
    const t = (now - t0) / 1000;
    // Seconds since the last frame, so the rocks drift at the same speed on 60 Hz and 144 Hz screens.
    // Capped so a long pause (hidden tab, scrolled away) doesn't make them jump.
    const dt = last ? Math.min((now - last) / 1000, .05) : 0;
    last = now;
    cx.clearRect(0, 0, W, H);
    cx.shadowBlur = 0;
    for (const [x, y, b] of stars) { cx.fillStyle = `rgba(213,227,238,${b * (.6 + .4 * Math.sin(t * 2 + x))})`; cx.fillRect(x, y, 1.5, 1.5); }

    // perspective grid floor
    beam("rgba(20,48,74,1)", 0); cx.lineWidth = 1;
    const hz = H * .9;
    for (let i = -12; i <= 12; i++) { cx.beginPath(); cx.moveTo(W / 2 + i * 30, hz); cx.lineTo(W / 2 + i * 160, H); cx.stroke(); }
    for (let k = 0; k < 5; k++) {
      const yy = hz + (H - hz) * ((k + (still ? 0 : t * .5) % 1) / 5) ** 1.6;
      cx.beginPath(); cx.moveTo(0, yy); cx.lineTo(W, yy); cx.stroke();
    }

    // asteroids
    if (!still) {
      for (const r of rocks) {
        // Drift, wrapping around a band 40px wider than the screen on each side so rocks leave and re-enter smoothly.
        const spanX = W + 80, spanY = H * .6;
        r.x = (((r.x + 40 + r.vx * dt) % spanX) + spanX) % spanX - 40;
        r.y = (((r.y + r.vy * dt) % spanY) + spanY) % spanY;
        r.a += r.va * dt;
        r.immune -= dt;
      }
      collide();
      replenish(dt);
    }
    beam("rgba(213,227,238,.85)", 6); cx.lineWidth = 1.5;
    for (const r of rocks) {
      cx.beginPath();
      r.pts.forEach(([ang, rad], i) => { const X = r.x + Math.cos(ang + r.a) * rad, Y = r.y + Math.sin(ang + r.a) * rad; i ? cx.lineTo(X, Y) : cx.moveTo(X, Y); });
      cx.closePath(); cx.stroke();
    }

    // collision sparks
    sparks = sparks.filter(sp => (sp.age += dt) < sp.life);
    for (const sp of sparks) {
      sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      const fade = 1 - sp.age / sp.life;
      beam(`rgba(255,200,120,${fade})`, 12);
      cx.lineWidth = 2;
      cx.beginPath(); cx.moveTo(sp.x, sp.y); cx.lineTo(sp.x - sp.vx * .1, sp.y - sp.vy * .1); cx.stroke();
    }

    // mountains and the landing pad
    beam("#ffb347", 10); cx.lineWidth = 1.6;
    cx.beginPath(); ridge.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y)); cx.stroke();
    const pad = Math.floor(ridge.length * .72), [px, py] = ridge[pad] || [W * .7, H * .8];
    beam("#72ff8f", 12); cx.lineWidth = 3; cx.beginPath(); cx.moveTo(px, py); cx.lineTo(px + 40, py); cx.stroke();

    // the lander: descends toward the pad, then starts over
    const cycle = 14, p = still ? .55 : (t % cycle) / cycle;
    // q runs 0 to 1 over the descent and holds at 1 once landed, so the lander sits still on the pad.
    // Resting height: the feet (ly + 14) sit on the pad, allowing for half of each line's width.
    const q = Math.min(1, p * 1.15), rest = py - 14 - 2.3;
    const lx = px + 20 + Math.sin(q * 6) * 30 * (1 - q), ly = H * .12 + (rest - H * .12) * q;
    beam("#5ce1ff", 12); cx.lineWidth = 1.6;
    cx.beginPath();
    cx.moveTo(lx - 9, ly - 8); cx.lineTo(lx + 9, ly - 8); cx.lineTo(lx + 12, ly); cx.lineTo(lx - 12, ly); cx.closePath();
    cx.moveTo(lx - 10, ly); cx.lineTo(lx - 16, ly + 14); cx.moveTo(lx + 10, ly); cx.lineTo(lx + 16, ly + 14);
    cx.moveTo(lx - 19, ly + 14); cx.lineTo(lx - 13, ly + 14); cx.moveTo(lx + 13, ly + 14); cx.lineTo(lx + 19, ly + 14);
    cx.stroke();
    if (!still && p < .85 && Math.sin(t * 40) > -.3) {
      beam("#ff4fd8", 14);
      cx.beginPath(); cx.moveTo(lx - 5, ly + 2); cx.lineTo(lx, ly + 10 + Math.random() * 10); cx.lineTo(lx + 5, ly + 2); cx.stroke();
    }

    // fade the left side so the hero text stays readable
    cx.shadowBlur = 0;
    const g = cx.createLinearGradient(0, 0, W * .75, 0);
    g.addColorStop(0, "rgba(5,8,13,.82)"); g.addColorStop(1, "rgba(5,8,13,0)");
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);

  }

  // One animation loop at most: it stops while the hero is off screen and restarts when it's back.
  function loop(now) {
    frame(now);
    if (!still && visible) requestAnimationFrame(loop);
    else { running = false; last = 0; }
  }
  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(loop);
  }

  layout();
  start();
  // Stop drawing while the hero is scrolled out of view.
  new IntersectionObserver(([e]) => {
    const was = visible; visible = e.isIntersecting;
    if (visible && !was) start();
  }).observe(cv);
  let rz;
  addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => { layout(); if (still || !visible) requestAnimationFrame(frame); else start(); }, 150);
  });
})();

// ---------- Copy buttons on the NuGet install lines ----------
(() => {
  for (const btn of document.querySelectorAll("button.copy[data-copy]")) {
    btn.hidden = false;
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = "Copied";
        btn.classList.add("done");
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("done"); }, 1600);
      } catch {
        // No clipboard: select the command so it can be copied by hand.
        const code = btn.parentElement.querySelector("code");
        const range = document.createRange();
        range.selectNodeContents(code);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      }
    });
  }
})();
