# Assets

Every third-party file in `public/assets/` is CC0 (public domain dedication) from
[Poly Haven](https://polyhaven.com/license). Everything else is generated at runtime.
Downloaded 2026-11-19 at 1k resolution with `npm run assets` (`tools/fetch-assets.mjs`,
Poly Haven API, files from `dl.polyhaven.org`). Authors are credited on each asset page.
No Quaternius models were needed.

## HDRI (`hdri/`)

| File | Used for | Source |
| --- | --- | --- |
| `billiard_hall.hdr` | Image-based lighting and reflections on balls, lacquer and brass | [polyhaven.com/a/billiard_hall](https://polyhaven.com/a/billiard_hall) |

## Textures (`textures/<name>_{diff,nor,arm}.jpg`)

| Name | Used for |
| --- | --- |
| [rosewood_veneer1](https://polyhaven.com/a/rosewood_veneer1) | Table rails (under a clear lacquer coat) |
| [dark_wood](https://polyhaven.com/a/dark_wood) | Table cabinet and legs, wall panelling |
| [herringbone_parquet](https://polyhaven.com/a/herringbone_parquet) | Floor |
| [painted_plaster_wall](https://polyhaven.com/a/painted_plaster_wall) | Upper walls (tinted green) |

## Models (`models/<name>/`, glTF + 1k textures)

| Name | Where |
| --- | --- |
| [bar_chair_round_01](https://polyhaven.com/a/bar_chair_round_01) | Two stools by the wall |
| [side_table_tall_01](https://polyhaven.com/a/side_table_tall_01), [potted_plant_04](https://polyhaven.com/a/potted_plant_04) | Table and plant between the stools |
| [ArmChair_01](https://polyhaven.com/a/ArmChair_01) | Two armchairs at the foot end |
| [vintage_grandfather_clock_01](https://polyhaven.com/a/vintage_grandfather_clock_01) | Head wall |
| [dartboard](https://polyhaven.com/a/dartboard) | Head wall |
| [fancy_picture_frame_01](https://polyhaven.com/a/fancy_picture_frame_01) | Two frames on the long wall |

## Procedural (original, made in code)

- The whole pool table: cloth bed with pocket holes, undercut cushions and jaw facings, rails
  scalloped round the pockets, brass pocket plates, pearl sights, cabinet and legs (`src/render/tablemesh.ts`).
- Balls and their painted skins (numbers, stripes, cue-ball training dots), the cue with ferrule,
  wrap and chalked tip, the three-shade pendant lamp, wall sconces, room shell and rug.
- Felt fibre albedo and normal map (`src/render/textures.ts`).
- All sound: cue strike, break crack, ball clicks, cushion thumps, pocket drops and rattles,
  chalk, UI and result phrases (`src/audio/`, Web Audio synthesis, no samples).
- Title, logo, opponent names and UI.
