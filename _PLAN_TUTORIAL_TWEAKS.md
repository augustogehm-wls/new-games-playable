# PLAN — Tutorial improvements across NewPlayables

Date: 2026-05-11
PM: Augusto

## Summary

- **Operation:** Behavioral tweaks across 6 existing playables (tile sort + liquid sort)
- **Build path:** fork-and-modify (direct code edits in the fork — no subskill, no scaffold, no engine swap)
- **Engine preservation:** automatic (editing existing engines)
- **New assets:** none
- **Estimated diff size:** ~150-300 lines per file

**Files affected:**
- `tile sort/pup_sort.html` (active; 2.48 MB; last edited 08/05/2026 15:52)
- `tile sort/airport_sort.html`
- `tile sort/cosy_home_sort.html`
- `fluid sort/summer_juice_bar_sort.html`
- `fluid sort/witch_potion_sort.html`
- `fluid sort/magic_sand_sort.html`

---

## Group 1 — Tile Sort tutorial (pup_sort, airport_sort, cosy_home_sort)

**Current behavior:** Hand demos one valid match on loop. `dismissTutorial()` is called inside `onPointerDown` (around line 1240 in pup_sort) → first drag of ANY item dismisses the hand permanently, even if the player had no idea what to do.

**Changes:**

### 1.1 — Hand persists until the demonstrated match completes
- Remove `dismissTutorial()` from `onPointerDown`.
- Dismiss only when `triggerMatch(c, r)` fires AND `(c, r) === (tutorial.dst.c, tutorial.dst.r)` — i.e. the demonstrated match was completed.
- If the player drops an item into the demoed shelf without completing the match (e.g., wrong item, only 2 of 3): hand keeps cycling (they're on the right track).
- If the `tutorial.src` slot becomes invalid (item moved away, shelf sealed): silently re-run `pickTutorialSetup()` to pick a fresh demo target.

### 1.2 — Second hand after first match
- When `triggerMatch` completes the demoed shelf: instead of dismissing, call `advanceTutorialToSecondMove()`.
- `advanceTutorialToSecondMove()` re-runs `pickTutorialSetup()` excluding the just-completed shelf, prefers another `[X, X, null]` shelf.
- State machine resets to `approach`. Hand keeps cycling on this new demo.
- When the SECOND demo's match completes → permanent dismiss.
- If no valid second move (degenerate board state) → silent dismiss.

### 1.3 — Edge cases
- Player wins before completing demo → silent dismiss
- `tutorial.src` item moved away → re-pick silently (don't dismiss, don't flash)

---

## Group 2 — Cosy Home Sort extras

### 2.1 — Remove a column (mobile fit)
- **Current:** `MIN_CELL_W_PX = 75`, `CELL_ASPECT = 2.4`, portrait options up to `[5, 12]`.
- **Change:** Bump `MIN_CELL_W_PX` from `75` → `95`.
- **Effect:** On phones (~375px wide), a 5-col layout would need `(375-12)/5 ≈ 72px` cells — below 95 threshold, so `pickGrid` falls through to 4-col. Cells become ~91px wide, easier to grab.
- Larger screens (tablet, desktop) still get the dense 5-col where cells stay ≥95px.
- Preferable to deleting `[5,12]/[5,10]` entries — preserves layouts for bigger viewports.

### 2.2 — Performance investigation
- **Approach:** Measure first, fix specifically.
- Profile current FPS on 375×667 mobile emulator (DevTools performance panel, 10s sample with active gameplay).
- If <60fps sustained, identify cost sources in this priority:
  1. Per-cell wood-band gradient (4-band gradient × N cells × every frame = expensive on mobile GPU)
  2. Atlas decode/redraw (each item draws from a 2.5 MB atlas)
  3. Drag stretch matrix transform overhead
- If a fix is needed: probable solution = precompute per-cell wood background to an offscreen canvas once per resize, blit it in `drawShelfBack` instead of re-rendering gradients every frame.
- **No pre-commit to specific perf fix** — measure → diagnose → propose.

---

## Group 3 — Liquid Sort tutorial (summer_juice_bar, witch_potion, magic_sand)

**Current behavior:** Already has 2-state hand (`pointing-source` → `pointing-target`) for pink→objective pour. BUT: dismisses immediately if player taps any bottle other than the suggested source, or deselects, or pours anywhere.

**Changes:**

### 3.1 — Persistent hand in state `pointing-source`
- When player taps a bottle that's NOT `tutorial.bottle`: do NOT dismiss. Hand stays put.
- If suggested source becomes invalid (sealed, emptied): re-target via `tutorialUpdateTarget()`.
- Only advance to `pointing-target` when player selects the EXACT suggested source.

### 3.2 — Persistent hand in state `pointing-target`
- When player deselects: keep hand on objective.
- When player pours into a non-objective: keep hand on objective.
- When player pours into objective successfully → advance to **new 2-step tutorial for consolidation** (the "purple" demo).

### 3.3 — Second pour demo (consolidation between cups)
- **Source pick:** non-objective bottle with a non-goal color on top, where that same color appears on top of at least one OTHER non-objective bottle (so a valid pour exists).
- **Destination pick:** another non-objective bottle whose top matches source's top (or empty bottle with space).
- Hand cycles: point at source → player selects → point at destination → player pours → permanent dismiss.
- If no valid consolidation move exists → silent dismiss after the first pour completes.

**Interpretation note:** The PM's request "pour purple into the other tube" — I'm reading "tube" loosely as "bottle/cup" (since there's only one tube = objective in this engine). The demo teaches: "you can pour between regular cups too, not just into the objective." Flag this if my interpretation is wrong — alternative would be a second pink→objective pour, which would feel redundant.

---

## Build path decision

- **Direct code edits** to 6 files in the fork — `C:\Users\AugustoGehm\Fork\playables-blitz\playables\NewPlayables\...`
- No subskill: `/swap-playable-assets` is for asset swaps (this has none); `/create-2d-playable` is for scaffolding new builds (these exist).
- The fork's CLAUDE.md docs the engine. After changes, update its tutorial sections + add docs for Airport, Cozy Home, Magic Sand (currently defased).
- Backup of the fork's CLAUDE.md already in place: `CLAUDE.md.backup-2026-05-11`.

---

## QA approach

Mobile emulation via Chrome DevTools MCP (or manual local server):

1. Local `python -m http.server` pointing at `NewPlayables/`.
2. For each of the 6 playables, in Chrome at 375×667 DPR=2 touch:
   - Load, verify hand appears
   - Tap WRONG item/bottle → hand stays (currently fails)
   - Tap RIGHT item/bottle → hand advances
   - Complete demoed match/pour → hand re-targets to second demo
   - Complete second demo → hand dismisses permanently
3. Cosy Home specifically: capture FPS + confirm 4-col layout at 375px.
4. Landscape pass (667×375) on at least 1 tile sort + 1 liquid sort.
5. Console clean? No external network? Audio gated on first tap?

Iteration cap: 3 QA passes per playable. If a playable doesn't converge in 3, escalate to PM with diagnostic.

---

## Quality bar (per repo CLAUDE.md)

- Hand transitions are smooth (no popping when re-targeting)
- Second demo feels distinct (subtle pause between completion and second hand appearing, maybe brief celebration)
- No regressions in pour/match/drop physics
- No console errors, no external network requests
- 60 fps preserved (and ideally improved for cosy_home)
- Plan vs build: 100% (every change listed above lands)

---

## Out of scope

- Yarn untangle (`yarn_flow_proto.html`) — not mentioned by PM, not touching
- Pixel blast — not mentioned
- New assets, sounds, or visual changes
- Engine architecture changes (only tutorial state machine + cosy_home grid threshold)
