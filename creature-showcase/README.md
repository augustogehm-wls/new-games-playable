# Creature Showcase — v2 (fake playable)

A small, self-contained HTML mini-experience that **looks and feels like the real
casual-puzzle "rescue" gameplay** without shipping any real puzzle logic. A kawaii
blue dragon sits trapped behind a cage in the middle of an arrow maze; the player
taps **SOLVE!** (or follows the hint), the cage slides open with a magical burst,
the dragon jumps for joy, and a **WIN** endcard pushes the install. Tapping the
wrong arrow costs a life; running out of lives shows the **FAIL** endcard.

It is intentionally a **scripted fake** — there is no pathfinding and no real
solution. It exists to validate the gameplay *feel*, the UX chrome, and the
character presentation before the real game logic is wired in.

> **v1 is preserved** under `backup/v1_current_showcase/` (the older "menu
> showcase" that only toggled sad ↔ happy). Restore it by copying those files
> back over the project root.

---

## Run it

Open **`index.html`** in any browser (double-click works — no server, no build
step). Plain `<img>` tags + a classic script, so it runs fine from `file://`.

---

## The fake puzzle flow

It's an **unblock puzzle** (Bus Jam / Parking Jam style): independent arrow
pieces congest around the cage and block one another; the player removes them in
the correct order to free the dragon.

1. **LOCKED (start):** the sad dragon breathes/blinks behind a rounded navy
   **cage**, surrounded by ~13 **independent arrow pieces** (straight, short,
   long, L-corner, curved) — these are removable game pieces, NOT connected
   pipes. Full mobile HUD on top, instruction + **SOLVE!** at the bottom.
2. **Hint (optional):** tapping the bulb points a **tutorial hand** at the next
   correct piece (which already glows gold).
3. **Correct tap:** tapping the next-in-order piece slides it out in its arrow
   direction with a sparkle; the next piece then highlights.
4. **Wrong tap:** tapping any other (still-blocked) piece → it shakes + red
   flash, one **heart breaks** (shake → red flash → shatter → shards →
   shockwave → micro screen-shake), with a short anti-spam cooldown. At
   **0 hearts** the **FAIL** endcard appears.
5. **Solve:** **SOLVE!** auto-plays the remaining correct pieces one-by-one
   (~230 ms apart) — it shows the solution, it is NOT an instant win.
6. **Release:** once the last required piece is gone, the cage shakes, the bars
   slide/fade + magic burst, remaining decoy pieces fade, the dragon jumps for
   joy with a praise pop, then the **WIN** endcard slides in.

Everything is wired in `main.js`. The win/fail popups are the same endcards from
v1 (`goToPage("creature" | "win" | "fail")`).

---

## Folder structure

```
creature-showcase/
├── index.html              # HUD + puzzle area + bottom bar + settings popup + endcards
├── styles.css              # all visuals + gameplay/heart/cage/hint/settings animations
├── main.js                 # gameplay state + creature roster + endcards
├── README.md               # this file
├── backup/
│   └── v1_current_showcase/   # frozen v1 (restore point) — do not edit
└── assets/
    ├── creatures/dragon_blue/   # gameplay dragon sprites (sad/blink/happy poses)
    ├── dragon/                  # endcard dragon sprites (happy/sad/blink)
    ├── ui/                      # almost.png (FAIL headline logo)
    ├── hands/                   # tutorial_hand.png (hint hand)
    └── particles/               # reserved — current particles are CSS, this is for future PNGs
```

The maze arrows, cage bars, hearts, gear, level pill, and all HUD buttons are
**drawn in CSS/SVG** — no image files, which keeps things crisp and tiny.

---

## How to swap the dragon

The character is data-driven by the `CREATURES` array in `main.js`. To swap or
add a creature:

1. Create `assets/creatures/<new_id>/` and drop its `source.png` (isolated
   creature, clean/solid background — it gets removed automatically).
2. Generate the five transparent sprites (same hybrid pipeline as v1, see
   *Asset pipeline* below): `creature_sad.png`, `creature_sad_blink.png`,
   `creature_happy.png`, `creature_happy_crouch.png`, `creature_happy_apex.png`.
   Normalize each state's sprites to a common canvas so swaps don't jitter.
3. Edit the `CREATURES` entry in `main.js` (point `base` at the new folder).

The endcards use the separate sprites in `assets/dragon/` (`dragon_happy.png`,
`dragon_sad.png`, `dragon_sad_blink.png`) — swap those too for a new creature.

The cage, maze, HUD, and animation engine are all generic and need no changes.

---

## How to configure the puzzle & hint

The puzzle is data-driven in `main.js`:

- **The pieces** live in the `PIECES` array. Each entry is one independent arrow:
  `{ id, shape, w, cx, cy, rot, slide, order?, z? }` —
  `shape` is `straight | short | long | corner | curve`,
  `w` the width as a % of the square field, `cx/cy` the centre (% of field),
  `rot` the orientation, `slide` the exit direction (`left/right/up/down`),
  `order` the position in the correct removal sequence (omit it for a decoy
  blocker), `z` an optional layer. `SEQUENCE_LEN` is derived from how many
  pieces have an `order`.
- **The correct order** is just the `order` numbers: only the piece whose
  `order === currentStep` is removable; `highlightNext()` glows it. Reorder or
  re-`order` the pieces to change the solution.
- **Piece visuals** come from `pieceSVG(shape)` (navy body + gloss + arrow head);
  add a shape there to introduce a new piece type.
- **The hand:** `positionHandOver()` places `assets/hands/tutorial_hand.png`
  over the next correct piece; `#tutorHand.show` CSS does the 1.2 s tap loop.
- **Correct tap** → `correctTap()` (slide out + advance); **wrong tap** →
  `wrongTap()` (shake + `loseHeart()` + cooldown); **SOLVE** auto-plays the rest.

---

## How to replace assets

- **Dragon sprites:** drop new PNGs into `assets/creatures/<id>/` and
  `assets/dragon/` (keep the same filenames or update the `CREATURES` entry).
- **Tutorial hand:** replace `assets/hands/tutorial_hand.png`.
- **FAIL headline logo:** replace `assets/ui/almost.png`.
- **Arrows / cage / hearts / HUD icons:** these are inline SVG in `index.html`
  (HUD icons, hearts via `HEART_SVG`, arrows via `ARROW_SVG` in `main.js`) and
  CSS shapes — edit the markup/CSS, no files to swap.
- **Colors:** all palette tokens live in `:root` at the top of `styles.css`
  (`--navy`, `--heart-full`, `--bg-top/bottom`, `--btn-*`, etc.).

---

## Sound & haptics (placeholders)

- **SFX:** `main.js` has a central `sfx(name)` hook with comments marking every
  trigger point. The showcase ships silent; the engineer wires real audio there
  (gated to play only after the first user tap, per ad-network rules). Names:
  `button_click`, `soft_pop`, `magical_sparkle`, `solve_success`, `heart_break`,
  `popup_open`, `dragon_happy`, `dragon_sad`, `toggle_switch`.
- **Haptics:** `haptic("light" | "medium" | "success")` calls
  `navigator.vibrate` (respects the Settings → Haptics toggle and device
  support). Light = taps/arrows/toggles, medium = solve/heart-loss/popup,
  success = rescue.
- **Settings popup:** the gear opens toggles for Music / SFX / Haptics; values
  live in the `settings` object in `main.js`.

---

## How to integrate the real gameplay later

This build is the *shell*. To turn it into real gameplay:

1. **Replace the scripted pieces** — swap the `PIECES` data + `buildPuzzle()` for
   real level data, and replace the `order`-based check in `tapPiece()` with real
   blocking logic (a piece is removable only when nothing physically blocks it).
2. **Replace `solve()`** — instead of auto-playing the scripted order, drive it
   from your real solver. Keep `onSequenceComplete()` (cage release + `showHappy()`
   + `goToPage("win")`) as the reward when the level is actually solved.
3. **Wire `loseHeart()`** to your real fail condition (invalid move / timer)
   instead of the wrong-piece tap. The break animation is reusable as-is.
4. **Wire `onInstallClick()`** to the real store link / `mraid.open(STORE_URL)`
   (top of `main.js`). The endcards' CTAs already call it.
5. **Plug in audio** at the `sfx()` hook and keep the haptic calls.

The character rendering (sad idle, jump-for-joy, praise pop) and the endcards are
production-usable as-is.

---

## Asset pipeline (how the dragon sprites were made)

All sprites derive from `source.png`, kept transparent so they composite over
any background. Hybrid pipeline — generated frames only where needed, motion in
code:

| File | What it is | How it's made |
|------|------------|---------------|
| `creature_sad.png` | Transparent sad base | Background removed from `source.png` (rembg, `isnet-anime`) |
| `creature_sad_blink.png` | Eyes gently closed | AI image **edit** of the original — closes eyes only (Gemini 3 Pro Image Edit) |
| `creature_happy.png` | Happy "mid" pose | AI image **edit** (happy + one arm up), bg removed |
| `creature_happy_crouch.png` | Crouch / anticipation | AI image **edit** (arms down, ready to spring), bg removed |
| `creature_happy_apex.png` | Arms-up celebration | AI image **edit** (both arms up), bg removed |

**Why edits + code, not video:** image-to-video re-framed/zoomed the character
(cropped legs/feet), breaking the jump and the framing match. Editing full-body
poses keeps the whole creature and a consistent frame; the motion (jump arc,
squash/stretch, breathing, blink) is done in code — free, and it loops perfectly.

**Timing reference (calibrated, in `TUNING` in `main.js`):** blink ≈140 ms,
blink interval 1.3–5.7 s, breathe ≈1.25 s, shiver every ≈7.3 s, jump period
≈600 ms, jump lift ≈21 % of height, squash/stretch ≈8 %.
