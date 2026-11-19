# AGENTS.md — Baizewood

Guidance for agents and contributors working in this folder.

## What this is

**Baizewood** is an original 3D browser 8-ball pool game set in a lamplit back room: vs AI,
local 2-player, a practice table and a four-opponent tournament. Title, opponent names, UI art
and all sound are original. Third-party assets are CC0 only and logged in `ASSETS.md`.

## Stack

- Vite + strict TypeScript.
- Babylon.js (`@babylonjs/core`, WebGPU first, WebGL2 fallback) for rendering.
- Rapier (`@dimforge/rapier3d-compat`, WASM) for ball bodies and cushion/jaw collisions with CCD;
  exact swept ball-to-ball impacts on top (see the physics contract).
- Vitest for unit tests, Playwright for screenshot and play checks.
- Dev server on strict port **5185**. Node 22+ (the workspace bundles Node at
  `../tools/node/bin`; prepend it to `PATH` if `node` is missing).

## Commands

```sh
npm ci
npm run dev        # http://localhost:5185
npm run build      # tsc --noEmit + vite build
npm test           # vitest: physics, rules, AI, input, storage
npm run test:e2e   # Playwright screenshots + play checks (needs a GPU)
npm run assets     # re-download the CC0 assets
```

## Architecture (one-way dependencies, top to bottom)

| Folder | Role | May import |
| --- | --- | --- |
| `src/config/` | Every tunable number, colour and string table | nothing |
| `src/math/` | Plan-view vectors, seeded RNG | config |
| `src/table/` | Cushion and pocket geometry, outlines, rack | math, config |
| `src/physics/` | Rapier world, cloth friction model, cue strike | table |
| `src/sim/` | Shot runner and outcome tracker, aim-guide prediction | physics |
| `src/rules/` | 8-ball rules, match and tournament progress, stats storage (pure) | config |
| `src/ai/` | Shot candidates, position play, safeties, ball-in-hand, aim error | sim, rules |
| `src/input/` | Pointer, touch and keyboard gestures | config |
| `src/render/` | Babylon scene: table, balls, cue, room, lights, post FX, camera | table, config |
| `src/audio/` | Web Audio synthesis with spatial panners | config |
| `src/ui/` | DOM menus, HUD and shot controls | rules, config |
| `src/game/` | App state machine, turn flow (`frame.ts` is headless), robot hands, camera direction, loop | everything |

`src/ai/` and below must stay free of Babylon and DOM so whole frames can be played in Vitest.

## Hard rules

1. **No magic numbers.** Tunables live in `src/config/`. Only structural constants
   (0, 1, 2, 0.5, array indices, full turns) may appear in logic.
2. **Small modules.** Keep files focused and under ~220 lines; split first.
3. **Physics contract.** Fixed step (`PHYSICS.timestep`, 240 Hz). Rapier owns the ball bodies
   (CCD + soft CCD, locked to the table plane) and resolves every ball-to-cushion and
   ball-to-jaw contact against convex cushion colliders. Ball-to-ball contact is *not* left to
   Rapier: `physics/world.ts` splits each step at the exact swept time of impact and
   `physics/collide.ts` applies restitution plus Coulomb friction (throw and spin transfer).
   Rapier's own ball contacts were measured up to 15 degrees off the line of centres at break
   speed, which is unplayable for pool. The cloth (sliding friction, slide-to-roll, rolling
   resistance, sidespin decay) is integrated in `physics/cloth.ts` before each step. Pockets are
   capture circles behind the jaws. Balls never leave the plane: no jump or masse shots.
4. **Rules are pure.** `rules/eightball.ts` maps (state, shot outcome) to the next state with
   no physics or DOM. Every rule change needs a unit test.
5. **AI plays by simulation.** Candidates come from geometry; the planner runs them through a
   private `PoolWorld`. Never give the AI information the player cannot see.
6. **Assets.** CC0 only, recorded in `ASSETS.md` with source. No copyrighted names, logos or audio.
7. **Honest verification.** Report what was actually run and measured.

## Testing notes

- `tests/unit/` runs whole frames headlessly (`game/frame.ts` + `ai/planner.ts`); the AI file takes ~40 s.
- `tests/e2e/` drives the real page. URL switches: `?mode=ai|local|practice|tournament&difficulty=&quality=&renderer=webgl2&seed=&view=cue|top|free&mute=1`.
  `window.baizewood = { app, view }` is exposed for tests; `match.shootNow(shot)` skips the stroke animation.
- `perf.spec.ts` lifts the browser frame cap and prints frame rates. They swing widely with machine load; treat them as informational.
