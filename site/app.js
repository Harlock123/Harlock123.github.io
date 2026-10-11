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

  // ---------- Filters ----------
  const chips = [...document.querySelectorAll(".chip")];
  const cabinets = document.getElementById("cabinets");
  for (const chip of chips) chip.addEventListener("click", () => {
    for (const c of chips) c.setAttribute("aria-pressed", String(c === chip));
    const f = chip.dataset.f;
    for (const card of cabinets.children) card.hidden = !(f === "all" || card.dataset.f === f);
  });

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
  let W = 0, H = 0, ridge = [], rocks = [], stars = [], visible = true;
  const t0 = performance.now();
  const rand = (a, b) => a + Math.random() * (b - a);

  function layout() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ridge = []; let y = H * .82;
    for (let x = 0; x <= W + 40; x += 40) { y = Math.min(H - 12, Math.max(H * .66, y + rand(-36, 36))); ridge.push([x, y]); }
    const padAt = Math.floor(ridge.length * .72); // a flat landing pad
    if (ridge[padAt + 1]) ridge[padAt + 1][1] = ridge[padAt][1];
    stars = Array.from({ length: Math.round(W * H / 9000) }, () => [rand(0, W), rand(0, H * .62), rand(.3, 1)]);
    rocks = Array.from({ length: W < 600 ? 4 : 7 }, () => {
      const n = 9, r = rand(14, 40);
      return { x: rand(0, W), y: rand(0, H * .55), vx: rand(-14, 14), vy: rand(-8, 8), a: rand(0, 6.3), va: rand(-.4, .4),
               pts: Array.from({ length: n }, (_, i) => [i / n * Math.PI * 2, r * rand(.7, 1.1)]) };
    });
  }
  const beam = (color, blur) => { cx.strokeStyle = color; cx.shadowColor = color; cx.shadowBlur = blur; };

  function frame(now) {
    const t = (now - t0) / 1000;
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
    beam("rgba(213,227,238,.85)", 6); cx.lineWidth = 1.5;
    for (const r of rocks) {
      if (!still) { r.x = (r.x + r.vx / 60 + W + 80) % (W + 80) - 40; r.y = (r.y + r.vy / 60 + H * .6) % (H * .6); r.a += r.va / 60; }
      cx.beginPath();
      r.pts.forEach(([ang, rad], i) => { const X = r.x + Math.cos(ang + r.a) * rad, Y = r.y + Math.sin(ang + r.a) * rad; i ? cx.lineTo(X, Y) : cx.moveTo(X, Y); });
      cx.closePath(); cx.stroke();
    }

    // mountains and the landing pad
    beam("#ffb347", 10); cx.lineWidth = 1.6;
    cx.beginPath(); ridge.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y)); cx.stroke();
    const pad = Math.floor(ridge.length * .72), [px, py] = ridge[pad] || [W * .7, H * .8];
    beam("#72ff8f", 12); cx.lineWidth = 3; cx.beginPath(); cx.moveTo(px, py); cx.lineTo(px + 40, py); cx.stroke();

    // the lander: descends toward the pad, then starts over
    const cycle = 14, p = still ? .55 : (t % cycle) / cycle;
    const lx = px + 20 + Math.sin(p * 6) * 30 * (1 - p), ly = H * .12 + (py - 22 - H * .12) * Math.min(1, p * 1.15);
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

    if (!still && visible) requestAnimationFrame(frame);
  }

  layout();
  requestAnimationFrame(frame);
  // Stop drawing while the hero is scrolled out of view.
  new IntersectionObserver(([e]) => {
    const was = visible; visible = e.isIntersecting;
    if (visible && !was && !still) requestAnimationFrame(frame);
  }).observe(cv);
  let rz;
  addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => { layout(); if (still || !visible) requestAnimationFrame(frame); }, 150);
  });
})();
