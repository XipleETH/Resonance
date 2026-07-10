# RESONANCE

**A song the whole subreddit writes, four tokens at a time.**

Every day a bot posts a fresh RESONANCE loop — its own musical key, its own colour palette, its own
24 sounds drawn from a library of 98. Everyone who scrolls past edits **the same 8-track × 16-step
loop**, live. You get **4 tokens**, they refill every 12 hours, and whatever you place is heard by
everyone else.

**No song ever closes.** Scroll back a week and that post is still there, still in its own key, and
still yours to edit. Nobody stages any of it. The community builds it, one token at a time.

▶ **Play it:** [r/Resonance_app](https://www.reddit.com/r/Resonance_app/) · Built for Reddit's
**Games with a Hook** hackathon.

---

## The hook

Most music toys are solitary and infinite. RESONANCE is neither.

- **It's collaborative by construction.** There is one loop per post, not one per player. You
  aren't making *your* track — you're arguing with strangers about *the* track, in four-token
  increments.
- **It's scarce.** Four tokens per 12 hours. Once a beat is saved, touching it again — editing it
  or deleting it — costs a token, whoever placed it. That single rule turns a sandbox into a
  negotiation: you have to *want* the change.
- **Nothing is ever finished.** Every post stays open forever, in the key it was born in. A song
  from last month is one scroll away and one token from changing.
- **It lives in the feed.** The post plays as you swipe past it. Tap once and you're inside it.

---

## How to play

### The board

- Rows are **sounds**; the 16 columns are the **steps** of the bar.
- Tap a pad to **place or remove** a beat.
- On melodic sounds the **column sets the note** (the day's pentatonic scale).
- The **`+`** on an empty row opens the sound picker — 24 of the 98 sounds are offered each day.

### Editing a beat (fullscreen)

Tap a beat to select it; its editor appears below.

| Control | What it does |
| --- | --- |
| **Vibrato / Wah** | The beat's effect. Picking one turns the first wave on. |
| **Wave button** | Cycles the wave: no wave → soft → medium → strong → fast. |
| **Disc** | ▲▼ volume · ◀▶ pitch. The hub reads out whichever axis you moved last. |
| **Ratchet** | The beat fires as 1–4 rapid hits inside its own step (♩ ♪♪ ♪³ ♬). |
| **↺** | Tap: flatten the beat. Hold: clear your whole draft. |

### Tokens

- You have **4 tokens**; they come back **every 12 hours**.
- **Adding** a beat costs **1** — and that token also buys you every tweak you make to it before
  you save.
- Once a beat is **saved**, **editing** it costs **1** and **deleting** it costs **1**, whether it
  was yours or a stranger's.
- **All** of a beat's settings (wave, pitch, ratchet, volume) count as a **single** token, so
  shaping a beat is one decision, not four.
- Choosing an empty row's sound is **free** — it rides along with that row's first beat.
- **SAVE** commits your draft to everyone. The button shows what it will cost before you press it.

The whole guide ships inside the app too: **⚙ → How it works**, in English and Spanish.

---

## Under the hood

Devvit Web + Phaser 4 + Tone.js. The web view blocks external CDNs, so every asset — font, icons,
sounds — is bundled or generated at runtime.

**Daily post.** A Devvit `scheduler` task fires at 12:00 UTC and creates the day's post. `seedJam`
derives that day's key, colour theme and 24-sound pool deterministically from the date, so the post
is reproducible and every old post keeps the palette it was born with.

**The loop is shared state.** Beats live in Redis as `${track}_${step} → "user;expression"`. Clients
hold an optimistic *draft*, `SAVE` sends the diff, and `realtime` fans the accepted diff back out to
everyone in the post. Rankings and profiles are Redis sorted sets.

**The synth is data-driven.** An `Instrument` describes a sound (oscillator, envelope, filter,
glide, octave…) and `buildSynth` maps it onto one of nine Tone.js archetypes, plus ~22 hand-written
pitch gestures (a chirp, a meow, a laser, a coin). That's how 98 distinct sounds fit in a few
hundred lines.

**Per-beat expression.** Every beat carries `{type, depth, rate, pitch, sub, dur, vol}` — its wave,
its shift along the day's scale, its ratchet, its length, its level. It encodes to a single string
and decodes with defaults, so beats saved by older versions still load and play.

### Three problems worth reading about

- **No drag gestures, anywhere.** Reddit's feed scrolls at the *native* layer, above the web view,
  and steals any drag mid-gesture. `touch-action`, `preventDefault`, pointer capture — none of them
  win. So the wave stopped being a slider and became a **button that cycles presets**, and the
  pitch/volume pad became a **four-wedge disc** you tap. The app has zero drags.
- **Two layouts, one scene.** In the feed the app is a compact preview (no editor, big pads); in
  fullscreen it's the whole studio. The scene picks by `getWebViewMode()`, and a height-aware unit
  keeps it honest on a wide-but-short feed card.
- **The canvas fills the modal.** Phaser's `FIT` mode goes stale when the Devvit modal resizes after
  load — black letterbox bars, or nothing at all. So we drive the size ourselves: `Scale.NONE`,
  backing = container × DPR, the canvas CSS forced to the container, tracked by a `ResizeObserver`
  and a per-frame check.

**Bilingual.** Every string, all 98 sound names and the in-app guide exist in Spanish and English
(⚙ → Language). Note names follow suit: `DO RE MI` or `C D E`.

---

## Run it

Node 22+.

```bash
npm install
npm run login      # connect the CLI to your Reddit account
npm run dev        # live playtest on your dev subreddit
```

| Command | |
| --- | --- |
| `npm run dev` | Live playtest on Reddit |
| `npm run build` | Build client + server |
| `npm run deploy` | Type-check, lint, upload a new version |
| `npm run launch` | Publish for review |
| `npm run type-check` | Type-check |

## Layout

```
src/
  client/            the web view (Phaser)
    scenes/Game.ts   the board, the beat editor, the overlays
    audio/           Tone.js engine — synth archetypes + pitch gestures
    icons.ts         every icon, hand-drawn as SVG, rasterized at boot
    i18n.ts          ES/EN strings, sound names, the in-app guide
  server/            Hono on Devvit — jam state, rankings, the daily post
  shared/            the sound library + the wire format both sides agree on
```

## Credits

Scaffolded from the [Devvit Phaser starter](https://github.com/phaserjs/template-vite-ts). Typeface:
[Gochi Hand](https://fonts.google.com/specimen/Gochi+Hand) (OFL). Every icon — and the RESONANCE
wordmark, whose letters are built out of musical notation — was drawn for this app.

Licensed under [BSD-3-Clause](./LICENSE).
