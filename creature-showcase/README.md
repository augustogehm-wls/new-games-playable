# Creature Showcase

A small, self-contained HTML page that shows one rescue-creature in two
looping states — **sad (caged)** and **happy (rescued)** — and lets you toggle
between them with a button. It exists as a **visual handoff document**: a way
for the art side to validate how each creature reads and animates, and for the
gameplay engineer to see exactly which asset files to use and how.

> There are **no cage bars** anywhere. Bars are the gameplay team's
> responsibility — this showcase only ever shows the isolated creature.

---

## Run it

Just open **`index.html`** in any browser (double-click works — no server, no
build step). It uses plain `<img>` tags and a classic script, so it runs fine
from `file://`.

---

## Folder structure

```
creature-showcase/
├── index.html              # markup (stage, creature, arrows, button, praise)
├── styles.css              # all visuals + the sad-state CSS animations
├── main.js                 # state machine + creature roster (edit to add creatures)
├── README.md               # this file
└── assets/
    ├── creatures/
    │   └── dragon_blue/                  # one folder per creature
    │       ├── source.png                # <-- YOU drop the base art here
    │       ├── creature_sad.png          # generated: transparent sad base
    │       ├── creature_sad_blink.png    # generated: eyes-closed blink frame
    │       ├── creature_happy.png        # generated: happy "mid" pose (one arm up)
    │       ├── creature_happy_crouch.png # generated: crouch / anticipation pose
    │       └── creature_happy_apex.png   # generated: arms-up celebration pose
    └── dragon/
        ├── dragon_happy.png              # win-endcard dragon (reuses the apex pose)
        ├── dragon_sad.png                # fail-endcard dragon (reuses the sad base)
        └── dragon_sad_blink.png          # fail-endcard blink frame
```

(`source.png` plus the raw scratch files used to build the assets are removed
from the shipped folder — only the five sprites above are needed at runtime.)

---

## Where to put the base image

Drop the creature's base art at:

```
assets/creatures/<creature_id>/source.png
```

- **No bars / no cage.** Just the isolated creature.
- A clean or solid background is ideal (it gets removed automatically).
- A sad / neutral sitting pose is the best base — the happy poses are generated
  from it.

---

## Which files get generated (and how)

All sprites are derived from `source.png` and kept transparent so they
composite over any background. The pipeline is a **hybrid** designed to stay
lightweight — generated frames only where they're needed, everything else done
in code:

| File | What it is | How it's made |
|------|------------|---------------|
| `creature_sad.png` | Transparent sad base | Background removed from `source.png` (rembg, `isnet-anime`) |
| `creature_sad_blink.png` | Same sprite, eyes gently closed | AI image **edit** of the original — closes the eyes only, so it's a perfect frame match for a seamless blink (Gemini 3 Pro Image Edit) |
| `creature_happy.png` | Happy "mid" pose (smiling, one arm up) | AI image **edit** of the original (happy expression + raised arm), bg removed |
| `creature_happy_crouch.png` | Crouch / anticipation pose | AI image **edit** (arms down, ready to spring), bg removed |
| `creature_happy_apex.png` | Arms-up celebration pose | AI image **edit** (both arms up, big smile), bg removed |

**Why edits + code instead of a video:** we first tried image-to-video to get
the jump motion, but the video model re-framed and zoomed the character (it
cropped the legs/feet), so the frames couldn't show a real jump or match the
sad framing. Editing full-body poses keeps the whole creature, a consistent
frame, and perfect alignment. The motion itself (jump arc, squash/stretch,
breathing, blink timing) is done in code, which is essentially free and loops
perfectly. All sprites in a state are normalized to the same canvas so swaps
never jitter.

---

## How the two states animate

- **SAD loop:** `creature_sad.png` shown continuously with a subtle CSS
  *breathing* scale + a tiny nervous *tremble*. Every 2.5–5 s it briefly swaps
  to `creature_sad_blink.png` (≈140 ms) for a slow, sad blink.
- **HAPPY loop:** a **jump-for-joy** driven entirely from `main.js`
  (`requestAnimationFrame`). A parabolic arc lifts the creature
  (`translateY`) with squash on the ground and stretch in the air, while a
  grounded contact shadow shrinks and fades. The displayed pose is chosen from
  the phase of the jump: **crouch** at the bottom, **mid** while rising/falling,
  **apex** (arms up) at the top. A praise word
  (`Nice! / Great! / Awesome! / Perfect!`) pops once on entry with an energy
  burst.

---

## Three pages (creature / win / fail)

The main creature screen has two labelled buttons at the bottom:

- **WIN** (right) → opens the victory endcard.
- **FAIL** (left) → opens the defeat endcard.

Each popup has a **return arrow** (bottom-left, `‹`) back to the creature view.
Navigation is a tiny pager in `main.js` (`goToPage("creature" | "win" | "fail")`);
opening a popup freezes the creature behind it (the dimmed, blurred "gameplay").

## Win endcard (victory popup)

The **WIN** button opens a victory endcard popup (Royal Match / Toon Blast
style) that celebrates the rescue and pushes the install. The **return arrow**
(bottom-left) goes back to the creature view.

- **Behind:** the creature scene stays in place, darkened + blurred
  (`backdrop-filter`), so it reads as a popup over paused gameplay.
- **Card:** premium rounded card with gold/blue glow; `NICE!` headline (bounce
  in, then idle pulse); the rescued dragon (`assets/dragon/dragon_happy.png`)
  with sunburst rays and a living idle loop (bounce + sway + breathe); a green
  `RESCUE MORE FRIENDS!` CTA (pulse + shine sweep); a few slow floating sparkles.
- **Entrance (~1s):** backdrop fade → card slides up + scales → `NICE!` bounces →
  dragon hops → CTA appears. Re-runs every time you open the page.
- **All CSS/transform/opacity** — no libraries, no canvas, GPU-friendly.

**CTA wiring (for the engineer):** clicking the CTA calls `onInstallClick()` in
`main.js`. It tries `mraid.open(STORE_URL)` if MRAID is present, otherwise logs
and shows a placeholder toast. Replace `STORE_URL` (top of `main.js`) and/or the
body of `onInstallClick()` with the real store link / network call.

## Fail endcard (defeat popup)

The **FAIL** button opens a gentle defeat popup — empathetic, not punishing:

- **Magical night-sky card:** purple/violet gradient with a lilac glow border.
- **`ALMOST!`** headline — a generated glossy 3D bubble logo (`assets/ui/almost.png`),
  wobbles in; overhangs the card top (the card is not clipped).
- **Soft clouds** drifting behind the dragon + a few twinkling night-sky stars.
- **Sad dragon** (`assets/dragon/dragon_sad.png`) centered with a soft glow,
  a slow sad-breathing loop and the occasional blink (`dragon_sad_blink.png`).
- A small **thought balloon** with a **broken heart** that wobbles gently.
- Secondary line **"Your friend still needs your help!"**.
- A green **`SAVE THE DRAGON`** CTA (gold frame, pulse + shine) → `onInstallClick()`.
- A few soft **night-sky stars** that twinkle in, rise, and fade (not confetti).

**SFX hooks:** `main.js` has comments marking where to play the failure bonk,
popup whoosh, headline bloop, broken-heart tink, retry click, and install
sparkle — the showcase ships silent; the engineer wires the actual sounds.

## Add or swap a creature

1. Create `assets/creatures/<new_id>/` and drop its `source.png`.
2. Generate the five sprites (same pipeline as above): background-remove the
   base for `creature_sad.png`, then image-edit the original for the blink and
   the three happy poses. Normalize each state's sprites to a common canvas so
   they align.
3. Add one entry to the `CREATURES` array in **`main.js`**:

```js
{
  id: "fox_red",
  name: "Red Fox",
  base: "assets/creatures/fox_red/",
  sad:   { base: "creature_sad.png", blink: "creature_sad_blink.png" },
  happy: {
    poses: {
      crouch: "creature_happy_crouch.png",
      mid: "creature_happy.png",
      apex: "creature_happy_apex.png",
    },
    periodMs: 720,    // one full jump cycle
    jumpFactor: 0.2,  // peak lift as a fraction of the creature's height
  },
}
```

That's all — the UI, the left/right arrows, and the animation engine are
generic. With more than one creature the arrows automatically become active
(they're dimmed at the ends of the roster).

---

## How the gameplay engineer uses these files

The showcase is a **reference for behaviour**, but the asset files are
production-usable as-is (transparent PNGs):

- **Idle / caged creature:** use `creature_sad.png` as the sprite and flash
  `creature_sad_blink.png` on a timer for the blink. Breathing/tremble is a
  simple transform tween — see the `@keyframes breathe` values in `styles.css`.
- **Rescue celebration:** reproduce the jump by tweening vertical position +
  squash/stretch (see `startJump()` in `main.js` for the exact math) and
  swapping the three happy poses by jump phase. Or, if your engine prefers, the
  three poses can be played as a simple flipbook.
- **Timing reference (calibrated values):** blink ≈140 ms, blink interval
  1.3–5.7 s, breathe ≈1.25 s, shiver every ≈7.3 s, jump period ≈600 ms, jump
  lift ≈21 % of creature height, squash/stretch ≈8 %, praise pop ≈1.4 s — all in
  the `TUNING` object in `main.js` (timings/intensity) and `styles.css` (praise).

Everything is isolated per creature, so assets and timings can be lifted one
creature at a time without touching the rest.
