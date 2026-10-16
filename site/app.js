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

  // A compact tile, a game's or a tool's, opens the whole card in a panel.
  const dialog = document.getElementById("gameDialog"), dialogBody = dialog.querySelector(".body");
  document.addEventListener("click", e => {
    const open = e.target.closest(".cabinets .open");
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
  // A link to somewhere else on the page (a tool's NuGet badge) closes the panel on the way.
  dialog.addEventListener("click", e => { if (e.target.closest('a[href^="#"]')) dialog.close(); });
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

  // ---------- Attract-mode vector scenes ----------
  // Little vector games take turns behind the hero, in a shuffled order, cross-fading every SCENE_SECONDS: the
  // lander coming down to its pad, a ship clearing an asteroid field, an invader formation against a cannon, a
  // claw on the rim of a tempest tube, a tank's periscope, a star castle's rings, missiles falling on cities, a
  // trench run, a muncher in its maze, a marker cutting up a Qix's field, a ship over Defender's mountains,
  // light cycles on the grid, and a ship fighting Gravitar's gravity.
  // Each scene keeps its own state and clock, and only the one(s) on screen are stepped.
  const cv = document.getElementById("attract"), cx = cv.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, stars = [], visible = true, running = false, last = 0;
  const t0 = performance.now();
  const rand = (a, b) => a + Math.random() * (b - a);
  const wrap = (v, lo, span) => ((((v - lo) % span) + span) % span) + lo;
  const beam = (color, blur) => { cx.strokeStyle = color; cx.shadowColor = color; cx.shadowBlur = blur; };
  const SCENE_SECONDS = 15, FADE = 1.2;

  function drawStars(t, depth = .62) {
    cx.shadowBlur = 0;
    for (const [x, y, b] of stars) {
      if (y > H * depth) continue;
      cx.fillStyle = `rgba(213,227,238,${b * (.6 + .4 * Math.sin(t * 2 + x))})`;
      cx.fillRect(x, y, 1.5, 1.5);
    }
  }
  const sparkBurst = (list, x, y, n, speed, color) => {
    for (let i = 0; i < n; i++) {
      const ang = rand(0, Math.PI * 2), sp = rand(speed * .4, speed);
      list.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(.5, 1.1), age: 0, color });
    }
  };
  function drawSparks(list, dt) {
    for (let i = list.length - 1; i >= 0; i--) if ((list[i].age += dt) >= list[i].life) list.splice(i, 1);
    cx.lineWidth = 2;
    for (const sp of list) {
      sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      const fade = 1 - sp.age / sp.life;
      beam(`rgba(${sp.color ?? "255,200,120"},${fade})`, 12);
      cx.beginPath(); cx.moveTo(sp.x, sp.y); cx.lineTo(sp.x - sp.vx * .1, sp.y - sp.vy * .1); cx.stroke();
    }
  }

  // ----- The lander, coming down to its pad over the mountains -----
  const lander = {
    name: "LUNAR LANDER",
    layout() {
      this.ridge = []; let y = H * .82;
      for (let x = 0; x <= W + 40; x += 40) { y = Math.min(H - 12, Math.max(H * .66, y + rand(-36, 36))); this.ridge.push([x, y]); }
      const padAt = Math.floor(this.ridge.length * .72); // a flat landing pad
      if (this.ridge[padAt + 1]) this.ridge[padAt + 1][1] = this.ridge[padAt][1];
    },
    start() { this.t = 0; },
    draw(t, dt) {
      this.t += dt;
      drawStars(t);
      // perspective grid floor
      beam("rgba(20,48,74,1)", 0); cx.lineWidth = 1;
      const hz = H * .9;
      for (let i = -12; i <= 12; i++) { cx.beginPath(); cx.moveTo(W / 2 + i * 30, hz); cx.lineTo(W / 2 + i * 160, H); cx.stroke(); }
      for (let k = 0; k < 5; k++) {
        const yy = hz + (H - hz) * ((k + (still ? 0 : t * .5) % 1) / 5) ** 1.6;
        cx.beginPath(); cx.moveTo(0, yy); cx.lineTo(W, yy); cx.stroke();
      }
      // mountains and the landing pad
      const ridge = this.ridge;
      beam("#ffb347", 10); cx.lineWidth = 1.6;
      cx.beginPath(); ridge.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y)); cx.stroke();
      const pad = Math.floor(ridge.length * .72), [px, py] = ridge[pad] || [W * .7, H * .8];
      beam("#72ff8f", 12); cx.lineWidth = 3; cx.beginPath(); cx.moveTo(px, py); cx.lineTo(px + 40, py); cx.stroke();
      // the lander: descends toward the pad, sits a moment, then starts over
      const cycle = 14, p = still ? .55 : (this.t % cycle) / cycle;
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
    },
  };

  // ----- Asteroids: a ship clearing a rock field -----
  // Rocks come in three sizes: big ones split into two medium, medium into two small, and small ones burst
  // into sparks. The ship turns to lead the nearest rock, fires, and keeps its distance; if a rock gets it,
  // it comes apart and returns a moment later, blinking until it is safe.
  const BIG = 30, SMALLEST = 11, MAX_ROCKS = 16, SHOT = 380;
  function makeRock(x, y, size, vx, vy) {
    const n = 10;
    return { x, y, size, vx, vy, a: rand(0, 6.3), va: rand(-.4, .4) * (BIG / size) ** .5,
             pts: Array.from({ length: n }, (_, i) => [i / n * Math.PI * 2, size * rand(.7, 1.1)]) };
  }
  const asteroids = {
    name: "ASTEROIDS",
    layout() {
      const big = W < 600 ? 3 : 6;
      this.big = big;
      this.rocks = Array.from({ length: big + 2 }, (_, i) => {
        const ang = rand(0, 6.3), sp = rand(12, 26);
        // Keep clear of where the ship starts.
        let x, y;
        do { x = rand(0, W); y = rand(0, H); } while (Math.hypot(x - W * .68, y - H * .5) < 140);
        return makeRock(x, y, i < big ? rand(BIG, 42) : rand(16, 22), Math.cos(ang) * sp, Math.sin(ang) * sp);
      });
      this.ship = { x: W * .68, y: H * .5, vx: 0, vy: 0, a: -Math.PI / 2, alive: true, wait: 0, invul: 1.5, fire: 0, thrust: false };
      this.shots = []; this.sparks = []; this.debris = []; this.spawn = 0;
    },
    start() { if (!this.rocks) this.layout(); },
    // The shortest way across the wrapping screen.
    delta(ax, ay, bx, by) {
      let dx = bx - ax, dy = by - ay;
      if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
      if (dy > H / 2) dy -= H; else if (dy < -H / 2) dy += H;
      return [dx, dy];
    },
    split(r, dirX, dirY) {
      sparkBurst(this.sparks, r.x, r.y, r.size >= SMALLEST * 1.6 ? 10 : 16, 90);
      if (r.size < SMALLEST * 1.6 || this.rocks.length >= MAX_ROCKS) return [];
      const size = r.size * .58;
      return [1, -1].map(side => makeRock(r.x - dirY * side * size * .5, r.y + dirX * side * size * .5, size,
        r.vx * .6 + dirX * rand(8, 18) - dirY * side * rand(14, 26), r.vy * .6 + dirY * rand(8, 18) + dirX * side * rand(14, 26)));
    },
    step(dt) {
      const s = this.ship, rocks = this.rocks;
      for (const r of rocks) { r.x = wrap(r.x + r.vx * dt, -40, W + 80); r.y = wrap(r.y + r.vy * dt, -40, H + 80); r.a += r.va * dt; }
      // Keep a few big rocks coming in from the edges.
      this.spawn -= dt;
      if (this.spawn <= 0 && rocks.filter(r => r.size >= BIG * .9).length < this.big && rocks.length < MAX_ROCKS) {
        this.spawn = rand(1.5, 3.5);
        const left = Math.random() < .5, sp = rand(14, 26), ang = rand(-.6, .6);
        rocks.push(makeRock(left ? -40 : W + 40, rand(0, H), rand(BIG, 42), Math.cos(ang) * sp * (left ? 1 : -1), Math.sin(ang) * sp));
      }
      // The ship.
      if (!s.alive) {
        s.wait -= dt;
        if (s.wait <= 0) Object.assign(s, { alive: true, x: W * .68, y: H * .5, vx: 0, vy: 0, invul: 2.2 });
      } else {
        s.invul -= dt;
        let best = null, bd = Infinity;
        for (const r of rocks) { const [dx, dy] = this.delta(s.x, s.y, r.x, r.y), d = Math.hypot(dx, dy) - r.size; if (d < bd) { bd = d; best = [r, dx, dy]; } }
        let want = s.a;
        s.thrust = false;
        if (best) {
          const [r, dx, dy] = best, time = Math.hypot(dx, dy) / SHOT;
          want = Math.atan2(dy + (r.vy - s.vy) * time, dx + (r.vx - s.vx) * time);
          // Too close: turn tail and burn away.
          if (bd < 55) { want += Math.PI; s.thrust = true; }
        }
        // Drift back towards its home on the right when nothing presses.
        if (!s.thrust && Math.hypot(s.x - W * .68, s.y - H * .5) > 160) { s.vx += (W * .68 - s.x) * .15 * dt; s.vy += (H * .5 - s.y) * .15 * dt; }
        let err = Math.atan2(Math.sin(want - s.a), Math.cos(want - s.a));
        s.a += Math.max(-4 * dt, Math.min(4 * dt, err));
        if (s.thrust && Math.abs(err) < .5) { s.vx += Math.cos(s.a) * 160 * dt; s.vy += Math.sin(s.a) * 160 * dt; }
        s.vx *= 1 - .6 * dt; s.vy *= 1 - .6 * dt;
        s.x = wrap(s.x + s.vx * dt, 0, W); s.y = wrap(s.y + s.vy * dt, 0, H);
        s.fire -= dt;
        if (best && !s.thrust && Math.abs(err) < .12 && s.fire <= 0 && this.shots.length < 4) {
          s.fire = .24;
          this.shots.push({ x: s.x + Math.cos(s.a) * 12, y: s.y + Math.sin(s.a) * 12, vx: s.vx + Math.cos(s.a) * SHOT, vy: s.vy + Math.sin(s.a) * SHOT, age: 0 });
        }
        if (s.invul <= 0)
          for (const r of rocks) {
            const [dx, dy] = this.delta(s.x, s.y, r.x, r.y);
            if (Math.hypot(dx, dy) < r.size * .85 + 7) {
              s.alive = false; s.wait = 2;
              sparkBurst(this.sparks, s.x, s.y, 14, 110, "92,225,255");
              for (let i = 0; i < 5; i++) this.debris.push({ x: s.x, y: s.y, vx: rand(-60, 60), vy: rand(-60, 60), a: rand(0, 6.3), va: rand(-5, 5), len: rand(8, 14), age: 0 });
              break;
            }
          }
      }
      // Shots.
      for (const b of this.shots) { b.x = wrap(b.x + b.vx * dt, 0, W); b.y = wrap(b.y + b.vy * dt, 0, H); b.age += dt; }
      this.shots = this.shots.filter(b => {
        if (b.age > .9) return false;
        const i = rocks.findIndex(r => { const [dx, dy] = this.delta(b.x, b.y, r.x, r.y); return Math.hypot(dx, dy) < r.size * .9; });
        if (i < 0) return true;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        rocks.push(...this.split(rocks.splice(i, 1)[0], b.vx / sp, b.vy / sp));
        return false;
      });
      for (const d of this.debris) { d.x += d.vx * dt; d.y += d.vy * dt; d.a += d.va * dt; d.age += dt; }
      this.debris = this.debris.filter(d => d.age < 1.6);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, 1);
      beam("rgba(213,227,238,.85)", 6); cx.lineWidth = 1.5;
      for (const r of this.rocks) {
        cx.beginPath();
        r.pts.forEach(([ang, rad], i) => { const X = r.x + Math.cos(ang + r.a) * rad, Y = r.y + Math.sin(ang + r.a) * rad; i ? cx.lineTo(X, Y) : cx.moveTo(X, Y); });
        cx.closePath(); cx.stroke();
      }
      const s = this.ship;
      if (s.alive && (s.invul <= 0 || Math.sin(t * 25) > 0)) {
        const c = Math.cos(s.a) * 1.4, n = Math.sin(s.a) * 1.4, P = (f, side) => [s.x + c * f - n * side, s.y + n * f + c * side];
        beam("#5ce1ff", 12); cx.lineWidth = 1.6;
        cx.beginPath(); cx.moveTo(...P(14, 0)); cx.lineTo(...P(-9, -8)); cx.lineTo(...P(-5, 0)); cx.lineTo(...P(-9, 8)); cx.closePath(); cx.stroke();
        if (s.thrust && Math.sin(t * 50) > -.2) {
          beam("#ff4fd8", 12);
          cx.beginPath(); cx.moveTo(...P(-6, -4)); cx.lineTo(...P(-14 - Math.random() * 6, 0)); cx.lineTo(...P(-6, 4)); cx.stroke();
        }
      }
      beam("#ffffff", 8); cx.fillStyle = "#ffffff";
      for (const b of this.shots) cx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
      beam("rgba(92,225,255,.9)", 10); cx.lineWidth = 1.5;
      for (const d of this.debris) {
        const hx = Math.cos(d.a) * d.len / 2, hy = Math.sin(d.a) * d.len / 2;
        cx.globalAlpha *= 1 - d.age / 1.6;
        cx.beginPath(); cx.moveTo(d.x - hx, d.y - hy); cx.lineTo(d.x + hx, d.y + hy); cx.stroke();
        cx.globalAlpha /= Math.max(.001, 1 - d.age / 1.6);
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Invaders: a marching formation against a cannon behind its bunkers -----
  // The aliens are this site's own designs (three kinds, two frames each), drawn once into small glowing
  // sprites. The formation steps faster as it thins; the cannon picks a target, lines up, fires, and side-steps
  // bombs; a saucer crosses the top now and then.
  const ALIENS = [
    [["...XXXXX...", "..XXXXXXX..", ".XX..X..XX.", ".XX.XXX.XX.", ".XXXXXXXXX.", "..X.X.X.X..", ".X.X...X.X.", "..........."],
     ["...XXXXX...", "..XXXXXXX..", ".XX..X..XX.", ".XX.XXX.XX.", ".XXXXXXXXX.", "..X.X.X.X..", "...X.X.X...", "..........."]],
    [["X.........X", ".X..XXX..X.", "..XXXXXXX..", ".XXX.X.XXX.", "XXXXXXXXXXX", "X..XXXXX..X", "..X.....X..", "..........."],
     ["X.........X", ".X..XXX..X.", "..XXXXXXX..", ".XXX.X.XXX.", "XXXXXXXXXXX", ".X.XXXXX.X.", "X.X.....X.X", "..........."]],
    [["....XXX....", ".XXXXXXXXX.", "XXX.XXX.XXX", "XXXXXXXXXXX", "..XX.X.XX..", ".XX.....XX.", "XX.......XX", "..........."],
     ["....XXX....", ".XXXXXXXXX.", "XXX.XXX.XXX", "XXXXXXXXXXX", "..XX.X.XX..", "..X.....X..", "...X...X...", "..........."]],
  ];
  const ALIEN_COLOURS = ["#ff4fd8", "#5ce1ff", "#72ff8f"];
  const BUNKER = ["....XXXXXXXXXX....", "..XXXXXXXXXXXXXX..", ".XXXXXXXXXXXXXXXX.", "XXXXXXXXXXXXXXXXXX", "XXXXXXXXXXXXXXXXXX",
                  "XXXXXXXXXXXXXXXXXX", "XXXXXXXXXXXXXXXXXX", "XXXXX........XXXXX", "XXXX..........XXXX", "XXX............XXX"];
  const spriteCache = new Map();
  // The outline of a block of lit cells: an edge wherever a lit cell meets an unlit one, so pixel art
  // reads as wireframe.
  function outline(lit, w, h, line) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!lit(x, y)) continue;
        if (!lit(x, y - 1)) line(x, y, x + 1, y);
        if (!lit(x, y + 1)) line(x, y + 1, x + 1, y + 1);
        if (!lit(x - 1, y)) line(x, y, x, y + 1);
        if (!lit(x + 1, y)) line(x + 1, y, x + 1, y + 1);
      }
  }
  function sprite(kind, frame, px) {
    const key = `${kind}/${frame}/${px}`;
    if (spriteCache.has(key)) return spriteCache.get(key);
    const rows = ALIENS[kind][frame], pad = 8, c = document.createElement("canvas");
    c.width = 11 * px + pad * 2; c.height = 8 * px + pad * 2;
    const g = c.getContext("2d");
    g.strokeStyle = g.shadowColor = ALIEN_COLOURS[kind]; g.shadowBlur = 8; g.lineWidth = 1.3; g.lineCap = "square";
    const lit = (x, y) => rows[y]?.[x] === "X";
    g.beginPath();
    outline(lit, 11, 8, (x0, y0, x1, y1) => { g.moveTo(pad + x0 * px, pad + y0 * px); g.lineTo(pad + x1 * px, pad + y1 * px); });
    g.stroke();
    spriteCache.set(key, c);
    return c;
  }
  const invaders = {
    name: "INVADERS",
    layout() {
      const px = this.px = W < 700 ? 2 : 3;
      this.cw = 16 * px; this.ch = 13 * px;
      // On a wide screen they keep to the right, clear of the hero's words; on a phone they have it all.
      this.left = W < 700 ? W * .06 : W * .46; this.right = W - 16;
      this.cols = Math.max(4, Math.min(9, Math.floor((this.right - this.left) * .72 / this.cw)));
      this.ground = H - 18; this.gunY = H - 34;
      this.bunkers = [];
      const nb = W < 700 ? 2 : 4, span = this.right - this.left;
      for (let i = 0; i < nb; i++) {
        const bx = this.left + span * (i + .5) / nb - 9 * px, by = this.gunY - 48 - 10 * px;
        BUNKER.forEach((r, y) => [...r].forEach((ch, x) => ch === "X" && this.bunkers.push({ x: bx + x * px, y: by + y * px, b: i, gx: x, gy: y })));
      }
      this.gun = { x: (this.left + this.right) / 2, alive: true, wait: 0, target: null };
      this.newWave();
      this.ufo = null; this.ufoWait = rand(6, 10);
    },
    start() { if (!this.aliens) this.layout(); },
    newWave() {
      this.aliens = [];
      for (let r = 0; r < 5; r++) for (let c = 0; c < this.cols; c++) this.aliens.push({ r, c, kind: r === 0 ? 0 : r < 3 ? 1 : 2, alive: true });
      this.fx = this.left; this.fy = H * .07; this.dir = 1; this.frame = 0; this.stepWait = 0;
      this.shot = null; this.bombs = []; this.booms = []; this.sparks = this.sparks ?? []; this.restart = 0;
    },
    pos(a) { return [this.fx + a.c * this.cw, this.fy + a.r * this.ch]; },
    step(dt) {
      const px = this.px, live = this.aliens.filter(a => a.alive);
      if (this.restart > 0) { this.restart -= dt; if (this.restart <= 0) this.newWave(); return; }
      if (!live.length) { this.restart = 1.5; return; }
      // March: a step at a time, faster as the formation thins; down a row at each edge.
      this.stepWait -= dt;
      if (this.stepWait <= 0) {
        this.stepWait = .04 + .5 * live.length / this.aliens.length;
        this.frame ^= 1;
        const xs = live.map(a => this.pos(a)[0]), lo = Math.min(...xs), hi = Math.max(...xs) + 11 * px;
        if ((this.dir > 0 && hi + 3 * px > this.right) || (this.dir < 0 && lo - 3 * px < this.left)) { this.dir *= -1; this.fy += 3 * px; }
        else this.fx += this.dir * 3 * px;
        // Down to the bunkers: they've landed, and it starts again.
        if (Math.max(...live.map(a => this.pos(a)[1])) + 8 * px > this.gunY - 50) { this.restart = 1.2; sparkBurst(this.sparks, this.gun.x, this.gunY, 20, 120, "114,255,143"); return; }
      }
      // Bombs from the bottom alien of a column.
      if (Math.random() < 1.1 * dt && this.bombs.length < 4) {
        const bottoms = Object.values(live.reduce((m, a) => ((!m[a.c] || m[a.c].r < a.r) && (m[a.c] = a), m), {}));
        const a = bottoms[Math.floor(Math.random() * bottoms.length)];
        if (a) { const [x, y] = this.pos(a); this.bombs.push({ x: x + 5.5 * px, y: y + 8 * px }); }
      }
      for (const b of this.bombs) b.y += 150 * dt;
      // The cannon: dodge a bomb overhead, otherwise line up under a target and fire.
      const g = this.gun;
      if (!g.alive) { g.wait -= dt; if (g.wait <= 0) g.alive = true; }
      else {
        const threat = this.bombs.find(b => b.y > this.gunY - 140 && Math.abs(b.x - g.x) < 16);
        let want;
        if (threat) want = g.x + (threat.x < g.x ? 40 : -40);
        else {
          if (!g.target || !g.target.alive) {
            const bottoms = Object.values(live.reduce((m, a) => ((!m[a.c] || m[a.c].r < a.r) && (m[a.c] = a), m), {}));
            g.target = bottoms[Math.floor(Math.random() * bottoms.length)];
          }
          want = g.target ? this.pos(g.target)[0] + 5.5 * px + this.dir * 6 * px : g.x;
          if (this.ufo && !this.shot && Math.abs(this.ufo.x - g.x) < 140) want = this.ufo.x + this.ufo.dir * 60;
        }
        want = Math.max(this.left + 12, Math.min(this.right - 12, want));
        g.x += Math.max(-150 * dt, Math.min(150 * dt, want - g.x));
        if (!threat && !this.shot && Math.abs(want - g.x) < 4) this.shot = { x: g.x, y: this.gunY - 10 };
      }
      // The cannon's shot.
      if (this.shot) {
        const s = this.shot; s.y -= 520 * dt;
        const hit = live.find(a => { const [x, y] = this.pos(a); return s.x > x && s.x < x + 11 * px && s.y > y && s.y < y + 8 * px; });
        if (hit) { hit.alive = false; const [x, y] = this.pos(hit); this.booms.push({ x: x + 5.5 * px, y: y + 4 * px, age: 0, color: ALIEN_COLOURS[hit.kind] }); this.shot = null; }
        else if (this.ufo && Math.abs(s.x - this.ufo.x) < 18 && Math.abs(s.y - this.ufo.y) < 8) {
          sparkBurst(this.sparks, this.ufo.x, this.ufo.y, 22, 130, "255,79,216"); this.ufo = null; this.shot = null;
        } else if (s.y < 0) this.shot = null;
      }
      // Bunkers wear away under shots and bombs.
      const chip = (x, y) => {
        const i = this.bunkers.findIndex(c => x >= c.x - 1 && x <= c.x + px + 1 && y >= c.y - 1 && y <= c.y + px + 1);
        if (i < 0) return false;
        this.bunkers = this.bunkers.filter(c => Math.hypot(c.x - this.bunkers[i].x, c.y - this.bunkers[i].y) > px * 1.6);
        return true;
      };
      if (this.shot && chip(this.shot.x, this.shot.y)) this.shot = null;
      this.bombs = this.bombs.filter(b => {
        if (chip(b.x, b.y)) return false;
        if (g.alive && Math.abs(b.x - g.x) < 12 && b.y > this.gunY - 8) {
          g.alive = false; g.wait = 1.6; g.target = null;
          sparkBurst(this.sparks, g.x, this.gunY, 18, 120, "114,255,143");
          return false;
        }
        return b.y < this.ground;
      });
      // The saucer.
      this.ufoWait -= dt;
      if (!this.ufo && this.ufoWait <= 0) {
        const dir = Math.random() < .5 ? 1 : -1;
        this.ufo = { x: dir > 0 ? this.left - 30 : this.right + 30, y: H * .07, dir };
        this.ufoWait = rand(9, 14);
      }
      if (this.ufo) { this.ufo.x += this.ufo.dir * 90 * dt; if (this.ufo.x < this.left - 40 || this.ufo.x > this.right + 40) this.ufo = null; }
      for (const b of this.booms) b.age += dt;
      this.booms = this.booms.filter(b => b.age < .35);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, .5);
      const px = this.px, alpha = cx.globalAlpha;
      // The formation marches behind the hero's words, so it's drawn a little faint, like the rocks.
      cx.globalAlpha = alpha * .62;
      for (const a of this.aliens) {
        if (!a.alive) continue;
        const [x, y] = this.pos(a);
        cx.drawImage(sprite(a.kind, this.frame, px), x - 8, y - 8);
      }
      cx.globalAlpha = alpha;
      // Bursts where aliens were hit.
      for (const b of this.booms) {
        beam(b.color, 10); cx.lineWidth = 1.5;
        const r = 4 + b.age * 40;
        cx.beginPath();
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; cx.moveTo(b.x + Math.cos(a) * r * .4, b.y + Math.sin(a) * r * .4); cx.lineTo(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r); }
        cx.stroke();
      }
      // Bunkers.
      const cells = new Map(this.bunkers.map(c => [`${c.b}:${c.gx},${c.gy}`, c]));
      beam("rgba(114,255,143,.85)", 6); cx.lineWidth = 1.2;
      cx.beginPath();
      for (const c of this.bunkers) {
        const has = (dx, dy) => cells.has(`${c.b}:${c.gx + dx},${c.gy + dy}`);
        if (!has(0, -1)) { cx.moveTo(c.x, c.y); cx.lineTo(c.x + px, c.y); }
        if (!has(0, 1)) { cx.moveTo(c.x, c.y + px); cx.lineTo(c.x + px, c.y + px); }
        if (!has(-1, 0)) { cx.moveTo(c.x, c.y); cx.lineTo(c.x, c.y + px); }
        if (!has(1, 0)) { cx.moveTo(c.x + px, c.y); cx.lineTo(c.x + px, c.y + px); }
      }
      cx.stroke();
      // The ground and the cannon.
      beam("rgba(114,255,143,.7)", 6); cx.lineWidth = 1.5;
      cx.beginPath(); cx.moveTo(this.left - 10, this.ground); cx.lineTo(this.right + 10, this.ground); cx.stroke();
      const g = this.gun;
      if (g.alive) {
        beam("#72ff8f", 12); cx.lineWidth = 1.6;
        const y = this.gunY;
        cx.beginPath();
        cx.moveTo(g.x - 14, y + 8); cx.lineTo(g.x + 14, y + 8); cx.lineTo(g.x + 14, y + 1); cx.lineTo(g.x + 4, y - 2);
        cx.lineTo(g.x + 2, y - 9); cx.lineTo(g.x - 2, y - 9); cx.lineTo(g.x - 4, y - 2); cx.lineTo(g.x - 14, y + 1); cx.closePath();
        cx.stroke();
      }
      // Shot, bombs (zigzag) and the saucer.
      beam("#ffffff", 8); cx.lineWidth = 2;
      if (this.shot) { cx.beginPath(); cx.moveTo(this.shot.x, this.shot.y); cx.lineTo(this.shot.x, this.shot.y + 9); cx.stroke(); }
      beam("#ffb347", 8); cx.lineWidth = 1.5;
      for (const b of this.bombs) {
        const k = Math.floor(b.y / 4) % 2 ? 2 : -2;
        cx.beginPath(); cx.moveTo(b.x, b.y - 9); cx.lineTo(b.x + k, b.y - 6); cx.lineTo(b.x - k, b.y - 3); cx.lineTo(b.x, b.y); cx.stroke();
      }
      if (this.ufo) {
        const u = this.ufo;
        beam("#ff4fd8", 12); cx.lineWidth = 1.6;
        cx.beginPath();
        cx.moveTo(u.x - 18, u.y + 3); cx.lineTo(u.x - 10, u.y - 3); cx.lineTo(u.x + 10, u.y - 3); cx.lineTo(u.x + 18, u.y + 3); cx.closePath();
        cx.moveTo(u.x - 6, u.y - 3); cx.lineTo(u.x - 3, u.y - 8); cx.lineTo(u.x + 3, u.y - 8); cx.lineTo(u.x + 6, u.y - 3);
        cx.stroke();
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Tempest: a claw on the rim of a tube, shooting down its lanes -----
  // The tube is seen end on: an outer rim and a small far rim, joined lane by lane. Flippers climb out of the
  // depths, flipping from lane to lane and leaving spikes; one that reaches the rim crawls round it towards the
  // claw. The claw follows the nearest flipper and fires down its lane. The tube's shape changes each time.
  const TUBES = [
    n => Array.from({ length: n }, (_, i) => [Math.cos(i / n * Math.PI * 2 - Math.PI / 2), Math.sin(i / n * Math.PI * 2 - Math.PI / 2)]),
    () => [[-1, -1], [-.5, -1], [0, -1], [.5, -1], [1, -1], [1, -.5], [1, 0], [1, .5], [1, 1], [.5, 1], [0, 1], [-.5, 1], [-1, 1], [-1, .5], [-1, 0], [-1, -.5]],
    n => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2 - Math.PI / 2, r = i % 2 ? .55 : 1; return [Math.cos(a) * r, Math.sin(a) * r]; }),
    () => [[-.35, -1], [.35, -1], [.35, -.35], [1, -.35], [1, .35], [.35, .35], [.35, 1], [-.35, 1], [-.35, .35], [-1, .35], [-1, -.35], [-.35, -.35]],
  ];
  const tempest = {
    name: "TEMPEST",
    shape: -1,
    layout() {
      this.cxT = W < 700 ? W * .5 : W * .7; this.cyT = H * .5;
      this.R = Math.min(H * .42, W < 700 ? W * .42 : W * .25);
      this.build();
    },
    build() {
      const pts = TUBES[Math.max(0, this.shape) % TUBES.length](16);
      this.outer = pts.map(([x, y]) => [this.cxT + x * this.R, this.cyT + y * this.R]);
      // The far rim, small and a little above centre, as if looking slightly down the tube.
      this.inner = pts.map(([x, y]) => [this.cxT + x * this.R * .16, this.cyT - this.R * .06 + y * this.R * .16]);
      this.n = pts.length;
      this.claw = { lane: 0, at: 0, alive: true, wait: 0, fire: 0 };
      this.flippers = []; this.shots = []; this.spikes = new Array(this.n).fill(0); this.sparks = []; this.spawn = .5;
    },
    start() { this.shape++; this.build(); },
    // A point on a lane's edge `edge` (0..n) at depth d (0 far, 1 rim).
    edgeAt(edge, d) {
      const i = ((edge % this.n) + this.n) % this.n, o = this.outer[i], f = this.inner[i], e = d * d;
      return [f[0] + (o[0] - f[0]) * e, f[1] + (o[1] - f[1]) * e];
    },
    // A point across a lane: `lane` may be fractional while something flips between lanes.
    at(lane, across, d) {
      const l = Math.floor(lane), frac = lane - l;
      const p = (k, t) => { const a = this.edgeAt(k, d), b = this.edgeAt(k + 1, d); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
      const a = p(l, across), b = p(l + 1, across);
      return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
    },
    laneGap(a, b) { let d = b - a; if (d > this.n / 2) d -= this.n; if (d < -this.n / 2) d += this.n; return d; },
    step(dt) {
      const n = this.n, c = this.claw;
      // New flippers from the far end.
      this.spawn -= dt;
      if (this.spawn <= 0 && this.flippers.length < 6) {
        this.spawn = rand(.6, 1.3);
        this.flippers.push({ lane: Math.floor(rand(0, n)), d: 0, speed: rand(.1, .2), flip: 0, dir: 1, wait: rand(.8, 2) });
      }
      for (const f of this.flippers) {
        if (f.flip) {
          // Mid-flip: when it lands it is in the next lane.
          f.flip += dt * 3;
          if (f.flip >= 1) { f.lane = ((f.lane + f.dir) % n + n) % n; f.flip = 0; }
          continue;
        }
        if (f.d < 1) {
          f.d = Math.min(1, f.d + f.speed * dt);
          // Spikes grow behind a climbing flipper now and then.
          if (Math.random() < .25 * dt) this.spikes[f.lane] = Math.min(.55, Math.max(this.spikes[f.lane], f.d));
          f.wait -= dt;
          if (f.wait <= 0) { f.wait = rand(1, 2.5); f.dir = Math.random() < .5 ? 1 : -1; f.flip = .001; }
        } else {
          // On the rim: flip round towards the claw.
          f.wait -= dt;
          if (f.wait <= 0) { f.wait = .45; f.dir = Math.sign(this.laneGap(f.lane, c.lane)) || 1; f.flip = .001; }
          if (c.alive && f.lane === c.lane) {
            c.alive = false; c.wait = 1.4; f.dead = true;
            const [x, y] = this.at(c.lane, .5, 1);
            sparkBurst(this.sparks, x, y, 24, 140, "255,225,74");
          }
        }
      }
      // The claw: round the rim to the most pressing flipper's lane, firing down it.
      if (!c.alive) { c.wait -= dt; if (c.wait <= 0) { c.alive = true; this.flippers = this.flippers.filter(f => f.d < 1); } }
      else {
        const target = this.flippers.filter(f => !f.dead).sort((a, b) => b.d - a.d)[0];
        let want = target ? target.lane : this.spikes.indexOf(Math.max(...this.spikes));
        const gap = this.laneGap(c.lane, want);
        c.at += dt;
        if (gap !== 0 && c.at > .09) { c.at = 0; c.lane = ((c.lane + Math.sign(gap)) % n + n) % n; }
        c.fire -= dt;
        // It lets a flipper climb into view before firing on it.
        if (gap === 0 && c.fire <= 0 && this.shots.length < 6 && (!target || target.d > .4)) { c.fire = .16; this.shots.push({ lane: c.lane, d: 1 }); }
      }
      // Shots down the lanes: they hit flippers, and wear spikes down.
      for (const s of this.shots) {
        s.d -= 1.9 * dt;
        const f = this.flippers.find(f => !f.dead && f.lane === s.lane && (!f.flip || f.flip < .5) && Math.abs(f.d - s.d) < .07);
        if (f) {
          f.dead = true; s.dead = true;
          const [x, y] = this.at(f.lane + (f.flip ? f.flip * f.dir : 0), .5, f.d);
          sparkBurst(this.sparks, x, y, 14, 90, "255,74,74");
        } else if (s.d < this.spikes[s.lane]) { this.spikes[s.lane] = Math.max(0, this.spikes[s.lane] - .08); s.dead = true; }
        else if (s.d <= 0) s.dead = true;
      }
      this.shots = this.shots.filter(s => !s.dead);
      this.flippers = this.flippers.filter(f => !f.dead);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, 1);
      const n = this.n;
      // The tube: both rims and the lanes between them.
      beam("#3a6cff", 10); cx.lineWidth = 1.4;
      cx.beginPath();
      for (const rim of [this.outer, this.inner]) { rim.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y)); cx.closePath(); }
      for (let i = 0; i < n; i++) { cx.moveTo(...this.inner[i]); cx.lineTo(...this.outer[i]); }
      cx.stroke();
      // Spikes.
      beam("#72ff8f", 8); cx.lineWidth = 1.6;
      cx.beginPath();
      this.spikes.forEach((len, lane) => { if (len > .01) { cx.moveTo(...this.at(lane, .5, 0)); cx.lineTo(...this.at(lane, .5, len)); } });
      cx.stroke();
      // Flippers: a bow tie across the lane, turning end over end as they flip.
      beam("#ff4a4a", 10); cx.lineWidth = 1.5;
      for (const f of this.flippers) {
        const lane = f.lane + (f.flip ? f.flip * f.dir : 0), w = .06 + .05 * f.d;
        const tilt = f.flip ? Math.sin(f.flip * Math.PI) * w : 0;
        const a = this.at(lane, .08, f.d - w + tilt), b = this.at(lane, .92, f.d + w - tilt);
        const c2 = this.at(lane, .92, f.d - w), d2 = this.at(lane, .08, f.d + w);
        cx.beginPath(); cx.moveTo(...a); cx.lineTo(...b); cx.lineTo(...c2); cx.lineTo(...d2); cx.closePath(); cx.stroke();
      }
      // Shots.
      beam("#ffffff", 8); cx.fillStyle = "#ffffff";
      for (const s of this.shots) { const [x, y] = this.at(s.lane, .5, s.d); cx.fillRect(x - 2, y - 2, 4, 4); }
      // The claw on the rim.
      const c = this.claw;
      if (c.alive) {
        beam("#ffe14a", 12); cx.lineWidth = 1.8;
        const P = (across, d) => this.at(c.lane, across, d);
        cx.beginPath();
        // Sitting on the rim with its two jaws pointing down the lane.
        cx.moveTo(...P(0, 1)); cx.lineTo(...P(.18, .955)); cx.lineTo(...P(.36, .978)); cx.lineTo(...P(.5, .945)); cx.lineTo(...P(.64, .978));
        cx.lineTo(...P(.82, .955)); cx.lineTo(...P(1, 1)); cx.lineTo(...P(.5, .99)); cx.closePath();
        cx.stroke();
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Battlezone: the view from a tank's periscope -----
  // First person, in green wireframe: mountains on the horizon turn as the turret does, pyramids and blocks
  // stand about the plain, and enemy tanks roll in. The turret swings onto the nearest, fires, and a hit sends
  // the tank flying apart in lines. Now and then an enemy shell gets through and cracks the glass.
  const TANK_V = [[-1.3, 0, -2], [1.3, 0, -2], [1.3, 0, 2.2], [-1.3, 0, 2.2], [-1.1, .7, -1.7], [1.1, .7, -1.7], [1.1, .7, 1.6], [-1.1, .7, 1.6],
    [-1.3, .35, 2.6], [1.3, .35, 2.6], [-.6, .7, -.8], [.6, .7, -.8], [.6, .7, .6], [-.6, .7, .6], [-.5, 1.2, -.6], [.5, 1.2, -.6], [.5, 1.2, .4], [-.5, 1.2, .4],
    [0, 1, .5], [0, 1, 3]];
  const TANK_E = [[0, 1], [1, 2], [2, 3], [3, 0], [2, 9], [3, 8], [8, 9], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [9, 6], [8, 7],
    [10, 11], [11, 12], [12, 13], [13, 10], [14, 15], [15, 16], [16, 17], [17, 14], [10, 14], [11, 15], [12, 16], [13, 17], [18, 19]];
  const PYRAMID = { v: [[-1.5, 0, -1.5], [1.5, 0, -1.5], [1.5, 0, 1.5], [-1.5, 0, 1.5], [0, 3, 0]], e: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]] };
  const BLOCK = { v: [[-1.2, 0, -1.2], [1.2, 0, -1.2], [1.2, 0, 1.2], [-1.2, 0, 1.2], [-1.2, 2.4, -1.2], [1.2, 2.4, -1.2], [1.2, 2.4, 1.2], [-1.2, 2.4, 1.2]],
                  e: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] };
  const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const battlezone = {
    name: "BATTLEZONE",
    layout() {
      this.horizon = H * .6; this.F = Math.min(W, H * 1.7) * .55; this.cxs = W < 700 ? W * .5 : W * .64;
      if (!this.peaks) this.reset();
    },
    reset() {
      this.h = 0; this.shell = null; this.enemyShells = []; this.bits = []; this.crack = 0; this.spawnWait = 0;
      // Mountains all round the horizon, and a few things standing on the plain.
      this.peaks = Array.from({ length: 72 }, () => rand(6, 34));
      for (let i = 0; i < 72; i += 9) this.peaks[i] = rand(40, 64);
      this.props = Array.from({ length: 16 }, (_, i) => { const a = rand(0, 6.3), d = rand(14, 70); return { x: Math.sin(a) * d, z: Math.cos(a) * d, m: i % 2 ? PYRAMID : BLOCK, yaw: rand(0, 1.6) }; });
      this.tanks = [this.newTank(rand(-.8, .8)), this.newTank(rand(2, 4))];
    },
    newTank(bearing) { const d = rand(45, 60); return { x: Math.sin(bearing) * d, z: Math.cos(bearing) * d, yaw: bearing + Math.PI, fire: rand(4, 7) }; },
    start() { if (!this.peaks) this.reset(); },
    // World to camera: the player sits at the origin, looking along its heading.
    cam(x, y, z) {
      const s = Math.sin(this.h), c = Math.cos(this.h);
      return [x * c - z * s, y - 1.1, x * s + z * c];
    },
    line(a, b) {
      let [ax, ay, az] = a, [bx, by, bz] = b;
      const near = .4;
      if (az < near && bz < near) return;
      if (az < near) { const k = (near - az) / (bz - az); ax += (bx - ax) * k; ay += (by - ay) * k; az = near; }
      if (bz < near) { const k = (near - bz) / (az - bz); bx += (ax - bx) * k; by += (ay - by) * k; bz = near; }
      cx.moveTo(this.cxs + ax / az * this.F, this.horizon - ay / az * this.F);
      cx.lineTo(this.cxs + bx / bz * this.F, this.horizon - by / bz * this.F);
    },
    model(m, x, z, yaw, lift = 0) {
      const s = Math.sin(yaw), c = Math.cos(yaw);
      const pts = m.v.map(([vx, vy, vz]) => this.cam(x + vx * c + vz * s, vy + lift, z - vx * s + vz * c));
      for (const [i, j] of m.e) this.line(pts[i], pts[j]);
    },
    step(dt) {
      // Enemies roll in, turn to face the player, and fire now and then.
      for (const tk of this.tanks) {
        const d = Math.hypot(tk.x, tk.z), toMe = Math.atan2(-tk.x, -tk.z);
        tk.yaw += Math.max(-.5 * dt, Math.min(.5 * dt, angleTo(tk.yaw, toMe)));
        if (d > 18) { tk.x += Math.sin(tk.yaw) * 3 * dt; tk.z += Math.cos(tk.yaw) * 3 * dt; }
        tk.fire -= dt;
        if (tk.fire <= 0 && Math.abs(angleTo(tk.yaw, toMe)) < .15 && !this.crack) {
          tk.fire = rand(6, 10);
          this.enemyShells.push({ x: tk.x + Math.sin(tk.yaw) * 3, z: tk.z + Math.cos(tk.yaw) * 3, vx: Math.sin(tk.yaw) * 16, vz: Math.cos(tk.yaw) * 16 });
        }
      }
      for (const es of this.enemyShells) { es.x += es.vx * dt; es.z += es.vz * dt; if (Math.hypot(es.x, es.z) < 1.5) { es.hit = true; this.crack = 1.8; this.crackAt = [rand(-.25, .25), rand(-.2, .2)]; } }
      this.enemyShells = this.enemyShells.filter(es => !es.hit && Math.hypot(es.x, es.z) < 90);
      if (this.crack > 0) {
        this.crack -= dt;
        if (this.crack <= 0) { this.crack = 0; this.tanks = this.tanks.map(() => this.newTank(rand(0, 6.3))); this.enemyShells = []; }
        return;
      }
      // The turret: onto the nearest tank, then fire.
      const target = this.tanks.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
      if (target) {
        const err = angleTo(this.h, Math.atan2(target.x, target.z));
        this.h += Math.max(-.8 * dt, Math.min(.8 * dt, err));
        if (Math.abs(err) < .02 && !this.shell) this.shell = { x: Math.sin(this.h) * 2, z: Math.cos(this.h) * 2, vx: Math.sin(this.h) * 45, vz: Math.cos(this.h) * 45, age: 0 };
      }
      if (this.shell) {
        const sh = this.shell; sh.x += sh.vx * dt; sh.z += sh.vz * dt; sh.age += dt;
        const hit = this.tanks.find(tk => Math.hypot(tk.x - sh.x, tk.z - sh.z) < 2.6);
        if (hit) {
          // The tank comes apart: every edge flies off on its own.
          const s = Math.sin(hit.yaw), c = Math.cos(hit.yaw);
          for (const [i, j] of TANK_E) {
            const [ax, ay, az] = TANK_V[i], [bx, by, bz] = TANK_V[j];
            this.bits.push({ a: [hit.x + ax * c + az * s, ay, hit.z - ax * s + az * c], b: [hit.x + bx * c + bz * s, by, hit.z - bx * s + bz * c],
                             v: [rand(-5, 5), rand(4, 10), rand(-5, 5)], age: 0 });
          }
          this.tanks.splice(this.tanks.indexOf(hit), 1);
          this.shell = null; this.spawnWait = 2.5;
        } else if (sh.age > 2) this.shell = null;
      }
      this.spawnWait -= dt;
      if (this.tanks.length < 2 && this.spawnWait <= 0) { this.tanks.push(this.newTank(this.h + rand(-2.5, 2.5))); this.spawnWait = 3; }
      for (const b of this.bits) {
        b.age += dt; b.v[1] -= 12 * dt;
        for (const p of [b.a, b.b]) { p[0] += b.v[0] * dt; p[1] = Math.max(0, p[1] + b.v[1] * dt); p[2] += b.v[2] * dt; }
      }
      this.bits = this.bits.filter(b => b.age < 2.2);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, .5);
      const G = "#72ff8f";
      // The horizon, the mountains beyond it (they turn with the turret but never come nearer), and a moon.
      beam(G, 8); cx.lineWidth = 1.4;
      cx.beginPath(); cx.moveTo(0, this.horizon); cx.lineTo(W, this.horizon); cx.stroke();
      cx.beginPath();
      let pen = false;
      for (let i = 0; i <= 72; i++) {
        const rel = angleTo(this.h, (i % 72) * Math.PI * 2 / 72);
        if (Math.abs(rel) > 1.25) { pen = false; continue; }
        const x = this.cxs + Math.tan(rel) * this.F, y = this.horizon - this.peaks[i % 72] * (H / 400);
        pen ? cx.lineTo(x, y) : cx.moveTo(x, y); pen = true;
      }
      cx.stroke();
      const moonRel = angleTo(this.h, 1.1);
      if (Math.abs(moonRel) < 1.1) {
        const mx = this.cxs + Math.tan(moonRel) * this.F, my = this.horizon - H * .32;
        beam("#d5e3ee", 8); cx.lineWidth = 1.3;
        cx.beginPath(); cx.arc(mx, my, 16, .6, 5.6); cx.arc(mx + 7, my - 3, 13, 5.2, 1.0, true); cx.stroke();
      }
      // The plain: obstacles, enemy tanks, shells and wreckage.
      beam(G, 8); cx.lineWidth = 1.3;
      cx.beginPath();
      for (const pr of this.props) this.model(pr.m, pr.x, pr.z, pr.yaw);
      for (const tk of this.tanks) this.model({ v: TANK_V, e: TANK_E }, tk.x, tk.z, tk.yaw);
      cx.stroke();
      beam("#ff4a4a", 10); cx.lineWidth = 1.6;
      cx.beginPath();
      for (const es of this.enemyShells) {
        const p = [[0, .9, -.5], [0, .9, .5], [-.3, .9, 0], [.3, .9, 0]].map(([x, y, z]) => this.cam(es.x + x, y, es.z + z));
        this.line(p[0], p[1]); this.line(p[2], p[3]);
      }
      cx.stroke();
      if (this.shell) {
        beam("#ffffff", 10); cx.lineWidth = 2;
        cx.beginPath(); const sh = this.shell; this.line(this.cam(sh.x, .9, sh.z), this.cam(sh.x + sh.vx * .03, .9, sh.z + sh.vz * .03)); cx.stroke();
      }
      beam(G, 10); cx.lineWidth = 1.5;
      for (const b of this.bits) {
        cx.globalAlpha *= 1 - b.age / 2.2;
        cx.beginPath(); this.line(this.cam(...b.a), this.cam(...b.b)); cx.stroke();
        cx.globalAlpha /= Math.max(.001, 1 - b.age / 2.2);
      }
      // The gunsight.
      beam(G, 8); cx.lineWidth = 1.5;
      const sx = this.cxs, sy = this.horizon - 20;
      cx.beginPath();
      cx.moveTo(sx, sy - 40); cx.lineTo(sx, sy - 14); cx.moveTo(sx, sy + 14); cx.lineTo(sx, sy + 40);
      cx.moveTo(sx - 30, sy - 40); cx.lineTo(sx + 30, sy - 40); cx.moveTo(sx - 30, sy + 40); cx.lineTo(sx + 30, sy + 40);
      cx.moveTo(sx - 30, sy - 40); cx.lineTo(sx - 30, sy - 30); cx.moveTo(sx + 30, sy - 40); cx.lineTo(sx + 30, sy - 30);
      cx.moveTo(sx - 30, sy + 40); cx.lineTo(sx - 30, sy + 30); cx.moveTo(sx + 30, sy + 40); cx.lineTo(sx + 30, sy + 30);
      cx.stroke();
      // The radar, with its sweep and a blip for each enemy.
      const rx = W - 64, ry = 64, rr = 40;
      beam("rgba(114,255,143,.8)", 6); cx.lineWidth = 1.2;
      cx.beginPath(); cx.arc(rx, ry, rr, 0, Math.PI * 2); cx.moveTo(rx, ry - 4); cx.lineTo(rx, ry - rr); cx.stroke();
      const sweep = t * 2.4;
      beam(G, 6); cx.beginPath(); cx.moveTo(rx, ry); cx.lineTo(rx + Math.sin(sweep) * rr, ry - Math.cos(sweep) * rr); cx.stroke();
      cx.fillStyle = "#ff4a4a"; cx.shadowColor = "#ff4a4a";
      for (const tk of this.tanks) {
        const d = Math.hypot(tk.x, tk.z), rel = angleTo(this.h, Math.atan2(tk.x, tk.z));
        if (d > 80) continue;
        const k = d / 80 * rr;
        cx.fillRect(rx + Math.sin(rel) * k - 2, ry - Math.cos(rel) * k - 2, 4, 4);
      }
      // A hit: the glass cracks.
      if (this.crack > 0) {
        const [ox, oy] = this.crackAt, px = this.cxs + ox * W * .3, py = this.horizon + oy * H;
        beam("rgba(213,227,238,.9)", 8); cx.lineWidth = 1.5;
        cx.beginPath();
        for (let i = 0; i < 9; i++) {
          let a = i * .7 + 1.3 * Math.sin(i * 2.1), x = px, y = py;
          cx.moveTo(x, y);
          for (let k = 0; k < 4; k++) { a += Math.sin(i * 3 + k) * .4; x += Math.cos(a) * 60; y += Math.sin(a) * 60; cx.lineTo(x, y); }
        }
        cx.stroke();
      }
    },
  };

  // ----- Star Castle: a ship chipping away at the rotating rings round a cannon -----
  // Three rings of twelve segments turn in alternate directions. The ship circles outside, firing in; each shot
  // breaks the first segment it meets (they take two hits). When the gaps line up between the cannon and the
  // ship the cannon fires a spinning fireball out through them; when a shot gets all the way in, the cannon
  // goes up and a new castle is built.
  const SEGS = 12;
  const castle = {
    name: "STAR CASTLE",
    layout() {
      this.cxC = W < 700 ? W * .5 : W * .68; this.cyC = H * .5;
      this.R = Math.min(H * .34, W < 700 ? W * .34 : W * .2);
      if (!this.rings) this.reset();
    },
    reset() {
      this.rings = [[.82, .22, "#ff4a4a"], [.64, -.3, "#ffe14a"], [.46, .4, "#ff4fd8"]]
        .map(([r, spin, colour]) => ({ r, spin, colour, rot: rand(0, 6.3), segs: new Array(SEGS).fill(2) }));
      this.cannon = { a: rand(0, 6.3), alive: true, fire: 2.5, boom: 0 };
      this.ship = this.ship ?? { th: rand(0, 6.3), alive: true, wait: 0, fire: 0 };
      this.shots = []; this.balls = []; this.sparks = this.sparks ?? [];
    },
    start() { if (!this.rings) this.reset(); },
    // Which segment of a ring is at an angle.
    segAt(ring, ang) { const k = ((ang - ring.rot) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); return Math.floor(k / (Math.PI * 2 / SEGS)); },
    shipAt() { const s = this.ship; return [this.cxC + Math.cos(s.th) * this.R * 1.3, this.cyC + Math.sin(s.th) * this.R * 1.12]; },
    step(dt) {
      const s = this.ship, c = this.cannon, R = this.R;
      for (const g of this.rings) g.rot += g.spin * dt;
      if (!c.alive) { c.boom -= dt; if (c.boom <= 0) this.reset(); }
      // The ship circles, nose to the castle, firing in.
      if (!s.alive) { s.wait -= dt; if (s.wait <= 0) Object.assign(s, { alive: true, th: s.th + 2 }); }
      else {
        s.th += .3 * dt;
        s.fire -= dt;
        if (s.fire <= 0 && c.alive) {
          s.fire = .2;
          const [x, y] = this.shipAt(), d = Math.hypot(this.cxC - x, this.cyC - y);
          this.shots.push({ x, y, vx: (this.cxC - x) / d * 340, vy: (this.cyC - y) / d * 340 });
        }
      }
      for (const b of this.shots) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        const rho = Math.hypot(b.x - this.cxC, b.y - this.cyC), ang = Math.atan2(b.y - this.cyC, b.x - this.cxC);
        for (const g of this.rings) {
          if (Math.abs(rho - g.r * R) > 5) continue;
          const i = this.segAt(g, ang);
          if (g.segs[i] > 0) { g.segs[i]--; b.dead = true; sparkBurst(this.sparks, b.x, b.y, 4, 60, "255,225,74"); }
          break;
        }
        if (!b.dead && rho < R * .16 && c.alive) {
          b.dead = true; c.alive = false; c.boom = 2.2; this.balls = [];
          sparkBurst(this.sparks, this.cxC, this.cyC, 40, 200, "255,120,80");
          sparkBurst(this.sparks, this.cxC, this.cyC, 24, 120, "255,255,255");
        }
      }
      this.shots = this.shots.filter(b => !b.dead && Math.hypot(b.x - this.cxC, b.y - this.cyC) > R * .1);
      // The cannon follows the ship and fires out through the gaps when they line up.
      if (c.alive && s.alive) {
        const [x, y] = this.shipAt(), want = Math.atan2(y - this.cyC, x - this.cxC), err = angleTo(c.a, want);
        c.a += Math.max(-1.5 * dt, Math.min(1.5 * dt, err));
        c.fire -= dt;
        const clear = this.rings.every(g => g.segs[this.segAt(g, c.a)] === 0);
        if (clear && Math.abs(err) < .06 && c.fire <= 0) {
          c.fire = 2;
          this.balls.push({ x: this.cxC, y: this.cyC, vx: Math.cos(c.a) * 190, vy: Math.sin(c.a) * 190, age: 0 });
        }
      }
      for (const f of this.balls) {
        f.x += f.vx * dt; f.y += f.vy * dt; f.age += dt;
        const [x, y] = this.shipAt();
        if (s.alive && Math.hypot(f.x - x, f.y - y) < 14) {
          f.dead = true; s.alive = false; s.wait = 1.6;
          sparkBurst(this.sparks, x, y, 18, 120, "92,225,255");
        }
      }
      this.balls = this.balls.filter(f => !f.dead && f.age < 3);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, 1);
      const R = this.R, X = (r, a) => this.cxC + Math.cos(a) * r, Y = (r, a) => this.cyC + Math.sin(a) * r;
      // The rings: each segment a narrow band, dimmer once it's been hit.
      for (const g of this.rings) {
        for (let i = 0; i < SEGS; i++) {
          if (!g.segs[i]) continue;
          const a0 = g.rot + i * Math.PI * 2 / SEGS + .04, a1 = a0 + Math.PI * 2 / SEGS - .08, r0 = g.r * R - 4, r1 = g.r * R + 4;
          beam(g.segs[i] === 2 ? g.colour : `${g.colour}88`, 10); cx.lineWidth = 1.6;
          cx.beginPath();
          cx.moveTo(X(r0, a0), Y(r0, a0)); cx.lineTo(X(r1, a0), Y(r1, a0)); cx.lineTo(X(r1, a1), Y(r1, a1)); cx.lineTo(X(r0, a1), Y(r0, a1)); cx.closePath();
          cx.stroke();
        }
      }
      // The cannon: a pointed eye turning to follow the ship.
      const c = this.cannon;
      if (c.alive) {
        const r = R * .14, a = c.a;
        beam("#72ff8f", 12); cx.lineWidth = 1.8;
        cx.beginPath();
        cx.moveTo(X(r * 1.6, a), Y(r * 1.6, a)); cx.lineTo(X(r, a + 2.3), Y(r, a + 2.3)); cx.lineTo(X(r * .5, a + Math.PI), Y(r * .5, a + Math.PI)); cx.lineTo(X(r, a - 2.3), Y(r, a - 2.3)); cx.closePath();
        cx.stroke();
      }
      // The ship, nose to the castle.
      const s = this.ship;
      if (s.alive) {
        const [x, y] = this.shipAt(), a = Math.atan2(this.cyC - y, this.cxC - x), P = (f, side) => [x + Math.cos(a) * f - Math.sin(a) * side, y + Math.sin(a) * f + Math.cos(a) * side];
        beam("#5ce1ff", 12); cx.lineWidth = 1.6;
        cx.beginPath(); cx.moveTo(...P(12, 0)); cx.lineTo(...P(-8, -8)); cx.lineTo(...P(-4, 0)); cx.lineTo(...P(-8, 8)); cx.closePath(); cx.stroke();
      }
      beam("#ffffff", 8); cx.lineWidth = 2;
      cx.beginPath();
      for (const b of this.shots) { cx.moveTo(b.x, b.y); cx.lineTo(b.x - b.vx * .02, b.y - b.vy * .02); }
      cx.stroke();
      // Fireballs, spinning as they come.
      beam("#ff9a3a", 14); cx.lineWidth = 1.8;
      for (const f of this.balls) {
        cx.beginPath();
        for (let k = 0; k < 4; k++) { const a = f.age * 9 + k * Math.PI / 4; cx.moveTo(f.x - Math.cos(a) * 9, f.y - Math.sin(a) * 9); cx.lineTo(f.x + Math.cos(a) * 9, f.y + Math.sin(a) * 9); }
        cx.stroke();
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Missile Command: cities under attack, and the counter-missiles that stop what they can -----
  // Missiles streak down on six cities and three bases, some splitting on the way. The bases fire
  // counter-missiles at the point where each incoming one will be; they burst into rings that swell and fade,
  // and anything caught in one goes up in a ring of its own. When the cities are gone, they're rebuilt.
  const missiles = {
    name: "MISSILE COMMAND",
    layout() {
      this.left = W < 700 ? 14 : W * .42; this.right = W - 14; this.ground = H - 26;
      this.reset();
    },
    reset() {
      const slots = 9, span = this.right - this.left;
      this.places = Array.from({ length: slots }, (_, i) => ({ x: this.left + span * (i + .5) / slots, base: i % 4 === 0, alive: true }));
      this.incoming = []; this.counters = []; this.booms = []; this.sparks = this.sparks ?? [];
      this.spawn = .5; this.fire = 0; this.rebuild = 0;
    },
    start() { if (!this.places) this.layout(); },
    aimFrom(m) {
      // Where an incoming missile will be by the time a counter-missile from the nearest base reaches it, and the ring has grown.
      const bases = this.places.filter(p => p.base && p.alive);
      if (!bases.length) return null;
      const base = bases.reduce((a, b) => Math.abs(a.x - m.x) < Math.abs(b.x - m.x) ? a : b);
      const bx = base.x, by = this.ground - 10;
      let T = .5, px = m.x, py = m.y;
      for (let k = 0; k < 4; k++) { px = m.x + m.vx * T; py = m.y + m.vy * T; T = Math.hypot(px - bx, py - by) / 340 + .3; }
      return py < this.ground - 40 ? { bx, by, px, py } : null;
    },
    step(dt) {
      const ground = this.ground, alive = this.places.filter(p => p.alive);
      // New attackers, aimed at what's still standing.
      this.spawn -= dt;
      if (this.spawn <= 0 && this.incoming.length < 10 && alive.length) {
        this.spawn = rand(.3, .8);
        this.launch(rand(this.left, this.right), 0, alive[Math.floor(rand(0, alive.length))], Math.random() < .3);
      }
      for (const m of this.incoming) {
        m.x += m.vx * dt; m.y += m.vy * dt;
        if (m.split && m.y > m.split) {
          m.split = 0;
          for (let k = 0; k < 2 && alive.length; k++) this.launch(m.x, m.y, alive[Math.floor(rand(0, alive.length))], false, m.x, m.y);
        }
        if (m.y >= ground - 4) {
          m.dead = true;
          this.boom(m.x, ground - 4, 18, "255,74,74");
          const hit = this.places.find(p => p.alive && Math.abs(p.x - m.x) < 14);
          if (hit) { hit.alive = false; sparkBurst(this.sparks, hit.x, ground - 6, 16, 90, "255,179,71"); }
        }
      }
      // The defence: a counter-missile at whichever attacker is nearest to landing.
      this.fire -= dt;
      if (this.fire <= 0) {
        const next = this.incoming.filter(m => !m.dead && !m.marked).sort((a, b) => (ground - a.y) / a.vy - (ground - b.y) / b.vy)[0];
        const aim = next && this.aimFrom(next);
        if (aim) {
          this.fire = .5; next.marked = true;
          const d = Math.hypot(aim.px - aim.bx, aim.py - aim.by);
          this.counters.push({ x0: aim.bx, y0: aim.by, x: aim.bx, y: aim.by, tx: aim.px, ty: aim.py, vx: (aim.px - aim.bx) / d * 340, vy: (aim.py - aim.by) / d * 340 });
        }
      }
      for (const c of this.counters) {
        c.x += c.vx * dt; c.y += c.vy * dt;
        if ((c.tx - c.x) * c.vx + (c.ty - c.y) * c.vy <= 0) { c.dead = true; this.boom(c.tx, c.ty, 30); }
      }
      // Rings swell and fade; anything inside one bursts too.
      for (const b of this.booms) {
        b.age += dt;
        const r = b.max * Math.sin(Math.min(1, b.age / 1.4) * Math.PI);
        for (const m of this.incoming) if (!m.dead && Math.hypot(m.x - b.x, m.y - b.y) < r) { m.dead = true; this.boom(m.x, m.y, 20); }
      }
      this.incoming = this.incoming.filter(m => !m.dead);
      this.counters = this.counters.filter(c => !c.dead);
      this.booms = this.booms.filter(b => b.age < 1.4);
      // Everything gone: a pause, then rebuilt.
      if (!this.places.some(p => p.alive && !p.base) || !this.places.some(p => p.alive && p.base)) {
        this.rebuild += dt;
        if (this.rebuild > 2.5) this.reset();
      }
    },
    launch(x, y, target, split, ox = x, oy = y) {
      const sp = rand(30, 48), d = Math.hypot(target.x - x, this.ground - y);
      this.incoming.push({ ox, oy, x, y, vx: (target.x - x) / d * sp, vy: (this.ground - y) / d * sp, split: split ? rand(H * .25, H * .5) : 0 });
    },
    boom(x, y, max, colour) { this.booms.push({ x, y, max, age: 0, colour }); },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, .7);
      const g = this.ground;
      // The ground, with a hill under each base.
      beam("#ffb347", 8); cx.lineWidth = 1.6;
      cx.beginPath(); cx.moveTo(this.left - 14, g);
      for (const p of this.places) if (p.base) { cx.lineTo(p.x - 22, g); cx.lineTo(p.x - 10, g - 10); cx.lineTo(p.x + 10, g - 10); cx.lineTo(p.x + 22, g); }
      cx.lineTo(this.right + 14, g); cx.stroke();
      // Cities: a little skyline each.
      beam("#5ce1ff", 10); cx.lineWidth = 1.4;
      cx.beginPath();
      for (const p of this.places) {
        if (p.base || !p.alive) continue;
        const x = p.x - 12;
        cx.moveTo(x, g); cx.lineTo(x, g - 8); cx.lineTo(x + 5, g - 8); cx.lineTo(x + 5, g - 14); cx.lineTo(x + 10, g - 14); cx.lineTo(x + 10, g - 6);
        cx.lineTo(x + 15, g - 6); cx.lineTo(x + 15, g - 11); cx.lineTo(x + 20, g - 11); cx.lineTo(x + 20, g - 4); cx.lineTo(x + 24, g - 4); cx.lineTo(x + 24, g);
      }
      cx.stroke();
      // Incoming trails, red with a bright head; counter-missiles blue, each with an X where it's going.
      beam("#ff4a4a", 8); cx.lineWidth = 1.3;
      cx.beginPath();
      for (const m of this.incoming) { cx.moveTo(m.ox, m.oy); cx.lineTo(m.x, m.y); }
      cx.stroke();
      beam("#5ce1ff", 8);
      cx.beginPath();
      for (const c of this.counters) {
        cx.moveTo(c.x0, c.y0); cx.lineTo(c.x, c.y);
        cx.moveTo(c.tx - 4, c.ty - 4); cx.lineTo(c.tx + 4, c.ty + 4); cx.moveTo(c.tx + 4, c.ty - 4); cx.lineTo(c.tx - 4, c.ty + 4);
      }
      cx.stroke();
      cx.fillStyle = "#ffffff"; cx.shadowColor = "#ffffff";
      for (const m of [...this.incoming, ...this.counters]) cx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
      // The rings, flickering through the colours.
      const flicker = ["255,255,255", "255,79,216", "255,225,74", "92,225,255"];
      for (const b of this.booms) {
        const r = b.max * Math.sin(Math.min(1, b.age / 1.4) * Math.PI);
        beam(`rgba(${b.colour ?? flicker[Math.floor(t * 20 + b.x) % 4]},.9)`, 14); cx.lineWidth = 2;
        cx.beginPath(); cx.arc(b.x, b.y, Math.max(1, r), 0, Math.PI * 2); cx.stroke();
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Star Wars: a run down the trench to the exhaust port -----
  // First person, flying low down a trench that streams past in wireframe. Catwalks cross it (the ship dips
  // under them), turrets along the rims fire, and the ship's lasers converge on them from the corners of the
  // view. At the end of the run the port comes up on the floor; a torpedo goes in, and the screen goes white.
  const TRENCH_W = 1.6, TRENCH_H = 2.6, RUN = 210, SPEED = 19;
  const wars = {
    name: "STAR WARS",
    layout() {
      this.vx = W < 700 ? W * .5 : W * .64; this.vy = H * .46; this.F = Math.min(W, H * 1.6) * .5;
      if (this.z === undefined) this.start();
    },
    start() {
      this.z = 0; this.camX = 0; this.camY = 1.3; this.done = 0; this.torpedo = null;
      this.cats = Array.from({ length: 5 }, (_, i) => 35 + i * 34 + rand(-6, 6));
      this.turrets = Array.from({ length: 8 }, (_, i) => ({ z: 25 + i * 22 + rand(0, 8), side: i % 2 ? 1 : -1, fire: rand(.5, 1.5), dead: false }));
      this.balls = []; this.lasers = []; this.sparks = []; this.laserWait = 0;
    },
    // Camera space (relative to the ship) to the screen, clipping lines that come too near.
    line(a, b) {
      let [ax, ay, az] = a, [bx, by, bz] = b;
      const near = .5;
      if (az < near && bz < near) return;
      if (az < near) { const k = (near - az) / (bz - az); ax += (bx - ax) * k; ay += (by - ay) * k; az = near; }
      if (bz < near) { const k = (near - bz) / (az - bz); bx += (ax - bx) * k; by += (ay - by) * k; bz = near; }
      cx.moveTo(this.vx + ax / az * this.F, this.vy - ay / az * this.F);
      cx.lineTo(this.vx + bx / bz * this.F, this.vy - by / bz * this.F);
    },
    rel(x, y, z) { return [x - this.camX, y - this.camY, z - this.z]; },
    screen(x, y, z) { const [a, b, c] = this.rel(x, y, z); return c > .5 ? [this.vx + a / c * this.F, this.vy - b / c * this.F] : null; },
    step(dt) {
      if (this.done > 0) { this.done += dt; if (this.done > 3.2) this.start(); return; }
      this.z += SPEED * dt;
      // Dip under the next catwalk, then rise again; weave a little.
      const next = this.cats.find(c => c > this.z);
      const wantY = next !== undefined && next - this.z < 14 ? .7 : 1.4;
      this.camY += (wantY - this.camY) * Math.min(1, dt * 3);
      this.camX = Math.sin(this.z * .05) * .5;
      // Turrets fire at the ship; the lasers answer the nearest.
      for (const tu of this.turrets) {
        const d = tu.z - this.z;
        if (tu.dead || d < 4 || d > 60) continue;
        tu.fire -= dt;
        if (tu.fire <= 0) { tu.fire = rand(1.2, 2.2); this.balls.push({ x: tu.side * TRENCH_W, y: TRENCH_H, z: tu.z, age: 0 }); }
      }
      for (const f of this.balls) {
        f.age += dt;
        // Coming at the ship: towards its line, and back along the trench faster than it flies.
        f.x += (this.camX - f.x) * dt * 1.2; f.y += (this.camY - f.y) * dt * 1.2; f.z -= 14 * dt;
      }
      this.balls = this.balls.filter(f => f.z > this.z + .6 && f.age < 4);
      this.laserWait -= dt;
      const target = this.turrets.filter(tu => !tu.dead && tu.z - this.z > 10 && tu.z - this.z < 40).sort((a, b) => a.z - b.z)[0];
      if (target && this.laserWait <= 0) {
        this.laserWait = .45;
        const p = this.screen(target.side * TRENCH_W, TRENCH_H + .2, target.z);
        if (p) {
          this.lasers.push({ x: p[0], y: p[1], age: 0 });
          if (Math.random() < .6) { target.dead = true; sparkBurst(this.sparks, p[0], p[1], 18, 120, "255,179,71"); }
        }
      }
      for (const l of this.lasers) l.age += dt;
      this.lasers = this.lasers.filter(l => l.age < .18);
      // The port: a torpedo goes in.
      if (!this.torpedo && RUN - this.z < 24) this.torpedo = { z: this.z + 2, y: this.camY - .3, x: this.camX };
      if (this.torpedo) {
        const tp = this.torpedo;
        tp.z += SPEED * 1.8 * dt; tp.y += (0 - tp.y) * dt * 1.4; tp.x += (0 - tp.x) * dt * 2;
        if (tp.z >= RUN) { this.done = .001; this.torpedo = null; }
      }
      if (this.z > RUN - 3) this.z = RUN - 3;
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, .38);
      if (this.done > 0) {
        // The flash: rings of light, then sparks, then on to the next run.
        const k = this.done;
        for (let i = 0; i < 5; i++) {
          const r = (k * 260 - i * 50);
          if (r <= 0) continue;
          beam(`rgba(255,${200 - i * 30},${120 + i * 20},${Math.max(0, 1 - k / 3)})`, 20); cx.lineWidth = 3;
          cx.beginPath(); cx.arc(this.vx, this.vy, r, 0, Math.PI * 2); cx.stroke();
        }
        if (k < .3) { cx.fillStyle = `rgba(255,255,255,${.5 * (1 - k / .3)})`; cx.fillRect(0, 0, W, H); }
        return;
      }
      const G = "#5c8cff", L = (a, b) => this.line(this.rel(...a), this.rel(...b));
      // The trench: its edges stream away to the horizon, ribs crossing it every few metres.
      beam(G, 8); cx.lineWidth = 1.3;
      cx.beginPath();
      // (From a few metres ahead, so the nearest lines don't sweep across the whole hero.)
      const near = this.z + 4, far = this.z + 140;
      for (const [x, y] of [[-TRENCH_W, 0], [TRENCH_W, 0], [-TRENCH_W, TRENCH_H], [TRENCH_W, TRENCH_H]]) L([x, y, near], [x, y, far]);
      for (let z = Math.ceil(near / 8) * 8; z < far; z += 8) {
        L([-TRENCH_W, TRENCH_H, z], [-TRENCH_W, 0, z]); L([-TRENCH_W, 0, z], [TRENCH_W, 0, z]); L([TRENCH_W, 0, z], [TRENCH_W, TRENCH_H, z]);
        // The surface either side of the rims.
        L([-TRENCH_W - 2.5, TRENCH_H, z], [-TRENCH_W, TRENCH_H, z]); L([TRENCH_W, TRENCH_H, z], [TRENCH_W + 2.5, TRENCH_H, z]);
      }
      cx.stroke();
      // Catwalks across the trench.
      beam("#ffe14a", 8); cx.lineWidth = 1.5;
      cx.beginPath();
      for (const c of this.cats) if (c > near && c < far) { L([-TRENCH_W, 1.9, c], [TRENCH_W, 1.9, c]); L([-TRENCH_W, 2.2, c], [TRENCH_W, 2.2, c]); }
      cx.stroke();
      // Turrets on the rims.
      beam("#72ff8f", 8); cx.lineWidth = 1.4;
      cx.beginPath();
      for (const tu of this.turrets) {
        if (tu.dead || tu.z < this.z || tu.z > far) continue;
        const x = tu.side * TRENCH_W, z = tu.z;
        L([x - .3, TRENCH_H, z], [x - .3, TRENCH_H + .5, z]); L([x - .3, TRENCH_H + .5, z], [x + .3, TRENCH_H + .5, z]);
        L([x + .3, TRENCH_H + .5, z], [x + .3, TRENCH_H, z]); L([x, TRENCH_H + .5, z], [x - tu.side * .6, TRENCH_H + .7, z]);
      }
      cx.stroke();
      // The exhaust port, on the floor at the end.
      if (RUN - this.z < 140) {
        beam("#ff4fd8", 12); cx.lineWidth = 1.8;
        cx.beginPath();
        for (const s of [.8, .4]) { L([-s, 0, RUN - s], [s, 0, RUN - s]); L([s, 0, RUN - s], [s, 0, RUN + s]); L([s, 0, RUN + s], [-s, 0, RUN + s]); L([-s, 0, RUN + s], [-s, 0, RUN - s]); }
        cx.stroke();
      }
      // Fireballs coming at the ship.
      beam("#ff4a4a", 12); cx.lineWidth = 1.6;
      for (const f of this.balls) {
        const p = this.screen(f.x, f.y, f.z);
        if (!p) continue;
        const r = Math.min(26, 60 / Math.max(1, f.z - this.z));
        cx.beginPath();
        for (let k = 0; k < 3; k++) { const a = f.age * 8 + k * Math.PI / 3; cx.moveTo(p[0] - Math.cos(a) * r, p[1] - Math.sin(a) * r); cx.lineTo(p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r); }
        cx.stroke();
      }
      // The ship's lasers, from the corners of the view to the target.
      beam("#ff4a4a", 14); cx.lineWidth = 2;
      cx.beginPath();
      for (const l of this.lasers) { cx.moveTo(this.vx - W * .3, H); cx.lineTo(l.x, l.y); cx.moveTo(this.vx + W * .3, H); cx.lineTo(l.x, l.y); }
      cx.stroke();
      if (this.torpedo) {
        const p = this.screen(this.torpedo.x, this.torpedo.y, this.torpedo.z);
        if (p) { beam("#ffffff", 16); cx.fillStyle = "#ffffff"; cx.beginPath(); cx.arc(p[0], p[1], 3, 0, Math.PI * 2); cx.fill(); }
      }
      // The sight.
      beam("rgba(255,225,74,.8)", 6); cx.lineWidth = 1.3;
      const sx = this.vx, sy = this.vy + 30;
      cx.beginPath();
      cx.moveTo(sx - 26, sy); cx.lineTo(sx - 8, sy); cx.moveTo(sx + 8, sy); cx.lineTo(sx + 26, sy);
      cx.moveTo(sx, sy - 22); cx.lineTo(sx, sy - 8); cx.moveTo(sx, sy + 8); cx.lineTo(sx, sy + 22);
      cx.stroke();
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // The area a scene plays in: the right-hand part of the hero, clear of the text, or all of it on a phone.
  const arena = (pad = 16) => {
    const x0 = W < 700 ? pad : W * .46;
    return { x0, y0: pad, x1: W - pad, y1: H - pad, w: W - pad - x0, h: H - pad * 2 };
  };

  // ----- Pac-Man: the muncher clearing a maze while four ghosts hunt it -----
  // The walls are drawn as outlines, like the cabinet's double-line maze. The muncher heads for the nearest
  // dot by the shortest way that keeps clear of the ghosts; a power pellet turns the tables for a while, and
  // the ghosts it eats go back to the middle to start again.
  const MAZE = [
    "###################",
    "#o.......#.......o#",
    "#.##.###.#.###.##.#",
    "#.................#",
    "#.##.#.#####.#.##.#",
    "#....#...#...#....#",
    "####.###.#.###.####",
    "#........ ........#",
    "#.##.###.#.###.##.#",
    "#o.#...........#.o#",
    "#..#.#.#####.#.#..#",
    "#....#.......#....#",
    "###################",
  ];
  const MW = MAZE[0].length, MH = MAZE.length;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const GHOSTS = ["#ff4a4a", "#ffb8ff", "#5ce1ff", "#ffb347"];
  const walkable = (c, r) => MAZE[r]?.[c] !== undefined && MAZE[r][c] !== "#";
  const pacman = {
    name: "PAC-MAN",
    layout() {
      const a = arena(20);
      this.cs = Math.max(8, Math.floor(Math.min(a.w / MW, a.h / MH)));
      this.ox = a.x0 + (a.w - this.cs * MW) / 2; this.oy = a.y0 + (a.h - this.cs * MH) / 2;
      if (!this.dots) this.reset(true);
    },
    reset(full) {
      if (full) {
        this.dots = new Set();
        MAZE.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === "." || ch === "o") this.dots.add(r * MW + c); }));
        this.flash = 0;
      }
      this.pac = { c: 9, r: 9, nc: 9, nr: 9, p: 1, d: 2, speed: 6 };
      this.ghosts = GHOSTS.map((colour, i) => ({ colour, c: 9, r: 7, nc: 9, nr: 7, p: 1, d: i % 2 ? 0 : 2, speed: 5.2, wait: i * 1.5, i }));
      this.power = 0; this.dying = 0; this.sparks = this.sparks ?? [];
    },
    start() { if (!this.dots) this.reset(true); },
    at(e) { return [e.c + (e.nc - e.c) * e.p, e.r + (e.nr - e.r) * e.p]; },
    // Shortest way from a cell to any target cell, avoiding cells the ghosts are near: the first step's direction.
    route(c, r, isTarget, avoid) {
      const seen = new Map([[r * MW + c, -1]]), queue = [[c, r]];
      while (queue.length) {
        const [qc, qr] = queue.shift();
        if ((qc !== c || qr !== r) && isTarget(qc, qr)) {
          // Back along the way it came to the first step out of the start.
          let k = qr * MW + qc;
          while (seen.get(k) !== r * MW + c) k = seen.get(k);
          const fc = k % MW, fr = Math.floor(k / MW);
          return DIRS.findIndex(([dc, dr]) => c + dc === fc && r + dr === fr);
        }
        for (const [dc, dr] of DIRS) {
          const nc = qc + dc, nr = qr + dr, k = nr * MW + nc;
          if (!walkable(nc, nr) || seen.has(k) || avoid(nc, nr)) continue;
          seen.set(k, qr * MW + qc); queue.push([nc, nr]);
        }
      }
      return -1;
    },
    step(dt) {
      const pac = this.pac;
      if (this.flash > 0) { this.flash -= dt; if (this.flash <= 0) this.reset(true); return; }
      if (this.dying > 0) { this.dying -= dt; if (this.dying <= 0) this.reset(false); return; }
      this.power = Math.max(0, this.power - dt);
      const ghostNear = (c, r, d) => this.ghosts.some(g => g.wait <= 0 && !g.scared && Math.abs(g.c - c) + Math.abs(g.r - r) <= d);
      // The muncher: at each cell, the next step towards its target.
      pac.p += pac.speed * dt;
      if (pac.p >= 1) {
        pac.c = pac.nc; pac.r = pac.nr; pac.p = 0;
        const k = pac.r * MW + pac.c;
        if (this.dots.delete(k) && MAZE[pac.r][pac.c] === "o") { this.power = 6; for (const g of this.ghosts) g.scared = g.wait <= 0; }
        let d = -1;
        if (this.power > 1.5) d = this.route(pac.c, pac.r, (c, r) => this.ghosts.some(g => g.scared && g.c === c && g.r === r), () => false);
        if (d < 0) d = this.route(pac.c, pac.r, (c, r) => this.dots.has(r * MW + c), (c, r) => ghostNear(c, r, 1));
        if (d < 0) {
          // Cornered: whichever way gets furthest from the ghosts.
          let best = -1;
          DIRS.forEach(([dc, dr], i) => {
            if (!walkable(pac.c + dc, pac.r + dr)) return;
            const room = Math.min(...this.ghosts.map(g => Math.abs(g.c - pac.c - dc) + Math.abs(g.r - pac.r - dr)));
            if (room > best) { best = room; d = i; }
          });
        }
        if (d >= 0) { pac.d = d; pac.nc = pac.c + DIRS[d][0]; pac.nr = pac.r + DIRS[d][1]; }
        else { pac.nc = pac.c; pac.nr = pac.r; }
        if (!this.dots.size) { this.flash = 1.8; return; }
      }
      // The ghosts: no turning back; at each cell, the way that brings each nearest its own target.
      for (const g of this.ghosts) {
        if (g.wait > 0) { g.wait -= dt; continue; }
        if (g.scared && this.power <= 0) g.scared = false;
        g.p += (g.scared ? 3.2 : g.speed) * dt;
        if (g.p < 1) continue;
        g.c = g.nc; g.r = g.nr; g.p = 0;
        const ahead = DIRS[pac.d];
        const [tc, tr] = g.scared ? [rand(0, MW), rand(0, MH)]
          : g.i === 0 ? [pac.c, pac.r]
          : g.i === 1 ? [pac.c + ahead[0] * 4, pac.r + ahead[1] * 4]
          : g.i === 2 ? [pac.c + rand(-5, 5), pac.r + rand(-4, 4)]
          : Math.abs(g.c - pac.c) + Math.abs(g.r - pac.r) > 7 ? [pac.c, pac.r] : [0, MH];
        let best = -1, bd = Infinity;
        DIRS.forEach(([dc, dr], i) => {
          if (i === (g.d + 2) % 4 || !walkable(g.c + dc, g.r + dr)) return;
          const dd = Math.hypot(g.c + dc - tc, g.r + dr - tr);
          if (dd < bd) { bd = dd; best = i; }
        });
        if (best < 0) best = (g.d + 2) % 4;
        g.d = best; g.nc = g.c + DIRS[best][0]; g.nr = g.r + DIRS[best][1];
      }
      // Caught, or eating.
      const [px, py] = this.at(pac);
      for (const g of this.ghosts) {
        if (g.wait > 0) continue;
        const [gx, gy] = this.at(g);
        if (Math.hypot(gx - px, gy - py) > .6) continue;
        const sx = this.ox + (gx + .5) * this.cs, sy = this.oy + (gy + .5) * this.cs;
        if (g.scared) {
          sparkBurst(this.sparks, sx, sy, 12, 90, "92,140,255");
          Object.assign(g, { c: 9, r: 7, nc: 9, nr: 7, p: 1, scared: false, wait: 1.2 });
        } else {
          this.dying = 1.6;
          sparkBurst(this.sparks, this.ox + (px + .5) * this.cs, this.oy + (py + .5) * this.cs, 18, 110, "255,225,74");
          return;
        }
      }
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      const cs = this.cs, ox = this.ox, oy = this.oy;
      // The walls: blue outlines, flashing white when the maze is cleared.
      beam(this.flash > 0 && Math.sin(t * 20) > 0 ? "#ffffff" : "#4a7dff", 10); cx.lineWidth = 1.6;
      cx.beginPath();
      outline((c, r) => MAZE[r]?.[c] === "#", MW, MH, (x0, y0, x1, y1) => { cx.moveTo(ox + x0 * cs, oy + y0 * cs); cx.lineTo(ox + x1 * cs, oy + y1 * cs); });
      cx.stroke();
      // Dots, and the power pellets blinking.
      beam("#ffd8a0", 6); cx.fillStyle = "#ffd8a0";
      for (const k of this.dots) {
        const c = k % MW, r = Math.floor(k / MW), x = ox + (c + .5) * cs, y = oy + (r + .5) * cs;
        if (MAZE[r][c] === "o") { if (Math.sin(t * 8) > -.3) { cx.beginPath(); cx.arc(x, y, cs * .28, 0, Math.PI * 2); cx.fill(); } }
        else cx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
      // The ghosts: a dome, a wavy hem and eyes looking the way they go; blue and blinking when scared.
      for (const g of this.ghosts) {
        const [gc, gr] = this.at(g), x = ox + (gc + .5) * cs, y = oy + (gr + .5) * cs, R = cs * .42;
        const fading = g.scared && this.power < 2 && Math.sin(t * 16) > 0;
        beam(g.scared ? (fading ? "#ffffff" : "#4a7dff") : g.colour, 10); cx.lineWidth = 1.6;
        cx.beginPath();
        cx.moveTo(x - R, y + R); cx.lineTo(x - R, y); cx.arc(x, y, R, Math.PI, 0); cx.lineTo(x + R, y + R);
        for (let k = 1; k <= 4; k++) cx.lineTo(x + R - k * R / 2, y + R - (k % 2 ? R * .35 : 0) * (Math.sin(t * 12) > 0 ? 1 : .4));
        cx.stroke();
        const [dc, dr] = DIRS[g.d];
        cx.shadowBlur = 0; cx.fillStyle = "#f2f2ff";
        for (const s of [-1, 1]) {
          cx.beginPath(); cx.arc(x + s * R * .38, y - R * .1, R * .22, 0, Math.PI * 2); cx.fill();
        }
        cx.fillStyle = g.scared ? "#ff8a8a" : "#1a2a6a";
        for (const s of [-1, 1]) cx.fillRect(x + s * R * .38 + dc * R * .1 - 1.5, y - R * .1 + dr * R * .1 - 1.5, 3, 3);
      }
      // The muncher: a wedge opening and closing the way it's going; caught, it folds away.
      const [pc, pr] = this.at(this.pac), x = ox + (pc + .5) * cs, y = oy + (pr + .5) * cs;
      const face = [0, Math.PI / 2, Math.PI, -Math.PI / 2][this.pac.d];
      let mouth = this.dying > 0 ? Math.PI * (1 - this.dying / 1.6) * .98 + .02 : .05 + .3 * Math.abs(Math.sin(t * 12));
      if (this.dying <= 0 || mouth < Math.PI * .97) {
        beam("#ffe14a", 12); cx.lineWidth = 1.8;
        cx.beginPath(); cx.moveTo(x, y); cx.arc(x, y, cs * .42, face + mouth, face + Math.PI * 2 - mouth); cx.closePath(); cx.stroke();
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Qix: a marker cutting boxes out of the playfield while the Qix swirls -----
  // The field is a grid of small cells. The marker runs round the frame, then cuts in, mostly turning towards
  // the nearer side to box off a corner, until it meets claimed ground; the side away from the Qix is filled in. If the Qix touches the cut while
  // it's being drawn, the cut is lost. Three quarters claimed, and the field is cleared for another go.
  const qix = {
    name: "QIX",
    layout() {
      const a = arena(22);
      this.g = W < 700 ? 6 : 8;
      this.gw = Math.floor(a.w / this.g); this.gh = Math.floor(a.h / this.g);
      this.ox = a.x0 + (a.w - this.gw * this.g) / 2; this.oy = a.y0 + (a.h - this.gh * this.g) / 2;
      this.reset();
    },
    reset() {
      const { gw, gh } = this;
      this.cells = new Uint8Array(gw * gh); // 0 open, 1 frame or cut, 2+ a fill colour
      for (let x = 0; x < gw; x++) { this.cells[x] = 1; this.cells[(gh - 1) * gw + x] = 1; }
      for (let y = 0; y < gh; y++) { this.cells[y * gw] = 1; this.cells[y * gw + gw - 1] = 1; }
      this.fills = 0;
      // The frame as a loop, for the marker and the Sparx to run round.
      this.ring = [];
      for (let x = 0; x < gw; x++) this.ring.push([x, 0]);
      for (let y = 1; y < gh; y++) this.ring.push([gw - 1, y]);
      for (let x = gw - 2; x >= 0; x--) this.ring.push([x, gh - 1]);
      for (let y = gh - 2; y > 0; y--) this.ring.push([0, y]);
      this.marker = { i: 0, x: 0, y: 0, mode: "run", goal: 0, path: [], drawn: 0, wait: 0 };
      this.sparx = rand(0, this.ring.length);
      const cxm = gw / 2, cym = gh / 2;
      this.qix = { a: [cxm - 4, cym], b: [cxm + 4, cym + 2], va: [rand(-9, 9), rand(-9, 9)], vb: [rand(-9, 9), rand(-9, 9)], trail: [], clock: 0, hue: 0 };
      this.sparks = this.sparks ?? []; this.flash = 0; this.colour = 0;
    },
    start() { if (!this.cells) this.layout(); },
    claimed(x, y) { x = Math.floor(x); y = Math.floor(y); return x < 0 || y < 0 || x >= this.gw || y >= this.gh || this.cells[y * this.gw + x] !== 0; },
    // A cut: in from a frame cell, then on until it meets claimed ground.
    plan() {
      const { gw, gh } = this, n = this.ring.length;
      let best = null, cost = Infinity;
      for (let tries = 0; tries < 40; tries++) {
        const i = Math.floor(rand(0, this.ring.length)), [sx, sy] = this.ring[i];
        const d = sx === 0 ? [1, 0] : sx === gw - 1 ? [-1, 0] : sy === 0 ? [0, 1] : [0, -1];
        if (this.claimed(sx + d[0], sy + d[1])) continue;
        // In a way, then (mostly) a turn towards the nearer side, boxing off a corner; now and then straight across.
        const path = []; let x = sx, y = sy, dir = d, turned = Math.random() < .25;
        const leg = Math.floor(rand(6, d[0] ? gw * .35 : gh * .45));
        for (let k = 0; k < 600; k++) {
          if (!turned && path.length === leg) {
            dir = d[0] ? [0, y < gh / 2 ? -1 : 1] : [x < gw / 2 ? -1 : 1, 0];
            turned = true;
          }
          const nx = x + dir[0], ny = y + dir[1];
          if (this.claimed(nx, ny)) break;
          x = nx; y = ny; path.push([x, y]);
        }
        if (path.length < 4) continue;
        // The best: not far round the frame to get there, and a cut long enough to take a good piece.
        let ring = Math.abs(i - this.marker.i) % n; ring = Math.min(ring, n - ring);
        const c = ring / 90 + Math.abs(path.length - 40) / 20 + rand(0, .5);
        if (c < cost) { cost = c; best = { i, path }; }
      }
      return best;
    },
    finish() {
      const { gw, gh } = this, m = this.marker;
      for (const [x, y] of m.path) this.cells[y * gw + x] = 1;
      // Flood from the Qix; whatever open ground it can't reach is filled.
      const q = this.qix, start = [Math.floor((q.a[0] + q.b[0]) / 2), Math.floor((q.a[1] + q.b[1]) / 2)];
      const reach = new Uint8Array(gw * gh), stack = [start];
      while (stack.length) {
        const [x, y] = stack.pop();
        if (this.claimed(x, y) || reach[y * gw + x]) continue;
        reach[y * gw + x] = 1;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      const colour = 2 + (this.colour++ % 3);
      for (let k = 0; k < gw * gh; k++) if (this.cells[k] === 0 && !reach[k]) this.cells[k] = colour;
      const [ex, ey] = m.path[m.path.length - 1];
      sparkBurst(this.sparks, this.ox + (ex + .5) * this.g, this.oy + (ey + .5) * this.g, 14, 90, "255,225,74");
      m.path = []; m.mode = "run"; m.wait = .4;
      for (const p of [q.a, q.b]) if (this.claimed(p[0], p[1])) { p[0] = start[0] + .5; p[1] = start[1] + .5; }
      let taken = 0; for (const v of this.cells) if (v) taken++;
      if (taken / (gw * gh) > .74) this.flash = 2;
    },
    step(dt) {
      if (this.flash > 0) { this.flash -= dt; if (this.flash <= 0) this.reset(); return; }
      const m = this.marker, q = this.qix, ring = this.ring, n = ring.length;
      // The Qix: two ends wandering and bouncing off claimed ground, leaving a fan of lines behind.
      for (const [p, v] of [[q.a, q.va], [q.b, q.vb]]) {
        v[0] += rand(-30, 30) * dt; v[1] += rand(-30, 30) * dt;
        const sp = Math.hypot(v[0], v[1]); if (sp > 14) { v[0] *= 14 / sp; v[1] *= 14 / sp; }
        if (this.claimed(p[0] + v[0] * dt, p[1])) v[0] = -v[0]; else p[0] += v[0] * dt;
        if (this.claimed(p[0], p[1] + v[1] * dt)) v[1] = -v[1]; else p[1] += v[1] * dt;
      }
      if (Math.hypot(q.a[0] - q.b[0], q.a[1] - q.b[1]) > 12) { q.vb[0] += (q.a[0] - q.b[0]) * dt; q.vb[1] += (q.a[1] - q.b[1]) * dt; }
      q.clock += dt; q.hue = (q.hue + dt * 90) % 360;
      if (q.clock > .06) { q.clock = 0; q.trail.unshift([[...q.a], [...q.b], q.hue]); q.trail.length = Math.min(q.trail.length, 9); }
      this.sparx = (this.sparx + dt * 20) % n;
      if (m.wait > 0) { m.wait -= dt; return; }
      if (m.mode === "run") {
        if (!m.plan) m.plan = this.plan();
        if (!m.plan) { this.flash = 1; return; }
        // Round the frame the short way to where the cut starts.
        let diff = (m.plan.i - m.i + n) % n; if (diff > n / 2) diff -= n;
        const stepCells = dt * 90;
        if (Math.abs(diff) <= stepCells) { m.i = m.plan.i; m.mode = "cut"; m.path = m.plan.path; m.drawn = 0; m.plan = null; }
        else m.i = (m.i + Math.sign(diff) * stepCells + n) % n;
        [m.x, m.y] = ring[Math.floor(m.i) % n];
      } else {
        m.drawn += dt * 28;
        const k = Math.min(m.path.length - 1, Math.floor(m.drawn));
        [m.x, m.y] = m.path[k];
        // The Qix touching the cut so far: the cut is lost.
        const cut = new Set(m.path.slice(0, k + 1).map(([x, y]) => y * this.gw + x));
        for (let s = 0; s <= 4; s++) {
          const x = Math.floor(q.a[0] + (q.b[0] - q.a[0]) * s / 4), y = Math.floor(q.a[1] + (q.b[1] - q.a[1]) * s / 4);
          if (!cut.has(y * this.gw + x)) continue;
          sparkBurst(this.sparks, this.ox + (m.x + .5) * this.g, this.oy + (m.y + .5) * this.g, 18, 120, "255,79,216");
          m.mode = "run"; m.path = []; m.wait = 1;
          return;
        }
        if (m.drawn >= m.path.length) this.finish();
      }
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      const { g, gw, gh, ox, oy } = this;
      const fills = ["", "", "rgba(74,125,255,.18)", "rgba(255,79,216,.16)", "rgba(114,255,143,.14)"];
      for (let y = 0; y < gh; y++)
        for (let x = 0; x < gw; x++) {
          const v = this.cells[y * gw + x];
          if (v >= 2) { cx.fillStyle = this.flash > 0 && Math.sin(t * 18) > 0 ? "rgba(255,255,255,.25)" : fills[v]; cx.fillRect(ox + x * g, oy + y * g, g, g); }
        }
      // The edges of claimed ground.
      beam("#5ce1ff", 8); cx.lineWidth = 1.4;
      cx.beginPath();
      outline((x, y) => x >= 0 && y >= 0 && x < gw && y < gh && this.cells[y * gw + x] === 0, gw, gh,
        (x0, y0, x1, y1) => { cx.moveTo(ox + x0 * g, oy + y0 * g); cx.lineTo(ox + x1 * g, oy + y1 * g); });
      cx.stroke();
      // The cut being drawn.
      const m = this.marker;
      if (m.mode === "cut" && m.path.length) {
        beam("#ff4a4a", 10); cx.lineWidth = 2;
        cx.beginPath();
        const k = Math.min(m.path.length, Math.floor(m.drawn) + 1);
        const [sx, sy] = this.ring[Math.floor(m.i) % this.ring.length];
        cx.moveTo(ox + (sx + .5) * g, oy + (sy + .5) * g);
        for (let i = 0; i < k; i++) cx.lineTo(ox + (m.path[i][0] + .5) * g, oy + (m.path[i][1] + .5) * g);
        cx.stroke();
      }
      // The Qix's fan of lines, its colours shifting.
      const q = this.qix;
      q.trail.forEach(([a, b, hue], i) => {
        beam(`hsla(${hue},100%,65%,${1 - i / 10})`, 10); cx.lineWidth = 1.6;
        cx.beginPath(); cx.moveTo(ox + a[0] * g, oy + a[1] * g); cx.lineTo(ox + b[0] * g, oy + b[1] * g); cx.stroke();
      });
      // The marker, a diamond, and a Sparx running round the frame.
      const mx = ox + (m.x + .5) * g, my = oy + (m.y + .5) * g;
      beam("#ffffff", 12); cx.lineWidth = 1.8;
      cx.beginPath(); cx.moveTo(mx, my - 6); cx.lineTo(mx + 6, my); cx.lineTo(mx, my + 6); cx.lineTo(mx - 6, my); cx.closePath(); cx.stroke();
      const [zx, zy] = this.ring[Math.floor(this.sparx) % this.ring.length], sxp = ox + (zx + .5) * g, syp = oy + (zy + .5) * g;
      beam("#ffe14a", 12); cx.lineWidth = 1.4;
      cx.beginPath();
      for (let k = 0; k < 4; k++) { const ang = t * 9 + k * Math.PI / 2; cx.moveTo(sxp, syp); cx.lineTo(sxp + Math.cos(ang) * 6, syp + Math.sin(ang) * 6); }
      cx.stroke();
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Defender: a ship skimming the mountains, saving the humanoids from the landers -----
  // The world is three screens wide and wraps. Landers drift down to snatch a humanoid and carry it up; the
  // ship goes for those first, lines up and fires its long laser. A humanoid let go of falls back to the
  // ground. The scanner along the top shows the whole world.
  const defender = {
    name: "DEFENDER",
    layout() {
      this.WW = Math.max(1800, W * 3);
      this.ground = [];
      let y = H * .86;
      for (let x = 0; x < this.WW; x += 24) { y = Math.min(H * .96, Math.max(H * .74, y + rand(-18, 18))); this.ground.push(y); }
      this.ground[this.ground.length - 1] = this.ground[0];
      if (!this.ship) this.reset();
    },
    reset() {
      this.ship = { x: 0, y: H * .45, vx: 0, face: 1, sx: W * .55, fire: 0 };
      this.humans = Array.from({ length: 6 }, (_, i) => ({ x: (i + .5) * this.WW / 6 + rand(-60, 60), y: 0, vy: 0, held: null }));
      this.landers = []; this.lasers = []; this.sparks = this.sparks ?? []; this.spawn = 0; this.bolts = [];
    },
    start() { if (!this.ship) this.layout(); },
    groundAt(x) {
      const n = this.ground.length, f = (((x % this.WW) + this.WW) % this.WW) / 24, i = Math.floor(f) % n;
      return this.ground[i] + (this.ground[(i + 1) % n] - this.ground[i]) * (f - Math.floor(f));
    },
    dx(a, b) { let d = b - a; const WW = this.WW; d = ((d % WW) + WW) % WW; return d > WW / 2 ? d - WW : d; },
    step(dt) {
      const s = this.ship, WW = this.WW;
      // Landers keep coming, five at most, each after a humanoid.
      this.spawn -= dt;
      if (this.spawn <= 0 && this.landers.length < 5) {
        this.spawn = rand(2, 4);
        this.landers.push({ x: s.x + rand(W * .6, WW - W * .6), y: H * .3, target: null, carry: null, t: rand(0, 6) });
      }
      for (const h of this.humans) {
        if (h.held) continue;
        const floor = this.groundAt(h.x) - 8;
        if (h.y < floor && h.y > 0) { h.vy += 120 * dt; h.y = Math.min(floor, h.y + h.vy * dt); }
        else { h.y = floor; h.vy = 0; }
      }
      for (const l of this.landers) {
        l.t += dt;
        if (!l.target || l.target.held && l.target.held !== l) l.target = this.humans.filter(h => !h.held).sort((a, b) => Math.abs(this.dx(l.x, a.x)) - Math.abs(this.dx(l.x, b.x)))[0] ?? null;
        if (l.carry) {
          l.y -= 34 * dt;
          l.carry.x = l.x; l.carry.y = l.y + 16;
          // At the top, the humanoid is lost; it's back on the ground somewhere a moment later.
          if (l.y < H * .2) { l.carry.held = null; l.carry.x = rand(0, WW); l.carry.y = 0; l.dead = true; }
        } else if (l.target) {
          const d = this.dx(l.x, l.target.x);
          l.x = ((l.x + Math.sign(d) * Math.min(Math.abs(d), 60 * dt)) % WW + WW) % WW;
          l.y += (Math.abs(d) < 30 ? 40 : 6 * Math.sin(l.t * 2)) * dt;
          if (Math.abs(d) < 6 && l.y > l.target.y - 22) { l.carry = l.target; l.target.held = l; }
        }
        if (Math.random() < dt * .3 && Math.abs(this.dx(s.x, l.x)) < W * .5) {
          const ax = this.dx(l.x, s.x), ay = s.y - l.y, d = Math.hypot(ax, ay) || 1;
          this.bolts.push({ x: l.x, y: l.y, vx: ax / d * 140, vy: ay / d * 140, age: 0 });
        }
      }
      this.landers = this.landers.filter(l => !l.dead);
      for (const b of this.bolts) { b.x += b.vx * dt; b.y += b.vy * dt; b.age += dt; }
      this.bolts = this.bolts.filter(b => b.age < 3);
      // The ship: after a lander carrying someone first, else the nearest; to its height, facing it, laser.
      const pick = this.landers.slice().sort((a, b) => (a.carry ? 0 : 1) - (b.carry ? 0 : 1) || Math.abs(this.dx(s.x, a.x)) - Math.abs(this.dx(s.x, b.x)))[0];
      if (pick) {
        const d = this.dx(s.x, pick.x);
        s.face = d >= 0 ? 1 : -1;
        const want = d - s.face * 260;
        s.vx += Math.sign(want) * Math.min(Math.abs(want) * 2, 600) * dt;
        s.y += Math.max(-160 * dt, Math.min(160 * dt, pick.y - s.y));
        s.fire -= dt;
        if (s.fire <= 0 && Math.abs(pick.y - s.y) < 8 && Math.abs(d) < W * .55) {
          s.fire = .45;
          this.lasers.push({ x: s.x + s.face * 18, y: s.y + 2, dir: s.face, len: 0, age: 0 });
        }
      } else s.vx += s.face * 200 * dt;
      s.vx *= 1 - 1.4 * dt;
      s.vx = Math.max(-520, Math.min(520, s.vx));
      s.x = ((s.x + s.vx * dt) % WW + WW) % WW;
      s.y = Math.max(H * .16, Math.min(this.groundAt(s.x) - 30, s.y));
      // On screen, the ship slides to one side so it faces the open part of the hero.
      const homeX = W < 700 ? (s.face > 0 ? W * .25 : W * .75) : (s.face > 0 ? W * .55 : W * .9);
      s.sx += (homeX - s.sx) * Math.min(1, 2 * dt);
      for (const z of this.lasers) {
        z.age += dt; z.len = Math.min(W * .6, z.len + 2600 * dt);
        for (const l of this.landers) {
          if (l.dead || Math.abs(l.y - z.y) > 12) continue;
          const d = this.dx(z.x, l.x) * z.dir;
          if (d < 0 || d > z.len) continue;
          l.dead = true;
          if (l.carry) { l.carry.held = null; l.carry.vy = 0; }
          sparkBurst(this.sparks, this.toScreen(l.x), l.y, 16, 120, "114,255,143");
        }
      }
      this.landers = this.landers.filter(l => !l.dead);
      this.lasers = this.lasers.filter(z => z.age < .3);
    },
    toScreen(x) { return this.ship.sx + this.dx(this.ship.x, x); },
    draw(t, dt) {
      if (!still) this.step(dt);
      const s = this.ship;
      // Stars drift past, slower than the ground.
      cx.shadowBlur = 0;
      for (const [x, y, b] of stars) {
        if (y > H * .7) continue;
        cx.fillStyle = `rgba(213,227,238,${b * .7})`;
        cx.fillRect(((x - s.x * .2) % W + W) % W, y, 1.5, 1.5);
      }
      // The mountains.
      beam("#ffb347", 8); cx.lineWidth = 1.5;
      cx.beginPath();
      for (let sx = 0; sx <= W + 24; sx += 12) { const y = this.groundAt(s.x + sx - s.sx); sx ? cx.lineTo(sx, y) : cx.moveTo(sx, y); }
      cx.stroke();
      // Humanoids.
      beam("#ff4fd8", 8); cx.lineWidth = 1.5;
      for (const h of this.humans) {
        const x = this.toScreen(h.x); if (x < -20 || x > W + 20) continue;
        cx.beginPath(); cx.moveTo(x, h.y - 8); cx.lineTo(x, h.y + 2); cx.moveTo(x - 4, h.y - 4); cx.lineTo(x + 4, h.y - 4);
        cx.moveTo(x, h.y + 2); cx.lineTo(x - 3, h.y + 8); cx.moveTo(x, h.y + 2); cx.lineTo(x + 3, h.y + 8); cx.stroke();
      }
      // Landers: a dome on legs, green and yellow.
      for (const l of this.landers) {
        const x = this.toScreen(l.x); if (x < -30 || x > W + 30) continue;
        beam("#72ff8f", 10); cx.lineWidth = 1.6;
        cx.beginPath(); cx.arc(x, l.y, 8, Math.PI, 0); cx.lineTo(x + 10, l.y + 4); cx.lineTo(x - 10, l.y + 4); cx.closePath();
        cx.moveTo(x - 7, l.y + 4); cx.lineTo(x - 11, l.y + 12); cx.moveTo(x + 7, l.y + 4); cx.lineTo(x + 11, l.y + 12); cx.stroke();
        beam("#ffe14a", 8); cx.fillStyle = "#ffe14a";
        cx.fillRect(x - 4 + Math.sin(l.t * 6) * 3, l.y - 3, 3, 3);
      }
      beam("#ff8a8a", 8); cx.fillStyle = "#ff8a8a";
      for (const b of this.bolts) cx.fillRect(this.toScreen(b.x) - 2, b.y - 2, 4, 4);
      // The laser: a long streak, banded in colours, thinning out at its tip.
      for (const z of this.lasers) {
        const x0 = this.toScreen(z.x), fade = 1 - z.age / .3;
        for (let k = 0; k < 6; k++) {
          const a = z.len * k / 6, b = z.len * (k + 1) / 6;
          beam(["#ffffff", "#ff4fd8", "#5ce1ff", "#ffe14a", "#72ff8f", "#ff4a4a"][k], 8);
          cx.globalAlpha *= fade * (1 - k * .12); cx.lineWidth = 2;
          cx.beginPath(); cx.moveTo(x0 + a * z.dir, z.y); cx.lineTo(x0 + b * z.dir, z.y); cx.stroke();
          cx.globalAlpha /= fade * (1 - k * .12);
        }
      }
      // The ship: a long nose, a fin, and its flame behind.
      const x = s.sx, y = s.y, f = s.face;
      beam("#f2f2ff", 12); cx.lineWidth = 1.6;
      cx.beginPath(); cx.moveTo(x + f * 20, y + 2); cx.lineTo(x - f * 4, y - 4); cx.lineTo(x - f * 14, y - 10); cx.lineTo(x - f * 16, y);
      cx.lineTo(x - f * 16, y + 5); cx.closePath(); cx.stroke();
      if (Math.abs(s.vx) > 60 && Math.sin(t * 40) > -.3) {
        beam("#ff4fd8", 12);
        cx.beginPath(); cx.moveTo(x - f * 16, y); cx.lineTo(x - f * (26 + Math.random() * 10), y + 2); cx.lineTo(x - f * 16, y + 5); cx.stroke();
      }
      // The scanner: the whole world at a glance, top right.
      const sw = Math.min(W * .4, 360), sx0 = W - sw - 16, sy0 = 10, sh = 40;
      beam("rgba(92,225,255,.5)", 0); cx.lineWidth = 1;
      cx.strokeRect(sx0, sy0, sw, sh);
      const toScan = wx => sx0 + sw / 2 + this.dx(s.x, wx) / this.WW * sw;
      beam("rgba(255,179,71,.7)", 0);
      cx.beginPath();
      for (let k = 0; k <= 60; k++) { const wx = s.x - this.WW / 2 + k * this.WW / 60, yy = sy0 + (this.groundAt(wx) / H) * sh; k ? cx.lineTo(toScan(wx), yy) : cx.moveTo(toScan(wx), yy); }
      cx.stroke();
      cx.fillStyle = "#72ff8f"; for (const l of this.landers) cx.fillRect(toScan(l.x) - 1.5, sy0 + l.y / H * sh - 1.5, 3, 3);
      cx.fillStyle = "#ff4fd8"; for (const h of this.humans) cx.fillRect(toScan(h.x) - 1, sy0 + h.y / H * sh - 1, 2, 2);
      cx.fillStyle = "#ffffff"; cx.fillRect(sx0 + sw / 2 - 2, sy0 + s.y / H * sh - 2, 4, 4);
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Tron: light cycles racing on the grid, each walling the others in -----
  // Three cycles leave walls behind them and can turn only at right angles. Each looks at the ways it could
  // go and takes the one with the most room beyond it, now and then cutting across another's path. Whoever
  // hits a wall de-rezzes; the last one riding wins the round.
  const tron = {
    name: "TRON",
    layout() {
      const a = arena(18);
      this.g = W < 700 ? 6 : 8;
      this.gw = Math.floor(a.w / this.g); this.gh = Math.floor(a.h / this.g);
      this.ox = a.x0 + (a.w - this.gw * this.g) / 2; this.oy = a.y0 + (a.h - this.gh * this.g) / 2;
      this.reset();
    },
    reset() {
      const { gw, gh } = this;
      this.grid = new Int8Array(gw * gh);
      const starts = [[Math.floor(gw * .2), Math.floor(gh * .5), 0], [Math.floor(gw * .8), Math.floor(gh * .3), 2], [Math.floor(gw * .6), Math.floor(gh * .85), 3]];
      this.cycles = [["#5ce1ff", "92,225,255"], ["#ffb347", "255,179,71"], ["#72ff8f", "114,255,143"]].map(([colour, rgb], i) => {
        const [c, r, d] = starts[i];
        return { colour, rgb, c, r, d, alive: true, fade: 1, trail: [[c, r]], id: i + 1 };
      });
      for (const y of this.cycles) this.grid[y.r * gw + y.c] = y.id;
      this.clock = 0; this.over = 0; this.sparks = this.sparks ?? [];
    },
    start() { if (!this.grid) this.layout(); },
    free(c, r) { return c >= 0 && r >= 0 && c < this.gw && r < this.gh && this.grid[r * this.gw + c] === 0; },
    // How much room there is beyond a cell, counted up to a limit.
    room(c, r) {
      const seen = new Set(), stack = [[c, r]];
      while (stack.length && seen.size < 220) {
        const [x, y] = stack.pop(), k = y * this.gw + x;
        if (seen.has(k) || !this.free(x, y)) continue;
        seen.add(k);
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      return seen.size;
    },
    step(dt) {
      if (this.over > 0) { this.over -= dt; if (this.over <= 0) this.reset(); return; }
      for (const y of this.cycles) if (!y.alive) y.fade = Math.max(0, y.fade - dt);
      this.clock += dt * 20;
      while (this.clock >= 1) {
        this.clock -= 1;
        const moves = [];
        for (const y of this.cycles.filter(y => y.alive)) {
          const foe = this.cycles.find(o => o !== y && o.alive);
          let best = -1, score = -Infinity;
          for (const turn of [0, 1, 3]) {
            const d = (y.d + turn) % 4, nc = y.c + DIRS[d][0], nr = y.r + DIRS[d][1];
            if (!this.free(nc, nr)) continue;
            let s = this.room(nc, nr) + (turn === 0 ? 25 : 0) + rand(0, 20);
            if (foe && s > 150) s += 30 - Math.min(30, Math.abs(nc - foe.c) + Math.abs(nr - foe.r)) * (Math.random() < .3 ? 1 : 0);
            if (s > score) { score = s; best = d; }
          }
          moves.push([y, best]);
        }
        for (const [y, d] of moves) {
          if (d < 0) { this.derez(y); continue; }
          if (d !== y.d) y.trail.push([y.c, y.r]);
          y.d = d; y.c += DIRS[d][0]; y.r += DIRS[d][1];
        }
        // Two into the same cell: both go.
        for (const [y] of moves) {
          if (!y.alive) continue;
          if (this.cycles.some(o => o !== y && o.alive && o.c === y.c && o.r === y.r)) this.derez(y);
          else this.grid[y.r * this.gw + y.c] = y.id;
        }
        if (this.cycles.filter(y => y.alive).length <= 1) { this.over = 2.2; break; }
      }
      // A wall gone dark is cleared away.
      for (const y of this.cycles)
        if (!y.alive && y.fade <= 0 && !y.cleared) { y.cleared = true; for (let k = 0; k < this.grid.length; k++) if (this.grid[k] === y.id) this.grid[k] = 0; }
    },
    derez(y) {
      y.alive = false; y.fade = 1;
      sparkBurst(this.sparks, this.ox + (y.c + .5) * this.g, this.oy + (y.r + .5) * this.g, 22, 130, y.rgb);
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      const { g, gw, gh, ox, oy } = this;
      // The grid floor.
      beam("rgba(30,60,110,.55)", 0); cx.lineWidth = 1;
      cx.beginPath();
      for (let x = 0; x <= gw; x += 4) { cx.moveTo(ox + x * g, oy); cx.lineTo(ox + x * g, oy + gh * g); }
      for (let y = 0; y <= gh; y += 4) { cx.moveTo(ox, oy + y * g); cx.lineTo(ox + gw * g, oy + y * g); }
      cx.stroke();
      beam("#5ce1ff", 8); cx.lineWidth = 1.4; cx.strokeRect(ox, oy, gw * g, gh * g);
      // The walls of light, and the cycles at their heads.
      for (const y of this.cycles) {
        if (y.fade <= 0) continue;
        const flick = y.alive ? 1 : y.fade * (Math.sin(t * 30) > 0 ? 1 : .5);
        cx.globalAlpha *= flick;
        beam(y.colour, 12); cx.lineWidth = 2.4;
        cx.beginPath();
        y.trail.forEach(([c, r], i) => i ? cx.lineTo(ox + (c + .5) * g, oy + (r + .5) * g) : cx.moveTo(ox + (c + .5) * g, oy + (r + .5) * g));
        cx.lineTo(ox + (y.c + .5) * g, oy + (y.r + .5) * g);
        cx.stroke();
        if (y.alive) {
          const [dc, dr] = DIRS[y.d], hx = ox + (y.c + .5) * g, hy = oy + (y.r + .5) * g;
          beam("#ffffff", 14); cx.lineWidth = 2;
          cx.beginPath(); cx.moveTo(hx - dc * 9 - dr * 3, hy - dr * 9 - dc * 3); cx.lineTo(hx + dc * 4 - dr * 3, hy + dr * 4 - dc * 3);
          cx.lineTo(hx + dc * 4 + dr * 3, hy + dr * 4 + dc * 3); cx.lineTo(hx - dc * 9 + dr * 3, hy - dr * 9 + dc * 3); cx.closePath(); cx.stroke();
        }
        cx.globalAlpha /= flick || 1;
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  // ----- Gravitar: a ship fighting gravity over a planet, knocking out its bunkers -----
  // Gravity pulls the ship down all the time. It climbs nose-up on its thruster, then turns to aim at the
  // nearest bunker and fires as it sinks, climbing again before it gets too low. The bunkers fire back.
  // With every bunker gone, the planet is left behind and a new one comes up.
  const gravitar = {
    name: "GRAVITAR",
    layout() {
      this.x0 = W < 700 ? 0 : W * .42;
      this.reset();
    },
    reset() {
      // The ground runs right across; the bunkers sit on flats out to the right, with hills between them.
      const pts = [], bunkers = [];
      let x = -10, y = H * .86, since = 9;
      while (x < W + 30) {
        if (bunkers.length < 4 && since >= 2 && x > this.x0 + 40 && x < W - 60 && Math.random() < .5) {
          pts.push([x, y], [x + 46, y]);
          bunkers.push({ x: x + 23, y, alive: true, fire: rand(1.5, 4), a: -Math.PI / 2 });
          x += 46; since = 0;
        } else {
          since++;
          y += rand(-70, 70);
          if (y < H * .58) y = H * .58 + rand(20, 60); else if (y > H * .95) y = H * .95 - rand(20, 60);
          pts.push([x, y]);
        }
        x += rand(26, 52);
      }
      this.pts = pts; this.bunkers = bunkers;
      this.ship = { x: (this.x0 + W) / 2, y: H * .2, vx: 0, vy: 0, a: -Math.PI / 2, alive: true, wait: 0, fire: 0, thrust: false, mode: "climb" };
      this.shots = []; this.bolts = []; this.sparks = this.sparks ?? []; this.next = 0;
    },
    start() { if (!this.pts) this.layout(); },
    groundAt(x) {
      const p = this.pts;
      for (let i = 1; i < p.length; i++) if (p[i][0] >= x) { const [ax, ay] = p[i - 1], [bx, by] = p[i]; return ay + (by - ay) * (x - ax) / Math.max(1, bx - ax); }
      return H;
    },
    step(dt) {
      const s = this.ship, G = 50;
      if (this.next > 0) { this.next -= dt; if (this.next <= 0) this.reset(); return; }
      if (!s.alive) { s.wait -= dt; if (s.wait <= 0) Object.assign(s, { alive: true, x: (this.x0 + W) / 2, y: H * .15, vx: 0, vy: 0, a: -Math.PI / 2, mode: "climb" }); }
      else {
        const target = this.bunkers.filter(b => b.alive).sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x))[0];
        const ground = Math.min(this.groundAt(s.x - 20), this.groundAt(s.x), this.groundAt(s.x + 20));
        const low = ground - 120, high = Math.max(H * .12, ground - 230);
        if (s.mode === "attack" && (s.y > low || s.vy > 70)) s.mode = "climb";
        if (s.mode === "climb" && s.y < high && s.vy < 20) s.mode = "attack";
        let want = -Math.PI / 2;
        if (s.mode === "climb") want += target ? Math.max(-.5, Math.min(.5, (target.x - s.x) * .004)) : 0;
        else if (target) want = Math.atan2(target.y - 6 - s.y, target.x - s.x);
        const err = angleTo(s.a, want);
        s.a += Math.max(-3.2 * dt, Math.min(3.2 * dt, err));
        s.thrust = s.mode === "climb" && Math.abs(err) < .5;
        if (s.thrust) { s.vx += Math.cos(s.a) * 150 * dt; s.vy += Math.sin(s.a) * 150 * dt; }
        s.vy += G * dt;
        s.vx *= 1 - .4 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.x < this.x0 + 20 || s.x > W - 20) { s.vx = -s.vx * .5; s.x = Math.max(this.x0 + 20, Math.min(W - 20, s.x)); }
        s.y = Math.max(20, s.y);
        s.fire -= dt;
        if (s.mode === "attack" && target && Math.abs(err) < .08 && s.fire <= 0) {
          s.fire = .32;
          this.shots.push({ x: s.x + Math.cos(s.a) * 12, y: s.y + Math.sin(s.a) * 12, vx: Math.cos(s.a) * 320 + s.vx, vy: Math.sin(s.a) * 320 + s.vy, age: 0 });
        }
        if (s.y > this.groundAt(s.x) - 6) this.crash();
      }
      // Bunkers turn their guns on the ship and fire now and then.
      for (const b of this.bunkers) {
        if (!b.alive) continue;
        if (s.alive) b.a = Math.atan2(s.y - b.y, s.x - b.x);
        b.fire -= dt;
        if (b.fire <= 0 && s.alive) { b.fire = rand(2.2, 4); this.bolts.push({ x: b.x, y: b.y - 8, vx: Math.cos(b.a) * 120, vy: Math.sin(b.a) * 120, age: 0 }); }
      }
      for (const z of this.shots) {
        z.x += z.vx * dt; z.y += z.vy * dt; z.vy += G * .3 * dt; z.age += dt;
        const hit = this.bunkers.find(b => b.alive && Math.hypot(b.x - z.x, b.y - 6 - z.y) < 14);
        if (hit) { hit.alive = false; z.dead = true; sparkBurst(this.sparks, hit.x, hit.y - 6, 20, 120, "255,179,71"); }
        else if (z.y > this.groundAt(z.x) || z.age > 1.6) z.dead = true;
      }
      this.shots = this.shots.filter(z => !z.dead);
      for (const z of this.bolts) {
        z.x += z.vx * dt; z.y += z.vy * dt; z.age += dt;
        if (s.alive && Math.hypot(z.x - s.x, z.y - s.y) < 9) { z.dead = true; this.crash(); }
      }
      this.bolts = this.bolts.filter(z => !z.dead && z.age < 3.5);
      if (!this.bunkers.some(b => b.alive) && this.next <= 0) this.next = 2.5;
    },
    crash() {
      const s = this.ship;
      s.alive = false; s.wait = 2;
      sparkBurst(this.sparks, s.x, s.y, 18, 120, "92,225,255");
    },
    draw(t, dt) {
      if (!still) this.step(dt);
      drawStars(t, .7);
      // The planet's surface.
      beam("#72ff8f", 10); cx.lineWidth = 1.6;
      cx.beginPath(); this.pts.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y)); cx.stroke();
      // Bunkers: a dome with its gun turned on the ship.
      for (const b of this.bunkers) {
        if (!b.alive) continue;
        beam("#ffb347", 10); cx.lineWidth = 1.6;
        cx.beginPath(); cx.arc(b.x, b.y, 11, Math.PI, 0); cx.closePath();
        cx.moveTo(b.x, b.y - 7); cx.lineTo(b.x + Math.cos(b.a) * 17, b.y - 7 + Math.sin(b.a) * 17); cx.stroke();
      }
      beam("#ff4fd8", 8); cx.fillStyle = "#ff4fd8";
      for (const z of this.bolts) { cx.beginPath(); cx.arc(z.x, z.y, 2.5, 0, Math.PI * 2); cx.fill(); }
      beam("#ffffff", 8); cx.fillStyle = "#ffffff";
      for (const z of this.shots) cx.fillRect(z.x - 1.5, z.y - 1.5, 3, 3);
      const s = this.ship;
      if (s.alive) {
        const c = Math.cos(s.a), n = Math.sin(s.a), P = (f, side) => [s.x + c * f - n * side, s.y + n * f + c * side];
        beam("#5ce1ff", 12); cx.lineWidth = 1.6;
        cx.beginPath(); cx.moveTo(...P(13, 0)); cx.lineTo(...P(-8, -8)); cx.lineTo(...P(-4, 0)); cx.lineTo(...P(-8, 8)); cx.closePath(); cx.stroke();
        if (s.thrust && Math.sin(t * 50) > -.2) {
          beam("#ff4fd8", 12);
          cx.beginPath(); cx.moveTo(...P(-5, -4)); cx.lineTo(...P(-13 - Math.random() * 6, 0)); cx.lineTo(...P(-5, 4)); cx.stroke();
        }
      }
      drawSparks(this.sparks, still ? 0 : dt);
    },
  };

  const scenes = [lander, asteroids, invaders, tempest, battlezone, castle, missiles, wars, pacman, qix, defender, tron, gravitar];
  // The scenes come round in a shuffled order: each plays once before any plays again, and the same one never
  // plays twice running, even across a reshuffle.
  let deck = [];
  function deal(after) {
    if (!deck.length) {
      deck = scenes.map((_, i) => i);
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      if (deck[deck.length - 1] === after) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
    }
    return deck.pop();
  }
  let showing = deal(-1), sceneClock = 0, fading = null; // fading: the scene on its way out, and how far

  function layout() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round(W * H / 9000) }, () => [rand(0, W), rand(0, H), rand(.3, 1)]);
    for (const sc of scenes) sc.layout();
    scenes[showing].start();
  }

  function frame(now) {
    const t = (now - t0) / 1000;
    // Seconds since the last frame, so things move at the same speed on 60 Hz and 144 Hz screens.
    // Capped so a long pause (hidden tab, scrolled away) doesn't make them jump.
    const dt = last ? Math.min((now - last) / 1000, .05) : 0;
    last = now;
    cx.clearRect(0, 0, W, H);
    cx.shadowBlur = 0;

    // Every SCENE_SECONDS another scene takes over, the old one fading out as the new one fades in.
    if (!still) {
      sceneClock += dt;
      if (sceneClock > SCENE_SECONDS && !fading) {
        fading = { scene: scenes[showing], k: 0 };
        showing = deal(showing);
        scenes[showing].start();
        sceneClock = 0;
      }
    }
    if (fading) {
      fading.k += dt / FADE;
      cx.globalAlpha = Math.max(0, 1 - fading.k);
      fading.scene.draw(t, dt);
      if (fading.k >= 1) fading = null;
    }
    cx.globalAlpha = fading ? Math.min(1, fading.k) : 1;
    scenes[showing].draw(t, dt);
    cx.globalAlpha = 1;

    // fade the left side so the hero text stays readable
    cx.shadowBlur = 0;
    const g = cx.createLinearGradient(0, 0, W * .75, 0);
    g.addColorStop(0, "rgba(5,8,13,.82)"); g.addColorStop(1, "rgba(5,8,13,0)");
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);

    // The name of what's playing, small in the corner, like a cabinet's marquee.
    if (!still) {
      cx.font = "18px VT323, monospace"; cx.textAlign = "right"; cx.textBaseline = "bottom";
      cx.shadowColor = "#ffb347"; cx.shadowBlur = 6;
      cx.fillStyle = `rgba(255,179,71,${fading ? .35 + .35 * Math.abs(1 - 2 * fading.k) : .7})`;
      cx.fillText(`ATTRACT MODE: ${scenes[showing].name}`, W - 14, H - 8);
      cx.shadowBlur = 0;
    }
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
