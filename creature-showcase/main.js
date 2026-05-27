/* ============================================================
   CREATURE SHOWCASE — logic
   ------------------------------------------------------------
   One creature at a time. Each creature has two looping states:
     - "sad"   : sad base sprite + JS breathing + occasional shiver + blink
     - "happy" : jump-for-joy — a JS-driven jump arc (lift + squash/stretch)
                 that swaps between a few full-body pose sprites
   The main button toggles between them. Arrows switch creatures
   (inert while the roster has only one entry).

   All idle motion (breathing, shiver, jump) is computed per-frame in JS from
   the TUNING object below, so the temporary debug panel (Ctrl+Shift+H) can
   tweak timings AND intensity live.

   HOW TO ADD A CREATURE: drop its folder under assets/creatures/<id>/
   and append an entry to the CREATURES array below.
   ============================================================ */

// ---- Creature roster -------------------------------------------------
const CREATURES = [
  {
    id: "dragon_blue",
    name: "Blue Dragon",
    base: "assets/creatures/dragon_blue/",
    sad: {
      base: "creature_sad.png",
      blink: "creature_sad_blink.png",
    },
    happy: {
      // jump pose frames; the arc/timing live in TUNING.happy
      poses: {
        crouch: "creature_happy_crouch.png",
        mid: "creature_happy.png",
        apex: "creature_happy_apex.png",
      },
    },
  },
];

const PRAISE_WORDS = ["Nice!", "Great!", "Awesome!", "Perfect!"];

// Placeholder store URL for the win-endcard CTA. The engineer swaps this
// (and onInstallClick) for the real store link / mraid.open call.
const STORE_URL = "https://example.com/app";

// ---- TUNING (animation timings + intensity, calibrated with the PM) --
const TUNING = {
  sad: {
    breathePeriodMs: 1250, // one breath in+out
    breatheAmp: 0.02,      // vertical scale delta (0.02 = 2%)
    blinkMinMs: 1300,      // shortest gap between blinks
    blinkMaxMs: 5700,      // longest gap between blinks
    blinkHoldMs: 140,      // how long the eyes stay closed
    sniffleIntervalMs: 7300, // time between anxious shivers
    sniffleDurationMs: 500,  // length of one shiver
    sniffleAmpPx: 1,       // shiver horizontal amplitude
    sniffleRotDeg: 0.4,    // shiver rotation amplitude
  },
  happy: {
    jumpPeriodMs: 600,     // one full jump cycle
    jumpFactor: 0.21,      // peak lift as a fraction of creature height
    squash: 0.08,          // squash/stretch intensity
  },
};

// ---- DOM handles -----------------------------------------------------
const els = {
  name: document.getElementById("creatureName"),
  wrap: document.getElementById("creatureWrap"),
  img: document.getElementById("creatureImg"),
  shadow: document.getElementById("shadow"),
  freeBtn: document.getElementById("freeBtn"),
  arrowL: document.getElementById("arrowLeft"),
  arrowR: document.getElementById("arrowRight"),
  praiseText: document.getElementById("praiseText"),
  burst: document.getElementById("burst"),
  // win endcard
  winPage: document.getElementById("winPage"),
  winCard: document.getElementById("winCard"),
  winParticles: document.getElementById("winParticles"),
  winGlowParticles: document.getElementById("winGlowParticles"),
  winBack: document.getElementById("winBack"),
  ctaBtn: document.getElementById("ctaBtn"),
  // fail endcard
  failPage: document.getElementById("failPage"),
  failStars: document.getElementById("failStars"),
  failDragon: document.getElementById("failDragon"),
  failBack: document.getElementById("failBack"),
  failCtaBtn: document.getElementById("failCtaBtn"),
};

// Win-endcard tunables (live-adjustable via the debug panel, Ctrl+Shift+H)
const WIN_TUNING = {
  starCount: 15,        // emitting stars (white / light-yellow)
  glowSparkCount: 14,   // soft round "brilho" sparkles
  blobCount: 10,        // big glow blobs behind the dragon
  partSizeMin: 16,      // px
  partSizeMax: 58,      // px
  emitDist: 150,        // px outward travel
  partSpeed: 50,        // px/s — how fast particles leave the centre
  drag: 0.5,            // 0 = constant speed, 1 = strong slow-down over time
  starWhiteRatio: 0.5,  // fraction of WHITE stars (rest are light-yellow)
  raysSize: 180,        // % of card width
  raysOpacity: 0.55,
  raysSpin: 45,         // s
  coreGlow: 1.5,
  goldGlow: 0.6,
  blueRim: 1.3,
};

// ---- Runtime state ---------------------------------------------------
let current = 0;        // index into CREATURES
let state = "sad";      // "sad" | "happy"
let blinkTimer = null;  // setTimeout handle for the sad blink loop
let sadRaf = null;      // requestAnimationFrame handle for sad idle motion
let jumpRaf = null;     // requestAnimationFrame handle for the happy jump
let praiseIdx = 0;      // rotates through PRAISE_WORDS
let praiseFadeTimer = null; // setTimeout handle for fading the praise word out
let page = "creature";  // "creature" | "win" | "fail"
let failBlinkTimer = null; // sad-dragon blink loop on the fail popup

// Cache preloaded <img> objects per path so swaps never flicker.
const imgCache = new Map();
function preload(path) {
  if (imgCache.has(path)) return imgCache.get(path);
  const im = new Image();
  im.src = path;
  imgCache.set(path, im);
  return im;
}
function preloadCreature(c) {
  preload(c.base + c.sad.base);
  if (c.sad.blink) preload(c.base + c.sad.blink);
  Object.values(c.happy.poses).forEach((p) => preload(c.base + p));
}

// ---- State engine ----------------------------------------------------
function stopLoops() {
  if (blinkTimer) { clearTimeout(blinkTimer); blinkTimer = null; }
  if (sadRaf) { cancelAnimationFrame(sadRaf); sadRaf = null; }
  if (jumpRaf) { cancelAnimationFrame(jumpRaf); jumpRaf = null; }
  els.img.style.transform = "";
  els.shadow.style.transform = "";
  els.shadow.style.opacity = "";
  // clear any in-flight praise word so letters don't linger across states
  if (praiseFadeTimer) { clearTimeout(praiseFadeTimer); praiseFadeTimer = null; }
  els.praiseText.classList.add("fadeout");
}

function showSad(c) {
  state = "sad";
  els.img.style.transformOrigin = "50% 100%";
  els.img.src = c.base + c.sad.base;
  els.freeBtn.textContent = "Free!";
  els.freeBtn.classList.remove("is-happy");
  startSadIdle();
  startBlinkLoop(c);
}

// Breathing + occasional shiver, composed into one transform on the image.
// Still most of the time, with a brief eased shiver every sniffleIntervalMs.
function startSadIdle() {
  const t0 = performance.now();
  const loop = (now) => {
    if (state !== "sad") return;
    const t = now - t0;
    const T = TUNING.sad;

    // breathing: smooth 0 -> 1 -> 0 over the period
    const bph = (t % T.breathePeriodMs) / T.breathePeriodMs;
    const breathe = 0.5 - 0.5 * Math.cos(bph * 2 * Math.PI);
    const sy = 1 + T.breatheAmp * breathe;
    const sx = 1 - T.breatheAmp * 0.4 * breathe;
    const ty = -breathe * T.breatheAmp * els.img.clientHeight * 0.2;

    // occasional shiver: a short damped oscillation
    let shx = 0, rot = 0;
    const tin = t % T.sniffleIntervalMs;
    if (T.sniffleDurationMs > 0 && tin < T.sniffleDurationMs) {
      const u = tin / T.sniffleDurationMs;      // 0..1
      const decay = 1 - u;
      const osc = Math.sin(u * Math.PI * 6);
      shx = osc * T.sniffleAmpPx * decay;
      rot = osc * T.sniffleRotDeg * decay;
    }

    els.img.style.transform =
      `translateX(${shx}px) translateY(${ty}px) scale(${sx}, ${sy}) rotate(${rot}deg)`;
    sadRaf = requestAnimationFrame(loop);
  };
  sadRaf = requestAnimationFrame(loop);
}

// Periodic slow blink: flash the closed-eye frame, then reopen. Randomised gap.
function startBlinkLoop(c) {
  if (!c.sad.blink) return;
  const scheduleNext = () => {
    const T = TUNING.sad;
    const delay = T.blinkMinMs + Math.random() * Math.max(0, T.blinkMaxMs - T.blinkMinMs);
    blinkTimer = setTimeout(() => {
      if (state !== "sad") return;
      els.img.src = c.base + c.sad.blink;             // eyes closed
      setTimeout(() => {
        if (state === "sad") els.img.src = c.base + c.sad.base; // reopen
        scheduleNext();
      }, TUNING.sad.blinkHoldMs);
    }, delay);
  };
  scheduleNext();
}

function showHappy(c) {
  state = "happy";
  els.img.style.transformOrigin = "50% 100%";
  els.freeBtn.textContent = "Again";
  els.freeBtn.classList.add("is-happy");
  startJump(c);
  playPraise();
}

// Jump-for-joy: a parabolic arc drives vertical lift + squash/stretch, and the
// displayed pose is chosen from the phase of the arc (crouch on the ground,
// mid while rising/falling, apex at the top). All vertical motion comes from
// here, so the loop is always seamless.
function startJump(c) {
  const poses = {
    crouch: preload(c.base + c.happy.poses.crouch),
    mid: preload(c.base + c.happy.poses.mid),
    apex: preload(c.base + c.happy.poses.apex),
  };
  let last = "";
  const start = performance.now();
  const frame = (now) => {
    if (state !== "happy") return;
    const H = TUNING.happy;
    const p = ((now - start) % H.jumpPeriodMs) / H.jumpPeriodMs;
    const h = Math.sin(p * Math.PI);              // 0 ground -> 1 apex -> 0
    const px = h * H.jumpFactor * els.img.clientHeight;

    const ground = 1 - h;
    const q = H.squash;
    const sx = 1 + q * ground - 0.4 * q * h;
    const sy = 1 - q * ground + 0.6 * q * h;
    els.img.style.transform = `translateY(${-px}px) scale(${sx}, ${sy})`;

    els.shadow.style.transform = `scaleX(${1 - 0.45 * h})`;
    els.shadow.style.opacity = `${0.3 - 0.18 * h}`;

    const pose = h < 0.18 ? "crouch" : h > 0.7 ? "apex" : "mid";
    if (pose !== last) { els.img.src = poses[pose].src; last = pose; }

    jumpRaf = requestAnimationFrame(frame);
  };
  jumpRaf = requestAnimationFrame(frame);
}

// ---- Praise pop ("Nice!" / "Great!" / ...) ---------------------------
// Letters drop in one by one (each starts big + transparent and lands at full
// size + opacity), then the whole word fades out together — the tile/merge
// game feel (e.g. magic-shield).
const PRAISE_STAGGER_MS = 65; // gap between consecutive letters landing
function playPraise() {
  const word = PRAISE_WORDS[praiseIdx % PRAISE_WORDS.length];
  praiseIdx++;

  // rebuild the word as one <span> per letter, each delayed so they land in turn
  els.praiseText.classList.remove("fadeout");
  els.praiseText.innerHTML = "";
  const chars = [...word];
  chars.forEach((ch, i) => {
    const span = document.createElement("span");
    span.className = "praise-letter";
    span.textContent = ch === " " ? " " : ch;
    span.style.animationDelay = i * PRAISE_STAGGER_MS + "ms";
    els.praiseText.appendChild(span);
  });

  // energy burst pops with the first letter
  els.burst.classList.remove("play");
  void els.burst.offsetWidth; // force reflow to restart the burst
  els.burst.classList.add("play");

  // after the last letter lands, hold briefly, then fade the whole word out
  const landMs = (chars.length - 1) * PRAISE_STAGGER_MS + 340;
  clearTimeout(praiseFadeTimer);
  praiseFadeTimer = setTimeout(() => els.praiseText.classList.add("fadeout"), landMs + 650);
}

// ---- Creature switching ----------------------------------------------
function loadCreature(idx) {
  stopLoops();
  current = idx;
  const c = CREATURES[current];
  preloadCreature(c);
  els.name.textContent = c.name;
  showSad(c);
  updateArrows();
}

function updateArrows() {
  // FAIL (left) and WIN (right) are always reachable from the creature view.
}

// ---- Input -----------------------------------------------------------
function toggleState() {
  const c = CREATURES[current];
  stopLoops();
  if (state === "sad") showHappy(c);
  else showSad(c);
}

els.freeBtn.addEventListener("click", toggleState);
els.arrowL.addEventListener("click", () => goToPage("fail"));
els.arrowR.addEventListener("click", () => goToPage("win"));
els.winBack.addEventListener("click", () => goToPage("creature"));
els.failBack.addEventListener("click", () => goToPage("creature"));
els.ctaBtn.addEventListener("click", onInstallClick);
els.failCtaBtn.addEventListener("click", onInstallClick);

// ======================================================================
// PAGES — creature (main) <-> win endcard <-> fail endcard
// ======================================================================
function goToPage(name) {
  page = name;
  hideWin();
  hideFail();
  if (name === "win") { stopLoops(); showWin(); }      // freeze gameplay, show win
  else if (name === "fail") { stopLoops(); showFail(); } // freeze gameplay, show fail
  else { showSad(CREATURES[current]); }                 // back to the creature view
}

function showWin() {
  applyWinTuning();
  spawnWinParticles();
  // toggling display restarts every CSS animation -> the entrance replays
  els.winPage.classList.remove("show");
  void els.winPage.offsetWidth; // force reflow
  els.winPage.classList.add("show");
  els.winPage.setAttribute("aria-hidden", "false");
}

function hideWin() {
  els.winPage.classList.remove("show");
  els.winPage.setAttribute("aria-hidden", "true");
}

// Push the tunable knobs into CSS custom properties on the card.
function applyWinTuning() {
  const c = els.winCard, T = WIN_TUNING;
  c.style.setProperty("--rays-op", T.raysOpacity);
  c.style.setProperty("--rays-spin", T.raysSpin + "s");
  c.style.setProperty("--rays-size", T.raysSize + "%");
  c.style.setProperty("--core-glow", T.coreGlow);
  c.style.setProperty("--gold-glow", T.goldGlow);
  c.style.setProperty("--blue-rim", T.blueRim);
}

// star colours: white + light-yellow (mixed by starWhiteRatio)
const STAR_WHITE = { bg: "#ffffff", glow: "rgba(255,255,255,0.95)" };
const STAR_YELLOW = { bg: "#fff3a8", glow: "rgba(255,238,150,0.95)" };

const BLOB_COLORS = [
  "rgba(255,236,150,0.95)", "rgba(255,210,90,0.9)", "rgba(120,180,255,0.85)",
  "rgba(255,245,205,0.95)", "rgba(150,200,255,0.8)", "rgba(255,224,120,0.9)",
];

// Particles live BEHIND the dragon: emitting stars + soft "brilho" sparkles
// that SHRINK as they age, plus big slow glow blobs.
function spawnWinParticles() {
  const T = WIN_TUNING;

  // emitting stars + glow sparkles
  els.winParticles.innerHTML = "";
  const total = T.starCount + T.glowSparkCount;
  // drag -> deceleration easing (0 = constant/linear, 1 = strong slow-down)
  const d = T.drag;
  const ease = `cubic-bezier(0, ${(0.85 * d).toFixed(3)}, ${(1 - 0.75 * d).toFixed(3)}, 1)`;
  for (let i = 0; i < total; i++) {
    const isGlow = i >= T.starCount;
    const p = document.createElement("div");
    p.className = isGlow ? "win-particle p-glow" : "win-particle p-star";
    const angle = Math.random() * Math.PI * 2;
    const dist = T.emitDist * (0.55 + Math.random() * 0.75);
    p.style.setProperty("--dx", Math.cos(angle) * dist + "px");
    p.style.setProperty("--dy", Math.sin(angle) * dist + "px");
    p.style.setProperty("--rot", Math.random() * 120 - 60 + "deg");
    const size = T.partSizeMin + Math.random() * (T.partSizeMax - T.partSizeMin);
    p.style.width = p.style.height = (isGlow ? size * 1.15 : size) + "px";
    // stars: white / light-yellow mix
    if (!isGlow) {
      const col = Math.random() < T.starWhiteRatio ? STAR_WHITE : STAR_YELLOW;
      p.style.background = col.bg;
      p.style.filter = "drop-shadow(0 0 6px " + col.glow + ")";
    }
    // speed + drag: lifetime = distance / speed, with a deceleration curve
    const dur = (dist / Math.max(5, T.partSpeed)) * (0.85 + Math.random() * 0.3);
    p.style.animationDuration = dur.toFixed(2) + "s";
    p.style.animationTimingFunction = ease;
    p.style.animationDelay = (Math.random() * dur).toFixed(2) + "s";
    els.winParticles.appendChild(p);
  }

  // big soft glow blobs behind the dragon
  els.winGlowParticles.innerHTML = "";
  for (let i = 0; i < T.blobCount; i++) {
    const b = document.createElement("div");
    b.className = "win-glow-blob";
    const size = 75 + Math.random() * 95;
    b.style.width = b.style.height = size + "px";
    b.style.left = 50 + (Math.random() * 56 - 28) + "%";
    b.style.top = 30 + (Math.random() * 38 - 8) + "%";
    b.style.background = "radial-gradient(circle, " + BLOB_COLORS[i % BLOB_COLORS.length] + " 0%, transparent 70%)";
    b.style.setProperty("--bx", Math.random() * 34 - 17 + "px");
    b.style.setProperty("--by", Math.random() * 34 - 17 + "px");
    b.style.animationDuration = 3 + Math.random() * 2.5 + "s";
    b.style.animationDelay = Math.random() * 2 + "s";
    els.winGlowParticles.appendChild(b);
  }
}

// ======================================================================
// FAIL ENDCARD — gentle defeat popup (sad dragon waiting for help).
// ======================================================================
function showFail() {
  // SFX: a soft, non-aggressive "bonk" the moment the player fails,
  //      then a gentle "whoosh" as the popup slides in.
  spawnFailStars();
  startFailBlink();
  // toggling display restarts the staged entrance every time
  els.failPage.classList.remove("show");
  void els.failPage.offsetWidth; // force reflow
  els.failPage.classList.add("show");
  els.failPage.setAttribute("aria-hidden", "false");
  // SFX: a light descending "bloop" timed with the ALMOST! headline (~0.3s in).
  // SFX: the broken heart's wobble loops in CSS — play a subtle "tink" with it,
  //      but throttle it (e.g. every other wobble) so it never gets annoying.
}

function hideFail() {
  if (failBlinkTimer) { clearTimeout(failBlinkTimer); failBlinkTimer = null; }
  els.failPage.classList.remove("show");
  els.failPage.setAttribute("aria-hidden", "true");
}

// sad dragon blink: occasionally flash the closed-eye frame (reuses the
// creature's sad-blink sprite). Breathing/slump is CSS (failSadIdle).
function startFailBlink() {
  const base = "assets/dragon/dragon_sad.png";
  const blink = "assets/dragon/dragon_sad_blink.png";
  els.failDragon.src = base;
  const next = () => {
    failBlinkTimer = setTimeout(() => {
      if (page !== "fail") return;
      els.failDragon.src = blink;               // eyes closed
      setTimeout(() => {
        if (page === "fail") els.failDragon.src = base; // reopen
        next();
      }, 150);
    }, 2500 + Math.random() * 2500);            // 2.5–5s between blinks
  };
  next();
}

// soft magical night-sky stars that twinkle in, rise a little, then fade.
// Kept few (≤14) and gentle so it reads "hopeful sky", not "victory confetti".
function spawnFailStars() {
  els.failStars.innerHTML = "";
  const colors = ["#ffffff", "#bfe0ff", "#d8c8ff"]; // white, light-blue, lilac
  for (let i = 0; i < 12; i++) {
    const s = document.createElement("div");
    s.className = "fail-star" + (i % 3 === 0 ? " spark" : "");
    const size = 4 + Math.random() * 10;
    s.style.width = s.style.height = size + "px";
    s.style.left = 4 + Math.random() * 92 + "%";
    s.style.top = 6 + Math.random() * 78 + "%";
    const c = colors[i % colors.length];
    s.style.background = c;
    s.style.filter = "drop-shadow(0 0 5px " + c + ")";
    s.style.animationDuration = 1.5 + Math.random() + "s";  // 1.5–2.5s
    s.style.animationDelay = Math.random() * 2.5 + "s";
    els.failStars.appendChild(s);
  }
}

// CTA handler — PLACEHOLDER. The engineer wires this to the real store /
// mraid.open(). Left as a no-dependency callback so it works standalone.
// SFX: positive/hopeful "retry" click, then a short ascending sparkle on install.
function onInstallClick() {
  try {
    if (window.mraid && typeof window.mraid.open === "function") {
      window.mraid.open(STORE_URL);
      return;
    }
  } catch (e) { /* ignore */ }
  console.log("onInstallClick() — wire this to the app store (mraid.open / window.open).");
  showToast("Opening store… (placeholder)");
}

function showToast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("show"), 1400);
}

// ======================================================================
// WIN-CARD DEBUG PANEL (TEMPORARY) — toggle with Ctrl+Shift+H.
// Tune the endcard's particles / glow / rays / border live, then "Copy
// values". Remove this block (+ #debugPanel CSS) before shipping.
// ======================================================================
(function setupWinDebugPanel() {
  // [key, label, min, max, step, respawnParticles]
  const ROWS = [
    [null, "— PARTICLES —"],
    ["starCount", "Star count", 0, 24, 1, true],
    ["glowSparkCount", "Glow sparkles", 0, 20, 1, true],
    ["blobCount", "Glow blobs", 0, 10, 1, true],
    ["partSizeMin", "Particle min size", 6, 40, 1, true],
    ["partSizeMax", "Particle max size", 10, 80, 1, true],
    ["emitDist", "Emit distance", 40, 320, 5, true],
    ["partSpeed", "Particle speed", 15, 250, 5, true],
    ["drag", "Drag (slow-down)", 0, 1, 0.05, true],
    ["starWhiteRatio", "Star white mix", 0, 1, 0.05, true],
    [null, "— GLOW / RAYS / BORDER —"],
    ["coreGlow", "Core glow", 0, 1.5, 0.05, false],
    ["raysSize", "Rays size (%)", 80, 260, 5, false],
    ["raysOpacity", "Rays opacity", 0, 1, 0.05, false],
    ["raysSpin", "Rays spin (s)", 6, 60, 1, false],
    ["goldGlow", "Gold glow", 0, 1.2, 0.05, false],
    ["blueRim", "Blue rim", 0, 1.5, 0.05, false],
  ];

  const panel = document.createElement("div");
  panel.id = "debugPanel";
  panel.innerHTML = '<div class="dbg-title">Win card · Ctrl+Shift+H</div>';
  const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

  ROWS.forEach(([key, label, min, max, step, respawn]) => {
    if (key === null) {
      const h = document.createElement("h4");
      h.textContent = label;
      panel.appendChild(h);
      return;
    }
    const row = document.createElement("div");
    row.className = "dbg-row";
    const lab = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = label;
    const val = document.createElement("span");
    val.className = "val";
    val.textContent = fmt(WIN_TUNING[key]);
    lab.appendChild(name);
    lab.appendChild(val);
    const s = document.createElement("input");
    s.type = "range";
    s.min = min; s.max = max; s.step = step;
    s.value = WIN_TUNING[key];
    s.addEventListener("input", () => {
      WIN_TUNING[key] = parseFloat(s.value);
      val.textContent = fmt(WIN_TUNING[key]);
      applyWinTuning();
      if (respawn) spawnWinParticles();
    });
    row.appendChild(lab);
    row.appendChild(s);
    panel.appendChild(row);
  });

  const actions = document.createElement("div");
  actions.className = "dbg-actions";
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy values";
  copyBtn.addEventListener("click", () => {
    const j = JSON.stringify(WIN_TUNING, null, 2);
    console.log("[WIN_TUNING]\n" + j);
    if (navigator.clipboard) navigator.clipboard.writeText(j).catch(() => {});
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy values"), 1200);
  });
  actions.appendChild(copyBtn);
  panel.appendChild(actions);

  const hint = document.createElement("div");
  hint.className = "dbg-hint";
  hint.textContent = "Win-card tuning — open the endcard (right arrow) to see it live.";
  panel.appendChild(hint);

  document.body.appendChild(panel);

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "H" || e.key === "h")) {
      e.preventDefault();
      panel.classList.toggle("open");
      document.body.classList.toggle("debug-open", panel.classList.contains("open"));
    }
  });
  window.WIN_TUNING = WIN_TUNING;
})();

// ---- Boot ------------------------------------------------------------
loadCreature(0);
