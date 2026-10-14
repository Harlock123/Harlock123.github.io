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
  // Three little vector games take turns behind the hero, cross-fading every SCENE_SECONDS: the lander
  // coming down to its pad, a ship clearing an asteroid field, and an invader formation against a cannon.
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

  const scenes = [lander, asteroids, invaders, tempest, battlezone];
  let showing = 0, sceneClock = 0, fading = null; // fading: the scene on its way out, and how far

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

    // Every SCENE_SECONDS the next scene takes over, the old one fading out as the new one fades in.
    if (!still) {
      sceneClock += dt;
      if (sceneClock > SCENE_SECONDS && !fading) {
        fading = { scene: scenes[showing], k: 0 };
        showing = (showing + 1) % scenes.length;
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
