import re
path = r'C:/Users/AugustoGehm/Fork/playables-playground/playables/NewPlayables/tile sort/pup_sort_3_moves.html'
with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# === 1. Title ===
html, n = re.subn(r'<title>Pup Sort — Cute Puppies</title>',
                  '<title>Pup Sort 3 Moves — Demo</title>',
                  html, count=1)
assert n == 1, "title"

# === 2. Replace layoutBoard with adaptive-zoom ===
old_layout = """function layoutBoard() {
  // Tight viewport padding so the board fills as much of the screen as
  // possible — the logo is gone, so we don't need to reserve a top band
  // for it. Just enough margin to keep the outer wood frame from kissing
  // the screen edges.
  const padX   = Math.max(6, W * 0.010);
  const padTop = Math.max(6, H * 0.012);
  const padBot = Math.max(6, H * 0.012);
  const availW = W - padX * 2;
  const availH = H - padTop - padBot;
  // Each cell aspect: 3 slots horizontally, ~1.0:0.85 (slightly taller)
  // Cell aspect = (3*slotW)/(slotH). Tune slot aspect so total fits.
  // Target: cellW/cellH ≈ 1.5
  const cellAspect = 1.5;
  let cellW = availW / COLS;
  let cellH = cellW / cellAspect;
  if (cellH * ROWS > availH) {
    cellH = availH / ROWS;
    cellW = cellH * cellAspect;
  }
  const totalW = cellW * COLS;
  const totalH = cellH * ROWS;
  board.x = (W - totalW) / 2;
  board.y = padTop + (availH - totalH) / 2;
  board.cellW = cellW;
  board.cellH = cellH;
  board.slotW = cellW / SLOTS;
  board.slotH = cellH * 0.86; // item area; rest is shelf-floor below
}"""
new_layout = """function layoutBoard() {
  // === Adaptive-zoom FILL layout ===
  // Inspired by AppLovin's Goods Sorting playable behaviour: the cells
  // never shrink to letterbox-fit the screen; instead the board scales
  // to fully FILL one axis and lets the other overflow with partial
  // cells visible at the edges. Center of the board stays anchored
  // visually so the action area is always on-screen regardless of
  // portrait / landscape / square aspect.
  //
  //   cellAspect = 1.5  -> board's natural aspect = COLS * 1.5 / ROWS
  //   if viewport is WIDER than the board -> fit cell WIDTH (= W/COLS),
  //     vertical overflow at top/bottom edges.
  //   if viewport is TALLER -> fit cell HEIGHT (= H/ROWS via aspect),
  //     horizontal overflow at left/right edges.
  // Either way, cells are at the larger of the two scale options ->
  // the board always reaches at least one screen edge.
  const cellAspect = 1.5;
  const naturalAspect = (COLS * cellAspect) / ROWS;   // ~1.6875 for 9x8
  const viewAspect = W / H;
  let cellW, cellH;
  if (viewAspect > naturalAspect) {
    // Screen wider than board's natural aspect -> scale by WIDTH.
    cellW = W / COLS;
    cellH = cellW / cellAspect;
  } else {
    // Screen taller than board -> scale by HEIGHT.
    cellH = H / ROWS;
    cellW = cellH * cellAspect;
  }
  const totalW = cellW * COLS;
  const totalH = cellH * ROWS;
  // Center the board. board.x and/or board.y may be NEGATIVE -- that's
  // intentional: the board overflows the viewport on the longer axis.
  board.x = (W - totalW) / 2;
  board.y = (H - totalH) / 2;
  board.cellW = cellW;
  board.cellH = cellH;
  board.slotW = cellW / SLOTS;
  board.slotH = cellH * 0.86;
}"""
html, n = re.subn(re.escape(old_layout), new_layout, html, count=1)
assert n == 1, "layout replacement failed"

# === 3. Replace INITIAL_BOARD ===
new_level_js = """const INITIAL_BOARD = [
  // Row 0
  [
    [36, 32, 38],
    [4, 24, 3],
    [36, 9, 34],
    [10, 20, 7],
    [34, 29, 12],
    [24, 16, 4],
    [23, 9, 10],
    [5, 30, 39],
    [7, 27, 8],
  ],
  // Row 1
  [
    [4, 37, 9],
    [34, 19, 0],
    [37, 9, 24],
    [27, 37, 22],
    [21, 25, 7],
    [29, 30, 20],
    [32, 11, 19],
    [22, 13, 8],
    [34, 11, 28],
  ],
  // Row 2
  [
    [20, 1, 38],
    [2, 6, 3],
    [30, 35, 0],
    [18, 18, 39],
    [36, 33, 34],
    [19, 21, 5],
    [0, 24, 33],
    [26, 36, 2],
    [29, 28, 1],
  ],
  // Row 3 -- tutorial cluster
  [
    [6, 39, 37],
    [36, 35, 0],
    [11, 30, 3],
    [13, 39, null],   // filler [Y, Z, null] -- near-center donor space
    [14, 14, null],   // <-- TUTORIAL TARGET [X, X, null] (centered)
    [28, 31, null],   // filler [Y, Z, null] -- near-center donor space
    [20, 23, 16],
    [35, 8, 26],
    [38, 35, 21],
  ],
  // Row 4 -- tutorial donor + empty
  [
    [39, 4, 30],
    [10, 6, 26],
    [13, 19, 35],
    [null, null, null], // empty donor space (center, always visible)
    [14, 1, 15],        // <-- TUTORIAL DONOR (X at slot 0, just below target)
    [17, 6, 32],
    [28, 34, 7],
    [2, 30, 5],
    [16, 4, 1],
  ],
  // Row 5
  [
    [25, 27, 25],
    [2, 26, 26],
    [26, 3, 3],
    [32, 1, 6],
    [11, 0, 8],
    [0, 19, 35],
    [13, 18, 22],
    [31, 32, 22],
    [38, 23, 36],
  ],
  // Row 6
  [
    [16, 12, 29],
    [31, 16, 33],
    [22, 15, 38],
    [4, 17, 8],
    [33, 29, 23],
    [20, 29, 12],
    [28, 33, 3],
    [39, 20, 19],
    [37, 9, 22],
  ],
  // Row 7
  [
    [11, 2, 38],
    [15, 28, 13],
    [17, 13, 24],
    [24, 33, 16],
    [2, 23, 7],
    [25, 25, 9],
    [1, 6, 11],
    [23, 25, 7],
    [8, 32, 37]
  ]
];"""
m = re.search(r'const INITIAL_BOARD = \[\n(?:.*\n)*?\];', html)
assert m, "INITIAL_BOARD not found"
print(f"Replacing INITIAL_BOARD: {m.end()-m.start()} chars")
html = html[:m.start()] + new_level_js + html[m.end():]

# === 4. Update tutorial config ===
old_tut = """  // Pre-chosen demo move from the hand-mapped initial level:
  // r2c2 = [38, 26, 26] → pick the pear at slot 1
  // r4c6 = [null, 26, 26] → drop into slot 0 to complete the trio
  src: { r: 2, c: 2, s: 1 },
  dst: { r: 4, c: 6, s: 0 },
  typeId: 26,"""
new_tut = """  // Pre-chosen demo move centered in the 9x8 board so the action
  // is always visible regardless of viewport aspect:
  //   r4c4 slot 0 = type 14 -- donor (single matching pup)
  //   r3c4       = [14, 14, null] -- target waiting for the third
  // The hand picks the X from r4c4 and drops into slot 2 of r3c4 ->
  // cell becomes [14, 14, 14] -> match.
  src: { r: 4, c: 4, s: 0 },
  dst: { r: 3, c: 4, s: 2 },
  typeId: 14,"""
html, n = re.subn(re.escape(old_tut), new_tut, html, count=1)
assert n == 1, "tutorial replacement failed"

# === 5. Add move counter + redirect logic ===
old_won = "let won = false;"
new_won = """let won = false;

// === 3-MOVE DEMO MODE -- Playable-ad-style limit ===
//
// The player gets MAX_MOVES drag-and-drop moves; after the third
// successful drop completes (transit lands in the slot, optional
// match anim plays out), we redirect to REDIRECT_URL. This is the
// AppLovin / Liftoff "post-CTA" pattern: short engagement -> store.
//
// REDIRECT_URL is a placeholder (Google) -- swap it for the actual
// store URL when integrating with an ad network.
const MAX_MOVES = 3;
const REDIRECT_URL = 'https://www.google.com';
let moveCount = 0;
let redirected = false;

function recordMove() {
  if (redirected) return;
  moveCount++;
  if (moveCount >= MAX_MOVES) {
    redirected = true;
    // Brief pause so the last animation (transit + optional match)
    // can complete before the page navigates away.
    setTimeout(function() { window.location.href = REDIRECT_URL; }, 1500);
  }
}"""
html, n = re.subn(re.escape(old_won), new_won, html, count=1)
assert n == 1, "won-let injection failed"

# === 6. Hook recordMove into deposit ===
deposit_pattern = "shelves[tr.dstR][tr.dstC].items[tr.dstS] = tr.typeId;"
count_in_html = html.count(deposit_pattern)
print(f"deposit pattern appears {count_in_html} times")
assert count_in_html >= 1, "deposit not found"
html = html.replace(deposit_pattern,
                    deposit_pattern + "\n    recordMove();",
                    1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)
print("Done. New length:", len(html))
