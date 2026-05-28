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
  stage: document.getElementById("stage"),
  wrap: document.getElementById("creatureWrap"),
  img: document.getElementById("creatureImg"),
  shadow: document.getElementById("shadow"),
  praiseText: document.getElementById("praiseText"),
  burst: document.getElementById("burst"),
  // gameplay HUD + puzzle
  puzzleArea: document.getElementById("puzzleArea"),
  maze: document.getElementById("maze"),
  fx: document.getElementById("fx"),
  bgFx: document.getElementById("bgFx"),
  bars: document.getElementById("bars"),
  tutorHand: document.getElementById("tutorHand"),
  hearts: document.getElementById("hearts"),
  levelNum: document.getElementById("levelNum"),
  backBtn: document.getElementById("backBtn"),
  retryBtn: document.getElementById("retryBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  hintBtn: document.getElementById("hintBtn"),
  solveBtn: document.getElementById("solveBtn"),
  wrongBtn: document.getElementById("wrongBtn"),
  // settings popup
  settingsPage: document.getElementById("settingsPage"),
  settingsBackdrop: document.getElementById("settingsBackdrop"),
  settingsClose: document.getElementById("settingsClose"),
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

// ---- Gameplay config + state ----------------------------------------
const LEVEL = 23;                 // cosmetic level label
const START_LIVES = 3;
let lives = START_LIVES;
let solved = false;               // true once the dragon is freed
let inputLocked = false;          // ignore taps during animations / popup
let wrongCooldown = false;        // brief lock after a wrong-move tap (anti-spam)

// Player options (toggled in the settings popup; persist in memory).
const settings = { music: true, sfx: true, haptics: true };

// Haptic feedback — respects the Haptics toggle + device support.
// light: taps/arrows/toggles · medium: solve/heart-loss/popup · success: rescue.
function haptic(kind) {
  if (!settings.haptics || !navigator.vibrate) return;
  const patterns = { light: 10, medium: 25, success: [15, 40, 15] };
  try { navigator.vibrate(patterns[kind] || 10); } catch (e) { /* ignore */ }
}

// ---- Audio system ----------------------------------------------------
// AppLovin rule: NOTHING plays before the first user gesture. We wait for the
// very first tap on the page; once unlocked, the background music starts (if
// the Music toggle is on) and sfx() actually plays the named clip.
const SFX_FILES = {
  button_click:    "assets/audio/click.mp3",
  soft_pop:        "assets/audio/pop.mp3",
  soft_bonk:       "assets/audio/bonk.mp3",
  magical_sparkle: "assets/audio/sparkle.mp3",
  solve_success:   "assets/audio/solve.mp3",
  heart_break:     "assets/audio/heart_break.mp3",
  popup_open:      "assets/audio/popup.mp3",
  toggle_switch:   "assets/audio/toggle.mp3",
  dragon_happy:    "assets/audio/win_stinger.mp3",
  fail_stinger:    "assets/audio/fail_stinger.mp3",   // FAIL endcard sting (sad harp)
  // dragon_sad — intentionally silent (the fail stinger covers the moment)
  piece_slide:     "assets/audio/pop.mp3",
};
const SFX_VOL = {
  button_click: 0.55, soft_pop: 0.5, soft_bonk: 0.6,
  magical_sparkle: 0.55, solve_success: 0.7, heart_break: 0.65,
  popup_open: 0.55, toggle_switch: 0.6, dragon_happy: 0.7,
  fail_stinger: 0.7, piece_slide: 0.45,
};
const sfxPool = {};
function makeAudio(src, vol) { const a = new Audio(src); a.preload = "auto"; a.volume = vol; return a; }
Object.keys(SFX_FILES).forEach((k) => { sfxPool[k] = makeAudio(SFX_FILES[k], SFX_VOL[k] || 0.6); });

const bgm = makeAudio("assets/audio/bgm.mp3", 0.22);
bgm.loop = true;

let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  if (settings.music) bgm.play().catch(() => {});
  document.removeEventListener("pointerdown", unlockAudio, true);
  document.removeEventListener("touchend", unlockAudio, true);
  document.removeEventListener("click", unlockAudio, true);
}
// Gate all audio behind the first user gesture (capture phase so it fires before button handlers).
document.addEventListener("pointerdown", unlockAudio, true);
document.addEventListener("touchend", unlockAudio, true);
document.addEventListener("click", unlockAudio, true);

function sfx(name) {
  if (!audioUnlocked || !settings.sfx) return;
  const base = sfxPool[name];
  if (!base) return;                       // silent for unmapped names (e.g. dragon_sad)
  try {
    // clone so overlapping plays don't cut each other off
    const a = base.cloneNode(true);
    a.volume = base.volume;
    a.play().catch(() => {});
  } catch (e) { /* ignore */ }
}

// Press bounce (scale 1 -> 0.92 -> 1) for any chip/button + a light tap haptic.
function pressFeedback(btn) {
  if (!btn) return;
  btn.classList.remove("tapped");
  void btn.offsetWidth;           // restart the animation
  btn.classList.add("tapped");
  btn.addEventListener("animationend", () => btn.classList.remove("tapped"), { once: true });
  haptic("light");
  sfx("button_click");
}

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

// ---- Creature loading ------------------------------------------------
function loadCreature(idx) {
  stopLoops();
  current = idx;
  const c = CREATURES[current];
  preloadCreature(c);
  showSad(c);
}

// ======================================================================
// GAMEPLAY (TEMPORARY) — the arrow puzzle was removed. The PM will drop in an
// arrows PNG overlay later; for now #maze is an empty overlay layer over the
// caged dragon. SOLVE frees the dragon (win); a red WRONG MOVE test button
// costs a heart (3 wrong -> fail). Win/lose are NOT bound to any arrow.
// ======================================================================

// #maze is kept as an empty overlay slot, ready for the future arrows PNG.
function buildPuzzle() {
  els.maze.innerHTML = "";
}

// Free the dragon: the cage reacts + slides open, glow grows, the dragon jumps
// for joy, then the WIN endcard appears. Triggered by the SOLVE button.
function freeDragon() {
  if (solved) return;
  solved = true;
  inputLocked = true;
  clearHint();
  els.solveBtn.disabled = true;
  els.bars.classList.add("open");
  spawnMagicBurst();
  els.puzzleArea.classList.add("freed");
  setTimeout(() => {
    stopLoops();
    showHappy(CREATURES[current]);
    haptic("success");
    sfx("dragon_happy");
  }, 360);
  setTimeout(() => goToPage("win"), 1700);
}

// Red WRONG MOVE test button — costs one heart per tap (3 -> FAIL endcard).
function wrongMove() {
  if (solved || inputLocked || wrongCooldown) return;
  wrongCooldown = true;
  setTimeout(() => (wrongCooldown = false), 650);  // let the break animation play
  pressFeedback(els.wrongBtn);
  loseHeart();                                      // break + screen shake (0 -> FAIL)
}

// ---- Hearts / lives --------------------------------------------------
// Heart art is the Paradise Paws glossy heart (red core + gold border).
const HEART_SVG = '<img src="assets/ui/paws_heart.png" alt="" draggable="false">';

function renderHearts() {
  els.hearts.innerHTML = "";
  for (let i = 0; i < START_LIVES; i++) {
    const h = document.createElement("div");
    h.className = "heart" + (i < lives ? "" : " empty");
    h.innerHTML = '<div class="heart-core">' + HEART_SVG + "</div>";
    // stagger the idle float so the hearts breathe in a gentle wave
    h.querySelector(".heart-core").style.animationDelay = (i * 0.4).toFixed(2) + "s";
    els.hearts.appendChild(h);
  }
}

// Lose one life with a quick, satisfying break: shake -> flash red -> crack/
// shatter -> shard burst -> shockwave -> micro screen shake. 0 lives -> FAIL.
function loseHeart() {
  if (inputLocked || solved || lives <= 0) return;
  lives--;
  sfx("heart_break");
  haptic("medium");

  const heartEls = els.hearts.querySelectorAll(".heart");
  const h = heartEls[lives]; // the heart that just emptied (rightmost full one)
  if (h) {
    const core = h.querySelector(".heart-core");
    h.classList.add("breaking", "flash");
    setTimeout(() => h.classList.remove("flash"), 140);
    // shatter the core + soft red glow pulse + shards + a shockwave ring
    setTimeout(() => {
      if (core) core.classList.add("shatter");
      const rg = document.createElement("div");
      rg.className = "redglow";
      h.appendChild(rg);
      rg.addEventListener("animationend", () => rg.remove(), { once: true });
      spawnHeartShards(h);
      const shock = document.createElement("div");
      shock.className = "shock";
      h.appendChild(shock);
      shock.addEventListener("animationend", () => shock.remove(), { once: true });
    }, 150);
    // settle into the empty state
    setTimeout(() => {
      h.classList.remove("breaking");
      h.classList.add("empty");
      if (core) {
        core.classList.remove("shatter");
        core.style.transform = "";
        core.style.opacity = "";
      }
    }, 520);
  }

  // micro screen shake
  els.stage.classList.remove("shake");
  void els.stage.offsetWidth;
  els.stage.classList.add("shake");
  els.stage.addEventListener("animationend", () => els.stage.classList.remove("shake"), { once: true });

  if (lives <= 0) {
    inputLocked = true;
    setTimeout(() => goToPage("fail"), 650);
  }
}

function spawnHeartShards(heart) {
  const N = 9;
  for (let i = 0; i < N; i++) {
    const s = document.createElement("div");
    s.className = "shard";
    const ang = (Math.PI * 2 * i) / N + Math.random() * 0.5;
    const dist = 16 + Math.random() * 16;
    s.style.setProperty("--sx", Math.cos(ang) * dist + "px");
    s.style.setProperty("--sy", Math.sin(ang) * dist + "px");
    s.style.setProperty("--sr", Math.random() * 240 - 120 + "deg");
    heart.appendChild(s);
    s.addEventListener("animationend", () => s.remove(), { once: true });
  }
}

// ---- Hint ------------------------------------------------------------
// The arrow gameplay is gone for now, so the hint has no piece to point at yet.
// Keep the button responsive; it'll point at the arrows PNG once that's added.
function showHint() {
  if (inputLocked || solved) return;
  pressFeedback(els.hintBtn);
  sfx("magical_sparkle");
}

function clearHint() {
  els.tutorHand.classList.remove("show");
}

// Place the tutorial hand over a target element (so its fingertip points at it).
// Coordinates are relative to the puzzle area (the hand's offset parent).
function positionHandOver(target) {
  const pa = els.puzzleArea.getBoundingClientRect();
  const ar = target.getBoundingClientRect();
  const cx = ar.left + ar.width / 2 - pa.left;
  const cy = ar.top + ar.height / 2 - pa.top;
  els.tutorHand.style.left = cx + "px";
  els.tutorHand.style.top = cy + "px";
}

// ---- Solve = free the dragon (win) -----------------------------------
function solve() {
  if (inputLocked || solved) return;
  haptic("medium");
  sfx("solve_success");
  freeDragon();
}

const MAGIC_COLORS = ["#9ad0ff", "#fff3a8", "#ffffff", "#bfa8ff", "#8fe6ff"];

// Emit a small magical sparkle burst at a point (px, relative to the puzzle area).
function emitMagic(cx, cy, count, spreadPct) {
  const pa = els.puzzleArea.getBoundingClientRect();
  const base = Math.min(pa.width, pa.height) * spreadPct;
  for (let i = 0; i < count; i++) {
    const m = document.createElement("div");
    m.className = "magic";
    m.style.left = cx + "px";
    m.style.top = cy + "px";
    const ang = Math.random() * Math.PI * 2;
    const dist = base * (0.45 + Math.random() * 0.8);
    m.style.setProperty("--mx", Math.cos(ang) * dist + "px");
    m.style.setProperty("--my", Math.sin(ang) * dist + "px");
    m.style.setProperty("--mz", 7 + Math.random() * 13 + "px");
    m.style.setProperty("--mc", MAGIC_COLORS[i % MAGIC_COLORS.length]);
    m.style.setProperty("--mdur", 0.6 + Math.random() * 0.5 + "s");
    els.fx.appendChild(m);
    m.addEventListener("animationend", () => m.remove(), { once: true });
  }
}

// Magical sparkle burst centred on the cage, used when the bars dissolve.
function spawnMagicBurst() {
  const rect = els.bars.getBoundingClientRect();
  const pa = els.puzzleArea.getBoundingClientRect();
  emitMagic(rect.left + rect.width / 2 - pa.left, rect.top + rect.height / 2 - pa.top, 22, 0.42);
  sfx("magical_sparkle");
}

// ---- Ambient FX (premium feel, spawned once) -------------------------
// Foreground twinkling sparkles in #fx + slow-drifting background dust in #bgFx.
function spawnAmbientSparkles() {
  if (els.fx.querySelectorAll(".spark").length) return; // only once
  for (let i = 0; i < 12; i++) {
    const s = document.createElement("div");
    s.className = "spark";
    const sz = 5 + Math.random() * 9;
    s.style.width = s.style.height = sz + "px";
    s.style.left = Math.random() * 96 + 2 + "%";
    s.style.top = Math.random() * 92 + 4 + "%";
    s.style.setProperty("--sdur", 2.4 + Math.random() * 2.6 + "s");
    s.style.setProperty("--sdelay", Math.random() * 3 + "s");
    els.fx.appendChild(s);
  }
  // subtle drifting magical dust behind the scene
  if (els.bgFx && !els.bgFx.querySelector(".dust")) {
    for (let i = 0; i < 7; i++) {
      const d = document.createElement("div");
      d.className = "dust";
      const sz = 14 + Math.random() * 24;
      d.style.width = d.style.height = sz + "px";
      d.style.left = Math.random() * 88 + 6 + "%";
      d.style.top = Math.random() * 78 + 12 + "%";
      d.style.setProperty("--ddur", 8 + Math.random() * 7 + "s");
      d.style.setProperty("--ddelay", Math.random() * 8 + "s");
      d.style.setProperty("--dx", Math.random() * 30 - 15 + "px");
      d.style.setProperty("--dy", -30 - Math.random() * 45 + "px");
      d.style.setProperty("--dop", (0.26 + Math.random() * 0.24).toFixed(2));
      els.bgFx.appendChild(d);
    }
  }
}

// ---- Retry / reset ---------------------------------------------------
function resetPuzzle() {
  // visual reset: bars back, dragon sad, lives restored
  solved = false;
  inputLocked = false;
  lives = START_LIVES;
  wrongCooldown = false;
  sfx("soft_pop");

  clearHint();
  els.solveBtn.disabled = false;
  els.bars.classList.remove("open");
  els.puzzleArea.classList.remove("freed");
  // clear any leftover magic particles
  els.fx.querySelectorAll(".magic").forEach((m) => m.remove());

  buildPuzzle();        // rebuild all pieces from scratch
  renderHearts();
  stopLoops();
  showSad(CREATURES[current]);
}

// ---- Settings popup --------------------------------------------------
function openSettings() {
  haptic("medium");
  sfx("popup_open");
  els.settingsPage.classList.add("show");
  els.settingsPage.setAttribute("aria-hidden", "false");
}
function closeSettings() {
  els.settingsPage.classList.remove("show");
  els.settingsPage.setAttribute("aria-hidden", "true");
}

// ---- Input wiring ----------------------------------------------------
els.solveBtn.addEventListener("click", () => { pressFeedback(els.solveBtn); solve(); });
if (els.wrongBtn) els.wrongBtn.addEventListener("click", wrongMove);
els.hintBtn.addEventListener("click", showHint);

els.retryBtn.addEventListener("click", () => {
  pressFeedback(els.retryBtn);
  els.retryBtn.classList.remove("spin");
  void els.retryBtn.offsetWidth;
  els.retryBtn.classList.add("spin");
  resetPuzzle();
});
// Back is a soft reset in this standalone playable (no real navigation).
els.backBtn.addEventListener("click", () => { pressFeedback(els.backBtn); resetPuzzle(); });
els.settingsBtn.addEventListener("click", () => { pressFeedback(els.settingsBtn); openSettings(); });

els.settingsClose.addEventListener("click", () => { pressFeedback(els.settingsClose); closeSettings(); });
els.settingsBackdrop.addEventListener("click", closeSettings);
els.settingsPage.querySelectorAll(".switch").forEach((sw) => {
  sw.addEventListener("click", () => {
    const key = sw.dataset.key;
    settings[key] = !settings[key];
    sw.classList.toggle("is-on", settings[key]);
    haptic("light");
    sfx("toggle_switch");
    // music toggle: pause/resume the bgm immediately
    if (key === "music") {
      if (settings.music && audioUnlocked) bgm.play().catch(() => {});
      else bgm.pause();
    }
  });
});

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
  else { resetPuzzle(); }                               // back to a fresh LOCKED puzzle
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
  // melancholic harp sting timed with the popup slide-in
  sfx("fail_stinger");
  spawnFailStars();
  startFailBlink();
  // toggling display restarts the staged entrance every time
  els.failPage.classList.remove("show");
  void els.failPage.offsetWidth; // force reflow
  els.failPage.classList.add("show");
  els.failPage.setAttribute("aria-hidden", "false");
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
if (els.levelNum) els.levelNum.textContent = LEVEL;
buildPuzzle();
renderHearts();
spawnAmbientSparkles();
loadCreature(0);   // dragon starts SAD, trapped behind the cage (LOCKED state)
