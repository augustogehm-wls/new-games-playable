/* ==================================================================== *
 *  VINE ENGINE — directional vine puzzle (embeddable module)
 *  Pure Canvas 2D. No dependencies. Forked from vine-snake's src/main.js
 *  ("Directional vine puzzle prototype") and refactored into an EMBEDDABLE
 *  module for the Rescue Friends merge:
 *    - renders into a CALLER-PROVIDED canvas sized to a host box (the puzzle
 *      area), with a user board transform (scale + offset) on top of the
 *      contain-fit, so the board can be scaled down to not cover the UI
 *    - TRANSPARENT background (the creature shows behind the vines); the grid
 *      is drawn ONLY in the map-edit facet
 *    - fires onAllCleared (WIN) and onWrongTap (a blocked-vine tap = the "miss")
 *    - loadScene()/getScene() for the unified export + edited/default restart
 *    - three modes: 'play' (vines tappable), 'edit-map' (paint/erase + grid),
 *      'edit-art' (inert canvas — only sliders/creature change)
 *
 *  The hard-won CORE is preserved verbatim from the prototype: the Vine class
 *  (arc-length slither, head-forward collision scan, bounce + whole-vine red
 *  flash), the procedural diagonal-clip corners, the data-driven atlas loader
 *  (frame size derived from each PNG), the vertical-body CCW bake, and the
 *  PM's hand-built FIXED_MAP. See vine-snake/HANDOFF.md for the full rationale.
 * ==================================================================== */
window.VineEngine = (function () {
  "use strict";

  /* ============================== *
   *  CONFIGURABLE CONSTANTS
   * ============================== */
  const CELL_SIZE      = 64;   // logical px per cell (square)
  const BOARD_COLS     = 16;   // fixed grid: 16 wide ...
  const BOARD_ROWS     = 18;   // ... x 18 tall -> taller than wide
  let   VINE_SPEED     = 40;   // cells/sec (LIVE via the Speed slider)
  const VARIANT_COUNT  = 4;    // body visual variants (rows in the body atlas)

  const THICKNESS_FRAC = 0.95;
  const VINE_THICKNESS = Math.round(CELL_SIZE * THICKNESS_FRAC);   // 61
  const CAP_ARROW_SIZE = Math.round(VINE_THICKNESS * 1.6);          // 98

  const CORNER_BLEED = 1.5;    // px — overlap across the corner seam (kills AA hairlines)
  const VERTICAL_ROTATE_CW = false;   // false = CCW (correct for current art)
  const DEBUG_CORNERS = false;

  // collision / bounce / flash tuning
  const RETURN_SPEED_MULT = 1.7;
  const FLASH_DUR = 0.35;
  const FLASH_PEAK = 0.5;
  const BOUNCE_DUR = 0.30;
  const BOUNCE_PX  = 16;

  // Placeholder palette (only used when a real PNG is missing).
  const COLORS = {
    gridLine:  "rgba(60,40,90,0.35)",
    variants:  ["#4caf50", "#66bb6a", "#43a047", "#2e7d32"],
    capRim:    "#5d4037",
    guideLine: "rgba(255,255,255,0.18)",
  };

  /* ============================== *
   *  DIRECTION HELPERS
   * ============================== */
  const LEFT = 0, RIGHT = 1, UP = 2, DOWN = 3;
  const DELTA = {
    [LEFT]:  { x: -1, y:  0 },
    [RIGHT]: { x:  1, y:  0 },
    [UP]:    { x:  0, y: -1 },
    [DOWN]:  { x:  0, y:  1 },
  };
  function dirFromDelta(dx, dy) {
    if (dx < 0) return LEFT;
    if (dx > 0) return RIGHT;
    if (dy < 0) return UP;
    return DOWN;
  }
  function opposite(dir) {
    return dir === LEFT ? RIGHT : dir === RIGHT ? LEFT
         : dir === UP   ? DOWN  : UP;
  }
  const AXIS_H = 0, AXIS_V = 1;
  function axisOf(dir) { return (dir === LEFT || dir === RIGHT) ? AXIS_H : AXIS_V; }
  function dirBlock(dir) {
    return {
      col: (dir === RIGHT || dir === DOWN) ? 1 : 0,
      row: (dir === UP    || dir === DOWN) ? 1 : 0,
    };
  }

  /* ==================================================================== *
   *  ATLAS DEFINITIONS (data-driven layout)
   * ==================================================================== */
  const ATLAS_DEFS = {
    body:  { files: ["vines_body.png", "vines_body_1x4.png", "vine_body.png"], cols: 1, rows: 4, make: makeBodyPlaceholder },
    arrow: { files: ["vines_arrows.png", "vine_arrow.png"], cols: 2, rows: 2, make: makeArrowPlaceholder },
    cap:   { files: ["vines_caps.png",   "vine_cap.png"],   cols: 2, rows: 2, make: makeCapPlaceholder },
  };
  const ASSETS = { body: null, bodyV: null, arrow: null, cap: null };

  /* ============================== *
   *  ATLAS LOADING
   * ============================== */
  function tryLoadImage(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload  = () => resolve(im.naturalWidth > 0 ? im : null);
      im.onerror = () => resolve(null);
      im.src = src;
    });
  }
  const ASSET_CB = 2;   // bump when an atlas PNG is replaced (image cache-bust)
  async function loadAtlas(def) {
    let img = null;
    for (const f of def.files) {
      img = await tryLoadImage("assets/vines/" + f + "?cb=" + ASSET_CB);
      if (img) break;
    }
    if (!img) {
      if (!def.make) return null;
      img = def.make();
    }
    return { img, cols: def.cols, rows: def.rows, fw: img.width / def.cols, fh: img.height / def.rows };
  }
  async function loadAllAssets() {
    ASSETS.body  = await loadAtlas(ATLAS_DEFS.body);
    ASSETS.arrow = await loadAtlas(ATLAS_DEFS.arrow);
    ASSETS.cap   = await loadAtlas(ATLAS_DEFS.cap);
    ASSETS.bodyV = buildVerticalBody(ASSETS.body);
  }
  function buildVerticalBody(body) {
    const out = { variants: [], fw: body.fh, fh: body.fw };
    for (let r = 0; r < body.rows; r++) {
      const vc = makeCanvas(body.fh, body.fw);
      const vctx = vc.getContext("2d");
      vctx.save();
      if (VERTICAL_ROTATE_CW) {
        vctx.translate(vc.width, 0);
        vctx.rotate(Math.PI / 2);
      } else {
        vctx.translate(0, vc.height);
        vctx.rotate(-Math.PI / 2);
      }
      vctx.drawImage(body.img, 0, r * body.fh, body.fw, body.fh, 0, 0, body.fw, body.fh);
      vctx.restore();
      out.variants.push(vc);
    }
    return out;
  }

  /* ============================== *
   *  COORD HELPERS
   * ============================== */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function cellCenterPx(cx, cy) { return { x: (cx + 0.5) * CELL_SIZE, y: (cy + 0.5) * CELL_SIZE }; }
  function drawHSlice(ctx, img, fy, fh, srcX, srcW, destX, destTop, destW, destH, texLen) {
    let sx = ((srcX % texLen) + texLen) % texLen;
    let dx = destX, remaining = srcW;
    while (remaining > 1e-3) {
      const take = Math.min(texLen - sx, remaining);
      const dw = destW * (take / srcW);
      ctx.drawImage(img, sx, fy, take, fh, dx, destTop, dw, destH);
      dx += dw; remaining -= take; sx = 0;
    }
  }
  function drawVSlice(ctx, img, fx, fw, srcY, srcH, destLeft, destY, destW, destH, texLen) {
    let sy = ((srcY % texLen) + texLen) % texLen;
    let dy = destY, remaining = srcH;
    while (remaining > 1e-3) {
      const take = Math.min(texLen - sy, remaining);
      const dh = destH * (take / srcH);
      ctx.drawImage(img, fx, sy, fw, take, destLeft, dy, destW, dh);
      dy += dh; remaining -= take; sy = 0;
    }
  }

  /* ============================== *
   *  MODULE STATE (single instance)
   * ============================== */
  let canvas = null, ctx = null, host = null;
  let vines = [];
  let mode = "play";          // "play" | "edit-map" | "edit-art"
  let draft = null;
  let ready = false;
  let active = true;          // false freezes gameplay updates (during popups)
  let started = false, won = false, hadVines = false;
  let pendingScene = null;    // a loadScene() requested before assets finished
  let rafId = null, lastT = 0;
  const view  = { scale: 1, offsetX: 0, offsetY: 0, dpr: 1, cssW: 0, cssH: 0, landscape: false };
  // PM-tuned PORTRAIT default transform (scale + offset as a fraction of the host).
  // In landscape we override the offset (center) and fit by height — see resize().
  const board = { scale: 0.85, ox: 0, oy: -0.05 };
  const flashLayer = document.createElement("canvas");
  let cbAllCleared = null, cbWrongTap = null, cbProgress = null, cbCorrectTap = null;

  function notifyWrong() { if (mode === "play" && cbWrongTap) cbWrongTap(); }

  /* ============================== *
   *  THE VINE  (core preserved)
   * ============================== */
  class Vine {
    constructor(path, variant) {
      this.path     = path.map((p) => ({ x: p.x, y: p.y }));
      this.variant  = variant % VARIANT_COUNT;
      this.isRemoved = false;
      this.speed    = VINE_SPEED;
      this.s        = 0;
      this.phase    = "idle";   // 'idle' | 'forward' | 'returning'
      this.flash    = 0;
      this.bounceT  = 0;
      this.bounceDir = { x: 0, y: 0 };
      this.L = this.path.length - 1;
      this.cellKeys = new Set(this.path.map((p) => p.x + "," + p.y));
      const headDir = this.getHeadDirection();
      const d = DELTA[headDir];
      const head = this.path[this.L];
      this.ext = this.path.slice();
      const rayLen = this.L + 40;
      for (let i = 1; i <= rayLen; i++) this.ext.push({ x: head.x + d.x * i, y: head.y + d.y * i });
      this.maxArc = this.ext.length - 1;
    }
    get isMoving() { return this.phase !== "idle"; }
    get isBlocker() { return !this.isRemoved && this.phase !== "forward"; }
    getHeadDirection() {
      const a = this.path[this.L - 1], b = this.path[this.L];
      return dirFromDelta(b.x - a.x, b.y - a.y);
    }
    getTailDirection() {
      const a = this.path[0], b = this.path[1];
      return dirFromDelta(b.x - a.x, b.y - a.y);
    }
    directionAtArc(arc) {
      let i = Math.floor(clamp(arc, 0, this.maxArc - 1e-6));
      if (i > this.ext.length - 2) i = this.ext.length - 2;
      const A = this.ext[i], B = this.ext[i + 1];
      return dirFromDelta(B.x - A.x, B.y - A.y);
    }
    startMove() {
      if (this.phase !== "idle" || this.isRemoved) return;
      this.phase = "forward";
    }
    containsPoint(px, py) {
      if (this.isRemoved || this.phase !== "idle") return false;
      const cx = Math.floor(px / CELL_SIZE), cy = Math.floor(py / CELL_SIZE);
      return this.cellKeys.has(cx + "," + cy);
    }
    firstBlock() {
      for (let d = 1; this.L + d < this.ext.length; d++) {
        const cell = this.ext[this.L + d];
        if (cell.x < 0 || cell.x >= BOARD_COLS || cell.y < 0 || cell.y >= BOARD_ROWS) return null;
        const key = cell.x + "," + cell.y;
        for (const v of vines) {
          if (v === this || !v.isBlocker) continue;
          if (v.cellKeys.has(key)) return { blocker: v, collideS: d - 0.5, dir: this.getHeadDirection() };
        }
      }
      return null;
    }
    onCollide(blocker, dir) {
      this.phase = "returning";
      this.flash = 1;
      blocker.flash = 1;
      blocker.bounceDir = DELTA[dir];
      blocker.bounceT = 1;
      notifyWrong();              // a blocked tap is the "miss" => lose a heart
    }
    update(dt) {
      if (this.flash   > 0) this.flash   = Math.max(0, this.flash   - dt / FLASH_DUR);
      if (this.bounceT > 0) this.bounceT = Math.max(0, this.bounceT - dt / BOUNCE_DUR);
      if (this.phase === "forward") {
        const block = this.firstBlock();
        if (block) {
          const ns = this.s + VINE_SPEED * dt;
          if (ns >= block.collideS) { this.s = block.collideS; this.onCollide(block.blocker, block.dir); }
          else this.s = ns;
        } else {
          this.s += VINE_SPEED * dt;
          if (this.s >= this.L && this.tailOffScreen()) this.isRemoved = true;
          if (this.s >= this.maxArc) this.isRemoved = true;
        }
      } else if (this.phase === "returning") {
        this.s -= VINE_SPEED * dt * RETURN_SPEED_MULT;
        if (this.s <= 0) { this.s = 0; this.phase = "idle"; }
      }
    }
    bounceOffset() {
      if (this.bounceT <= 0) return null;
      const mag = BOUNCE_PX * Math.sin((1 - this.bounceT) * Math.PI);
      return { x: this.bounceDir.x * mag, y: this.bounceDir.y * mag };
    }
    tailOffScreen() {
      const p = this.pointAtArcPx(this.s);
      const sx = view.offsetX + p.x * view.scale;
      const sy = view.offsetY + p.y * view.scale;
      const m = CELL_SIZE * view.scale;
      return sx < -m || sx > view.cssW + m || sy < -m || sy > view.cssH + m;
    }
    pointAtArcPx(arc) {
      arc = clamp(arc, 0, this.maxArc);
      let i = Math.floor(arc);
      let t = arc - i;
      if (i >= this.ext.length - 1) { i = this.ext.length - 2; t = 1; }
      const p0 = this.ext[i], p1 = this.ext[i + 1];
      return cellCenterPx(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t);
    }
    get tailArc() { return this.s; }
    get headArc() { return this.L + this.s; }
    isCornerVertex(v) {
      if (v < 1 || v > this.L - 1) return false;
      const d1 = dirFromDelta(this.ext[v].x - this.ext[v - 1].x, this.ext[v].y - this.ext[v - 1].y);
      const d2 = dirFromDelta(this.ext[v + 1].x - this.ext[v].x, this.ext[v + 1].y - this.ext[v].y);
      return d1 !== d2;
    }
    drawBody(ctx) {
      const tailArc = this.tailArc;
      const headArc = Math.min(this.headArc, this.maxArc);
      const maxSeg  = this.ext.length - 2;
      const startSeg = Math.max(0, Math.floor(tailArc));
      const endSeg   = Math.min(maxSeg, Math.ceil(headArc) - 1);
      for (let i = startSeg; i <= endSeg; i++) {
        let lo = i, hi = i + 1;
        if (this.isCornerVertex(i))     lo = i + 0.5;
        if (this.isCornerVertex(i + 1)) hi = i + 0.5;
        lo = Math.max(lo, tailArc);
        hi = Math.min(hi, headArc);
        if (hi <= lo + 1e-6) continue;
        const A = this.ext[i], B = this.ext[i + 1];
        const dir = dirFromDelta(B.x - A.x, B.y - A.y);
        drawStraightBody(ctx, A, dir, this.variant, lo - i, hi - i, i);
      }
      for (let k = 1; k <= this.L - 1; k++) {
        if (!this.isCornerVertex(k)) continue;
        if (k + 0.5 <= tailArc || k - 0.5 >= headArc) continue;
        this.drawCorner(ctx, k);
      }
    }
    drawCorner(ctx, k) {
      const C = cellCenterPx(this.ext[k].x, this.ext[k].y);
      const H = CELL_SIZE / 2;
      const Lx = C.x - H, Rx = C.x + H, Ty = C.y - H, By = C.y + H;
      const din  = dirFromDelta(this.ext[k].x - this.ext[k - 1].x, this.ext[k].y - this.ext[k - 1].y);
      const dout = dirFromDelta(this.ext[k + 1].x - this.ext[k].x, this.ext[k + 1].y - this.ext[k].y);
      const clips = cornerClip(opposite(din), dout, Lx, Ty, Rx, By);
      const tailArc = this.tailArc;
      const drawIncoming = tailArc <= k + 1e-6;
      const drawOutgoing = tailArc <= k + 0.5 + 1e-6;
      if (drawIncoming && clips.inTri) {
        ctx.save(); clipTri(ctx, inflateTri(clips.inTri, CORNER_BLEED));
        drawStraightBody(ctx, this.ext[k - 1], din, this.variant, 0.5, 1.5, k - 1);
        ctx.restore();
      }
      if (drawOutgoing && clips.outTri) {
        ctx.save(); clipTri(ctx, inflateTri(clips.outTri, CORNER_BLEED));
        drawStraightBody(ctx, this.ext[k], dout, this.variant, -0.5, 0.5, k);
        ctx.restore();
      }
      if (DEBUG_CORNERS) debugCorner(ctx, Lx, Ty, Rx, By, clips, din, dout);
    }
    drawCap(ctx) {
      const c = this.pointAtArcPx(this.tailArc);
      const localDir = this.directionAtArc(this.tailArc);
      drawDirFrame(ctx, ASSETS.cap, opposite(localDir), c.x, c.y);
    }
    drawArrow(ctx) {
      const c = this.pointAtArcPx(this.headArc);
      drawDirFrame(ctx, ASSETS.arrow, this.directionAtArc(this.headArc), c.x, c.y);
    }
  }

  function drawStraightBody(ctx, A, dir, variant, a0, a1, segIndex) {
    const start = cellCenterPx(A.x, A.y);
    const halfT = VINE_THICKNESS / 2;
    if (axisOf(dir) === AXIS_H) {
      const tex = ASSETS.body;
      const fy = (variant % tex.rows) * tex.fh;
      const drawScale = VINE_THICKNESS / tex.fh;
      const srcCellW  = CELL_SIZE / drawScale;
      const texLen    = tex.fw;
      const phase = segIndex * srcCellW;
      const sign  = (dir === RIGHT) ? 1 : -1;
      const x0 = start.x + sign * a0 * CELL_SIZE;
      const x1 = start.x + sign * a1 * CELL_SIZE;
      const destX = Math.min(x0, x1), destW = Math.abs(x1 - x0);
      drawHSlice(ctx, tex.img, fy, tex.fh, phase + a0 * srcCellW, (a1 - a0) * srcCellW,
                 destX, start.y - halfT, destW, VINE_THICKNESS, texLen);
    } else {
      const tex = ASSETS.bodyV;
      const img = tex.variants[variant % tex.variants.length];
      const drawScale = VINE_THICKNESS / tex.fw;
      const srcCellH  = CELL_SIZE / drawScale;
      const texLen    = tex.fh;
      const phase = segIndex * srcCellH;
      const sign  = (dir === DOWN) ? 1 : -1;
      const y0 = start.y + sign * a0 * CELL_SIZE;
      const y1 = start.y + sign * a1 * CELL_SIZE;
      const destY = Math.min(y0, y1), destH = Math.abs(y1 - y0);
      drawVSlice(ctx, img, 0, tex.fw, phase + a0 * srcCellH, (a1 - a0) * srcCellH,
                 start.x - halfT, destY, VINE_THICKNESS, destH, texLen);
    }
  }

  /* ---- procedural corner geometry (preserved) --------------------------- */
  function cornerClip(armIn, armOut, L, T, R, B) {
    const TL = [[L, B], [L, T], [R, T]];
    const BR = [[L, B], [R, B], [R, T]];
    const TR = [[L, T], [R, T], [R, B]];
    const BL = [[L, T], [L, B], [R, B]];
    const set = new Set([armIn, armOut]);
    const side = {};
    if      (set.has(LEFT) && set.has(UP))    { side[LEFT] = BL; side[UP] = TR; }
    else if (set.has(UP)   && set.has(RIGHT)) { side[UP] = TL;   side[RIGHT] = BR; }
    else if (set.has(LEFT) && set.has(DOWN))  { side[LEFT] = TL; side[DOWN] = BR; }
    else if (set.has(DOWN) && set.has(RIGHT)) { side[DOWN] = BL; side[RIGHT] = TR; }
    return { inTri: side[armIn], outTri: side[armOut] };
  }
  function inflateTri(tri, px) {
    const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
    const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    return tri.map(([x, y]) => {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
      return [x + (dx / d) * px, y + (dy / d) * px];
    });
  }
  function clipTri(ctx, tri) {
    ctx.beginPath();
    ctx.moveTo(tri[0][0], tri[0][1]);
    ctx.lineTo(tri[1][0], tri[1][1]);
    ctx.lineTo(tri[2][0], tri[2][1]);
    ctx.closePath();
    ctx.clip();
  }
  function debugCorner(ctx, L, T, R, B, clips) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,60,60,0.9)";
    ctx.strokeRect(L, T, R - L, B - T);
    ctx.strokeStyle = "rgba(70,200,255,0.95)";
    [clips.inTri, clips.outTri].forEach((tri) => {
      if (!tri) return;
      ctx.beginPath();
      ctx.moveTo(tri[0][0], tri[0][1]);
      ctx.lineTo(tri[1][0], tri[1][1]);
      ctx.lineTo(tri[2][0], tri[2][1]);
      ctx.closePath(); ctx.stroke();
    });
    ctx.restore();
  }
  function drawDirFrame(ctx, atlas, dir, cx, cy) {
    if (!atlas) return;
    const b = dirBlock(dir);
    const S = CAP_ARROW_SIZE;
    ctx.drawImage(atlas.img, b.col * atlas.fw, b.row * atlas.fh, atlas.fw, atlas.fh,
                  cx - S / 2, cy - S / 2, S, S);
  }

  /* ==================================================================== *
   *  PROCEDURAL PLACEHOLDERS (used only if a real PNG is missing)
   * ==================================================================== */
  function makeCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function hexToRgb(h) {
    h = h.replace("#", "");
    return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
  }
  function shade(hex, amt) {
    const c = hexToRgb(hex), t = Math.abs(amt), m = amt >= 0 ? 255 : 0;
    const mix = (v) => Math.round(v + (m - v) * t);
    return `rgb(${mix(c.r)},${mix(c.g)},${mix(c.b)})`;
  }
  function makeBodyPlaceholder() {
    const fh = VINE_THICKNESS, fw = CELL_SIZE * 4;
    const cv = makeCanvas(fw, fh * VARIANT_COUNT);
    const ctx = cv.getContext("2d");
    for (let v = 0; v < VARIANT_COUNT; v++) {
      const y = v * fh, base = COLORS.variants[v];
      const g = ctx.createLinearGradient(0, y, 0, y + fh);
      g.addColorStop(0, shade(base, 0.18)); g.addColorStop(0.5, base); g.addColorStop(1, shade(base, -0.18));
      ctx.fillStyle = g; ctx.fillRect(0, y, fw, fh);
      ctx.strokeStyle = COLORS.guideLine; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y + fh / 2); ctx.lineTo(fw, y + fh / 2); ctx.stroke();
    }
    return cv;
  }
  function makeArrowPlaceholder() {
    const F = CELL_SIZE, cv = makeCanvas(2 * F, 2 * F), ctx = cv.getContext("2d");
    [LEFT, RIGHT, UP, DOWN].forEach((dir) => { const b = dirBlock(dir); paintArrowGlyph(ctx, b.col * F, b.row * F, F, dir, COLORS.variants[0]); });
    return cv;
  }
  function makeCapPlaceholder() {
    const F = CELL_SIZE, cv = makeCanvas(2 * F, 2 * F), ctx = cv.getContext("2d");
    [LEFT, RIGHT, UP, DOWN].forEach((dir) => { const b = dirBlock(dir); paintCapGlyph(ctx, b.col * F, b.row * F, F, dir, COLORS.variants[0]); });
    return cv;
  }
  function paintStub(ctx, fx, fy, F, side, base) {
    const half = VINE_THICKNESS / 2, cx = fx + F / 2, cy = fy + F / 2;
    ctx.fillStyle = base;
    if (side === LEFT)  ctx.fillRect(fx, cy - half, F / 2, VINE_THICKNESS);
    if (side === RIGHT) ctx.fillRect(cx, cy - half, F / 2, VINE_THICKNESS);
    if (side === UP)    ctx.fillRect(cx - half, fy, VINE_THICKNESS, F / 2);
    if (side === DOWN)  ctx.fillRect(cx - half, cy, VINE_THICKNESS, F / 2);
  }
  function paintArrowGlyph(ctx, fx, fy, F, dir, base) {
    const cx = fx + F / 2, cy = fy + F / 2, half = VINE_THICKNESS / 2, m = 8;
    paintStub(ctx, fx, fy, F, opposite(dir), base);
    ctx.fillStyle = base; ctx.beginPath();
    if (dir === RIGHT)      { ctx.moveTo(cx - half, fy + m); ctx.lineTo(fx + F - m, cy); ctx.lineTo(cx - half, fy + F - m); }
    else if (dir === LEFT)  { ctx.moveTo(cx + half, fy + m); ctx.lineTo(fx + m, cy);     ctx.lineTo(cx + half, fy + F - m); }
    else if (dir === DOWN)  { ctx.moveTo(fx + m, cy - half); ctx.lineTo(cx, fy + F - m); ctx.lineTo(fx + F - m, cy - half); }
    else                    { ctx.moveTo(fx + m, cy + half); ctx.lineTo(cx, fy + m);     ctx.lineTo(fx + F - m, cy + half); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(base, -0.35); ctx.lineWidth = 2; ctx.stroke();
  }
  function paintCapGlyph(ctx, fx, fy, F, dir, base) {
    const cx = fx + F / 2, cy = fy + F / 2, half = VINE_THICKNESS / 2, r = half;
    ctx.fillStyle = COLORS.capRim; ctx.beginPath();
    if (axisOf(dir) === AXIS_H) roundRect(ctx, fx + 4, cy - half, F - 8, VINE_THICKNESS, r);
    else                        roundRect(ctx, cx - half, fy + 4, VINE_THICKNESS, F - 8, r);
    ctx.fill();
    paintStub(ctx, fx, fy, F, opposite(dir), base);
  }
  function roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);         ctx.arcTo(x, y, x + w, y, r);
  }

  /* ==================================================================== *
   *  DEFAULT MAP — the PM's hand-built 16x18 scenario (vine-snake FIXED_MAP)
   * ==================================================================== */
  const randInt = (n) => Math.floor(Math.random() * n);
  const randDir = () => [LEFT, RIGHT, UP, DOWN][randInt(4)];
  const perpOf = (dir) => (dir === LEFT || dir === RIGHT)
    ? (Math.random() < 0.5 ? UP : DOWN) : (Math.random() < 0.5 ? LEFT : RIGHT);

  const FIXED_MAP = [
    [{x:5,y:2},{x:6,y:2},{x:7,y:2},{x:7,y:1},{x:7,y:0},{x:6,y:0},{x:5,y:0},{x:4,y:0},{x:3,y:0},{x:2,y:0},{x:1,y:0},{x:0,y:0},{x:0,y:1},{x:0,y:2},{x:0,y:3},{x:0,y:4},{x:0,y:5}],
    [{x:15,y:2},{x:15,y:1},{x:15,y:0},{x:14,y:0},{x:13,y:0},{x:12,y:0},{x:11,y:0},{x:10,y:0},{x:9,y:0},{x:8,y:0}],
    [{x:9,y:2},{x:10,y:2},{x:11,y:2},{x:12,y:2},{x:13,y:2},{x:14,y:2}],
    [{x:13,y:17},{x:14,y:17},{x:15,y:17},{x:15,y:16},{x:15,y:15},{x:15,y:14},{x:15,y:13},{x:15,y:12},{x:15,y:11},{x:15,y:10}],
    [{x:15,y:15},{x:14,y:15},{x:13,y:15},{x:12,y:15},{x:11,y:15},{x:10,y:15},{x:9,y:15},{x:8,y:15},{x:7,y:15}],
    [{x:15,y:16},{x:14,y:16},{x:13,y:16},{x:12,y:16},{x:11,y:16},{x:10,y:16}],
    [{x:2,y:15},{x:2,y:14},{x:2,y:13},{x:2,y:12},{x:2,y:11},{x:2,y:10},{x:1,y:10},{x:0,y:10}],
    [{x:0,y:11},{x:0,y:12},{x:0,y:13},{x:0,y:14},{x:0,y:15},{x:0,y:16},{x:0,y:17}],
    [{x:3,y:15},{x:4,y:15},{x:5,y:15},{x:6,y:15},{x:6,y:16}],
    [{x:15,y:15},{x:15,y:16},{x:15,y:17},{x:14,y:17},{x:13,y:17},{x:12,y:17},{x:11,y:17},{x:10,y:17},{x:9,y:17},{x:8,y:17},{x:7,y:17},{x:6,y:17},{x:5,y:17},{x:4,y:17}],
    [{x:2,y:7},{x:2,y:6},{x:2,y:5},{x:2,y:4},{x:2,y:3},{x:1,y:3},{x:1,y:2},{x:2,y:2},{x:3,y:2},{x:4,y:2},{x:4,y:3},{x:4,y:4}],
    [{x:0,y:6},{x:0,y:7},{x:0,y:8},{x:1,y:8},{x:2,y:8},{x:3,y:8},{x:4,y:8},{x:5,y:8}],
    [{x:2,y:7},{x:3,y:7},{x:4,y:7},{x:5,y:7},{x:6,y:7},{x:6,y:6},{x:6,y:5},{x:7,y:5},{x:8,y:5},{x:9,y:5},{x:10,y:5}],
    [{x:13,y:4},{x:13,y:5},{x:13,y:6},{x:13,y:7},{x:13,y:8},{x:13,y:9},{x:12,y:9},{x:11,y:9},{x:10,y:9},{x:9,y:9},{x:8,y:9},{x:7,y:9},{x:6,y:9}],
    [{x:9,y:5},{x:10,y:5},{x:11,y:5},{x:11,y:4},{x:11,y:3},{x:10,y:3},{x:9,y:3},{x:8,y:3},{x:8,y:2}],
    [{x:6,y:6},{x:6,y:7},{x:6,y:8},{x:6,y:9},{x:6,y:10},{x:6,y:11},{x:6,y:12},{x:6,y:13},{x:5,y:13},{x:4,y:13}],
    [{x:8,y:5},{x:8,y:6},{x:8,y:7},{x:8,y:8},{x:8,y:9},{x:8,y:10},{x:8,y:11},{x:8,y:12},{x:8,y:13},{x:9,y:13},{x:10,y:13},{x:10,y:12},{x:10,y:11},{x:10,y:10},{x:10,y:9},{x:11,y:9},{x:12,y:9},{x:13,y:9},{x:14,y:9},{x:14,y:8},{x:15,y:8}],
    [{x:6,y:12},{x:6,y:13},{x:7,y:13},{x:8,y:13},{x:9,y:13},{x:10,y:13},{x:10,y:12},{x:10,y:11},{x:10,y:10},{x:10,y:9},{x:10,y:8},{x:10,y:7},{x:10,y:6},{x:11,y:6},{x:12,y:6},{x:12,y:5},{x:12,y:4},{x:12,y:3},{x:13,y:3}],
  ];
  function defaultVineList() { return FIXED_MAP.map((path, i) => ({ path: path.map((p) => ({ x: p.x, y: p.y })), variant: i % VARIANT_COUNT })); }
  function randomVineList() {
    const occupied = new Set();
    const key = (x, y) => x + "," + y;
    const inBounds = (x, y) => x >= 0 && x < BOARD_COLS && y >= 0 && y < BOARD_ROWS;
    const out = [];
    const target = Math.max(6, Math.round((BOARD_COLS * BOARD_ROWS) / 14));
    let guard = 0;
    while (out.length < target && guard < target * 40) {
      guard++;
      const sx = randInt(BOARD_COLS), sy = randInt(BOARD_ROWS);
      if (occupied.has(key(sx, sy))) continue;
      const path = [{ x: sx, y: sy }];
      const used = new Set([key(sx, sy)]);
      const len = 2 + randInt(4), maxTurns = randInt(3);
      let dir = randDir(), turns = 0;
      for (let i = 1; i < len; i++) {
        if (turns < maxTurns && Math.random() < 0.45) { dir = perpOf(dir); turns++; }
        const last = path[path.length - 1];
        let nx = last.x + DELTA[dir].x, ny = last.y + DELTA[dir].y;
        if (!inBounds(nx, ny) || used.has(key(nx, ny))) {
          if (turns < maxTurns) {
            dir = perpOf(dir);
            nx = last.x + DELTA[dir].x; ny = last.y + DELTA[dir].y;
            if (!inBounds(nx, ny) || used.has(key(nx, ny))) break;
            turns++;
          } else break;
        }
        path.push({ x: nx, y: ny }); used.add(key(nx, ny));
      }
      if (path.length < 2) continue;
      path.forEach((p) => occupied.add(key(p.x, p.y)));
      out.push({ path, variant: randInt(VARIANT_COUNT) });
    }
    return out;
  }

  /* ==================================================================== *
   *  RENDER / VIEW
   * ==================================================================== */
  const BOARD_W = BOARD_COLS * CELL_SIZE;
  const BOARD_H = BOARD_ROWS * CELL_SIZE;

  function resize() {
    if (!canvas || !host) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = host.getBoundingClientRect();
    const cssW = Math.max(1, rect.width), cssH = Math.max(1, rect.height);
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width  = cssW + "px";
    canvas.style.height = cssH + "px";
    flashLayer.width = canvas.width; flashLayer.height = canvas.height;
    // Landscape: the board is taller-than-wide, so fit it by HEIGHT and center it
    // (ignore the portrait offset) to simulate a portrait column in the middle of
    // the screen. Portrait: contain-fit + the PM's tuned offset.
    const landscape = cssW > cssH;
    view.landscape = landscape;
    const fit = landscape
      ? (cssH / BOARD_H) * 0.96 * board.scale
      : Math.min(cssW / BOARD_W, cssH / BOARD_H) * 0.96 * board.scale;
    const effOx = landscape ? 0 : board.ox;
    const effOy = landscape ? 0 : board.oy;
    view.dpr = dpr; view.scale = fit; view.cssW = cssW; view.cssH = cssH;
    view.offsetX = (cssW - BOARD_W * fit) / 2 + effOx * cssW;
    view.offsetY = (cssH - BOARD_H * fit) / 2 + effOy * cssH;
  }
  function applyTransform(c) {
    c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    c.translate(view.offsetX, view.offsetY);
    c.scale(view.scale, view.scale);
  }
  function screenToBoard(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.offsetX) / view.scale,
      y: (clientY - rect.top  - view.offsetY) / view.scale,
    };
  }
  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = COLORS.gridLine; ctx.lineWidth = 1; ctx.beginPath();
    for (let c = 0; c <= BOARD_COLS; c++) { ctx.moveTo(c * CELL_SIZE, 0); ctx.lineTo(c * CELL_SIZE, BOARD_H); }
    for (let r = 0; r <= BOARD_ROWS; r++) { ctx.moveTo(0, r * CELL_SIZE); ctx.lineTo(BOARD_W, r * CELL_SIZE); }
    ctx.stroke();
    // subtle board outline so the edit canvas reads as a bounded field
    ctx.strokeStyle = "rgba(120,90,170,0.5)"; ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, BOARD_W, BOARD_H);
    ctx.restore();
  }
  function drawVineInto(c, v) {
    const o = v.bounceOffset();
    c.save();
    if (o) c.translate(o.x, o.y);
    v.drawBody(c); v.drawCap(c); v.drawArrow(c);
    c.restore();
  }
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);   // TRANSPARENT (creature shows behind)
    applyTransform(ctx);
    if (mode === "edit-map") drawGrid();
    for (const v of vines) {
      if (v.isRemoved) continue;
      drawVineInto(ctx, v);
      if (v.flash > 0.001) {
        const lc = flashLayer, lctx = lc.getContext("2d");
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.clearRect(0, 0, lc.width, lc.height);
        applyTransform(lctx);
        drawVineInto(lctx, v);
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.globalCompositeOperation = "source-atop";
        lctx.fillStyle = "rgb(255,0,0)";
        lctx.fillRect(0, 0, lc.width, lc.height);
        lctx.globalCompositeOperation = "source-over";
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = FLASH_PEAK * v.flash;
        ctx.drawImage(lc, 0, 0);
        ctx.restore();
        applyTransform(ctx);
      }
    }
    if (mode === "edit-map" && draft && draft.length) {
      ctx.save();
      ctx.fillStyle = "rgba(255,235,59,0.55)";
      const t = VINE_THICKNESS;
      for (const c of draft) {
        ctx.fillRect(c.x * CELL_SIZE + (CELL_SIZE - t) / 2, c.y * CELL_SIZE + (CELL_SIZE - t) / 2, t, t);
      }
      const h = draft[draft.length - 1];
      ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 3;
      ctx.strokeRect(h.x * CELL_SIZE + 6, h.y * CELL_SIZE + 6, CELL_SIZE - 12, CELL_SIZE - 12);
      ctx.restore();
    }
  }

  /* ============================== *
   *  INPUT
   * ============================== */
  function onPointerDown(e) {
    if (mode === "edit-art") return;            // inert: only sliders/creature change
    e.preventDefault();
    const p = screenToBoard(e.clientX, e.clientY);
    if (mode === "edit-map") { buildDown(p, e); return; }
    if (!active || won) return;
    for (const v of vines) {
      if (v.containsPoint(p.x, p.y)) {
        const blocked = v.firstBlock();     // predict: clear path = a correct pick
        v.startMove();
        if (!blocked && cbCorrectTap) cbCorrectTap();   // (a blocked tap fires onWrongTap on collision)
        break;
      }
    }
  }
  function onPointerMove(e) { if (mode === "edit-map") buildMove(screenToBoard(e.clientX, e.clientY)); }
  function onPointerUp() { if (mode === "edit-map") buildUp(); }

  /* ============================== *
   *  BUILD MODE (map editor)
   * ============================== */
  let buildTool = "paint";
  let erasing = false;
  let gestureErased = 0;
  const undoStack = [];
  const cellAt = (p) => ({ x: Math.floor(p.x / CELL_SIZE), y: Math.floor(p.y / CELL_SIZE) });
  const inBoardCell = (c) => c.x >= 0 && c.x < BOARD_COLS && c.y >= 0 && c.y < BOARD_ROWS;
  const vineAtCell = (c) => vines.find((v) => !v.isRemoved && v.cellKeys.has(c.x + "," + c.y));
  function snapshot() {
    return vines.filter((v) => !v.isRemoved).map((v) => ({ path: v.path.map((p) => ({ x: p.x, y: p.y })), variant: v.variant }));
  }
  function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 60) undoStack.shift(); }
  function undo() {
    if (!undoStack.length) return;
    vines = undoStack.pop().map((s) => new Vine(s.path, s.variant));
    draft = null;
  }
  function setTool(t) { buildTool = t; draft = null; erasing = false; }
  function buildDown(p, e) {
    const c = cellAt(p);
    if (!inBoardCell(c)) return;
    if (canvas.setPointerCapture) try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    if (buildTool === "erase") {
      pushUndo(); erasing = true; gestureErased = 0;
      const hit = vineAtCell(c);
      if (hit) { vines = vines.filter((v) => v !== hit); gestureErased++; }
      return;
    }
    draft = [c];
  }
  function buildMove(p) {
    const c = cellAt(p);
    if (!inBoardCell(c)) return;
    if (buildTool === "erase") {
      if (!erasing) return;
      const hit = vineAtCell(c);
      if (hit) { vines = vines.filter((v) => v !== hit); gestureErased++; }
      return;
    }
    if (!draft) return;
    const last = draft[draft.length - 1];
    if (c.x === last.x && c.y === last.y) return;
    if (draft.length >= 2) {
      const prev = draft[draft.length - 2];
      if (prev.x === c.x && prev.y === c.y) { draft.pop(); return; }
    }
    if (Math.abs(c.x - last.x) + Math.abs(c.y - last.y) !== 1) return;
    if (draft.some((d) => d.x === c.x && d.y === c.y)) return;
    draft.push(c);
  }
  function buildUp() {
    if (buildTool === "erase") {
      if (erasing && gestureErased === 0) undoStack.pop();
      erasing = false; return;
    }
    if (draft && draft.length >= 2) {
      pushUndo();
      vines.push(new Vine(draft.map((d) => ({ x: d.x, y: d.y })), randInt(VARIANT_COUNT)));
    }
    draft = null;
  }
  function clearBoard() { pushUndo(); vines = []; draft = null; }

  /* ============================== *
   *  SCENE LOAD / SAVE  (the vine part of the unified scene)
   * ============================== */
  function loadScene(scene) {
    scene = scene || {};
    if (!ready) { pendingScene = scene; return; }
    const list = scene.vines && scene.vines.length ? scene.vines : defaultVineList();
    vines = list.map((v) => new Vine(v.path, v.variant || 0));
    draft = null; won = false; started = true; hadVines = vines.length > 0;
    undoStack.length = 0;
    if (scene.speed != null) setSpeed(scene.speed);
    if (scene.board) {
      if (scene.board.scale != null) board.scale = scene.board.scale;
      if (scene.board.ox != null) board.ox = scene.board.ox;
      if (scene.board.oy != null) board.oy = scene.board.oy;
    }
    resize();
    reportProgress();
  }
  function getScene() {
    return {
      vines: vines.filter((v) => !v.isRemoved).map((v) => ({ path: v.path.map((p) => ({ x: p.x, y: p.y })), variant: v.variant })),
      speed: VINE_SPEED,
      board: { scale: +board.scale.toFixed(3), ox: +board.ox.toFixed(3), oy: +board.oy.toFixed(3) },
      grid: { cols: BOARD_COLS, rows: BOARD_ROWS, cell: CELL_SIZE },
    };
  }
  function defaultScene() { return { vines: defaultVineList(), speed: 40, board: { scale: 0.85, ox: 0, oy: -0.05 } }; }

  function setSpeed(v) { VINE_SPEED = +v; }
  function setBoardTransform(t) {
    if (!t) return;
    if (t.scale != null) board.scale = +t.scale;
    if (t.ox != null) board.ox = +t.ox;
    if (t.oy != null) board.oy = +t.oy;
    resize();
  }
  function getBoardTransform() { return { scale: board.scale, ox: board.ox, oy: board.oy }; }

  function setMode(m) {
    mode = m; draft = null; erasing = false;
    if (m === "edit-map") { undoStack.length = 0; }
  }
  function reportProgress() { if (cbProgress) cbProgress(vines.length, hadVines); }

  /* ============================== *
   *  GAME LOOP
   * ============================== */
  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (!lastT) lastT = now;
    let dt = (now - lastT) / 1000; lastT = now;
    if (dt > 0.05) dt = 0.05;
    if (active) {
      const before = vines.length;
      for (const v of vines) v.update(dt);
      if (vines.some((v) => v.isRemoved)) vines = vines.filter((v) => !v.isRemoved);
      if (vines.length !== before) reportProgress();
      // WIN: every playable vine has slithered off the board
      if (mode === "play" && started && !won && hadVines && vines.length === 0) {
        won = true;
        if (cbAllCleared) cbAllCleared();
      }
    }
    render();
  }

  /* ============================== *
   *  PUBLIC API
   * ============================== */
  async function create(opts) {
    opts = opts || {};
    canvas = opts.canvas;
    host = opts.host || canvas.parentElement;
    ctx = canvas.getContext("2d");
    cbAllCleared = opts.onAllCleared || null;
    cbWrongTap = opts.onWrongTap || null;
    cbProgress = opts.onProgress || null;
    cbCorrectTap = opts.onCorrectTap || null;
    if (opts.board) setBoardTransform(opts.board);

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    // A ResizeObserver on the host keeps the canvas glued to the puzzle area
    // whenever ITS box changes (orientation flip, layout shift, HUD reflow) —
    // more reliable than the window 'resize' event alone. The canvas is
    // absolutely positioned, so observing the host never feeds back.
    if (window.ResizeObserver) {
      try { new ResizeObserver(() => resize()).observe(host); } catch (_) {}
    }
    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp, { passive: false });
    canvas.addEventListener("pointercancel", onPointerUp, { passive: false });

    await loadAllAssets();
    ready = true;
    if (pendingScene) { const s = pendingScene; pendingScene = null; loadScene(s); }
    else loadScene(defaultScene());
    if (!rafId) requestAnimationFrame(frame);
    if (opts.onReady) opts.onReady(api);
    return api;
  }

  const api = {
    create,
    loadScene, getScene, defaultScene,
    setMode, get mode() { return mode; },
    setActive(v) { active = !!v; },
    isWon() { return won; },
    setSpeed, get speed() { return VINE_SPEED; },
    setBoardTransform, getBoardTransform,
    setTool, undo, clearBoard,
    randomize() { pushUndo(); vines = randomVineList().map((v) => new Vine(v.path, v.variant)); draft = null; },
    resize,
    get grid() { return { cols: BOARD_COLS, rows: BOARD_ROWS, cell: CELL_SIZE }; },
    get isLandscape() { return view.landscape; },
    get remaining() { return vines.length; },
    get undoDepth() { return undoStack.length; },
    // Debug/QA hooks — drive a single frame deterministically (the normal loop
    // is rAF-driven, which a backgrounded preview tab throttles to a halt).
    renderOnce() { render(); },
    tick(dt) {
      if (active) {
        for (const v of vines) v.update(dt || 0);
        if (vines.some((v) => v.isRemoved)) vines = vines.filter((v) => !v.isRemoved);
        if (mode === "play" && started && !won && hadVines && vines.length === 0) {
          won = true; if (cbAllCleared) cbAllCleared();
        }
        reportProgress();
      }
      render();
    },
    // Viewport-space position of an AVAILABLE (idle, path-clear) vine's head —
    // for the tutorial hand to point at. Returns {x,y} (client px) or null.
    getHintTarget() {
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      for (const v of vines) {
        if (v.isRemoved || v.phase !== "idle") continue;
        if (v.firstBlock()) continue;        // blocked vine is not a valid hint
        const head = v.pointAtArcPx(v.headArc);
        return { x: rect.left + view.offsetX + head.x * view.scale, y: rect.top + view.offsetY + head.y * view.scale };
      }
      return null;
    },
    tapAt(boardX, boardY) {   // simulate a vine tap (board coords) for QA — mirrors onPointerDown
      for (const v of vines) {
        if (v.containsPoint(boardX, boardY)) {
          const blocked = v.firstBlock();
          v.startMove();
          if (!blocked && cbCorrectTap) cbCorrectTap();
          return v.path[v.L];
        }
      }
      return null;
    },
  };
  return api;
})();
