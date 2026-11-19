# Baizewood

An original 3D 8-ball pool game for the browser: one table under a pendant lamp, ball physics
with spin, three AI levels and a four-opponent cup. Vite + strict TypeScript + Babylon.js
(WebGPU, WebGL2 fallback) + Rapier (WASM) + Vitest + Playwright.

```sh
npm ci
npm run dev        # http://localhost:5185
npm run build
npm test           # 65 unit tests: physics, rules, AI
npm run test:e2e   # 19 browser checks with screenshots in tests/e2e/screenshots/
```

## How to play

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Aim | Drag on the table (Cue view turns the cue; Top view points it at your finger) | Left / Right, A / D |
| Fine aim | Slide the strip under the table | Shift + Left / Right |
| Power and shoot | Pull the brass handle and let go (a tiny pull cancels) | Hold Space, release |
| Spin | Drag the dot on the cue-ball pad: up follow, down draw, sides english; double-click to centre | I K J L, O to centre |
| Ball in hand | Drag the cue ball | |
| Call the 8 | Tap a pocket ring | |
| Camera | View button: Cue, Top, Free (drag to orbit); wheel or pinch to zoom | C |
| Pause / mute | Buttons at the top | P or Esc / M |

Rules: break from behind the head string; the table is open until the first legal pot after the
break decides solids and stripes; hit your own group first and drive a ball to a rail or pocket;
fouls give the opponent ball in hand; clear your group, then sink the 8 in the called pocket.
Sinking the 8 early, with a foul, or in the wrong pocket loses the frame. The 8 on the break is re-spotted.

Modes: **Play the house** (Easy: full aim guide; Normal: short guide; Hard: none),
**Two players**, **Practice table** (no rules, cue ball always free), and the **Lamplight Cup**
(Pip Marlow, Dorian Vale, Mirela Stone, The Lamplighter). Stats, settings and cup progress are
kept in localStorage.

See `AGENTS.md` for the architecture and rules of the codebase, and `ASSETS.md` for asset credits.

## Known gaps

- Sound is synthesised and its triggering is tested, but nobody has listened to it.
- Touch was exercised with synthetic pointer events only, not on a phone.
- Frame rate was measured on a busy Apple M2 and varied between runs; 60 FPS on Medium is not confirmed.
- Balls stay on the table plane: no jump or masse shots, and no ball leaving the table.
- AI strength and cushion/cloth constants are plausible but not tuned against real-table data.
