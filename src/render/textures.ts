import { DynamicTexture, RawTexture, Texture, type Scene } from '@babylonjs/core';
import { ballColour } from '../config/ballcolours';
import { BALL_ART, LOOK } from '../config/graphics';
import { BALL } from '../config/table';
import { createRng } from '../math/random';

const ASSET_ROOT = `${import.meta.env.BASE_URL}assets/`;
export const assetUrl = (path: string): string => ASSET_ROOT + path;

const BYTE = 255;
const RGBA = 4;
type Ctx = CanvasRenderingContext2D;

export interface TextureSet { albedo: Texture; normal: Texture; arm: Texture }

function load(scene: Scene, file: string, tiling: number, anisotropy: number): Texture {
  const t = new Texture(assetUrl(`textures/${file}`), scene, false, false);
  t.uScale = tiling;
  t.vScale = tiling;
  t.anisotropicFilteringLevel = anisotropy;
  return t;
}

/** Loads the diffuse, normal and AO/roughness/metal maps of a Poly Haven texture set. */
export const loadSet = (scene: Scene, set: string, tiling: number, anisotropy: number): TextureSet => ({
  albedo: load(scene, `${set}_diff.jpg`, tiling, anisotropy),
  normal: load(scene, `${set}_nor.jpg`, tiling, anisotropy),
  arm: load(scene, `${set}_arm.jpg`, tiling, anisotropy),
});

/** Tileable value noise on a size x size grid with separate cell counts per axis, 0..1. */
function tileNoise(size: number, cellsX: number, cellsY: number, seed: number): Float32Array {
  const rng = createRng(seed);
  const lattice = Float32Array.from({ length: cellsX * cellsY }, () => rng.next());
  const at = (x: number, y: number): number => lattice[(y % cellsY) * cellsX + (x % cellsX)];
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cellsX;
      const fy = (y / size) * cellsY;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = smooth(fx - ix);
      const ty = smooth(fy - iy);
      const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
      const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
      out[y * size + x] = top + (bottom - top) * ty;
    }
  }
  return out;
}

/** Worsted cloth: short fibres lying along the nap, crossed by a finer weave. */
function feltHeight(size: number, seed: number): Float32Array {
  const [along, across] = LOOK.feltCells;
  const fibres = tileNoise(size, along, across, seed);
  const weave = tileNoise(size, across, along, seed + 1);
  const grain = tileNoise(size, along, along, seed + 2);
  return fibres.map((v, i) => v * 0.5 + weave[i] * 0.2 + grain[i] * 0.3);
}

function raw(scene: Scene, data: Uint8Array, size: number, anisotropy: number): RawTexture {
  const t = RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  t.wrapU = Texture.WRAP_ADDRESSMODE;
  t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = anisotropy;
  return t;
}

/** Greyscale variation of the cloth colour and the matching fibre normal map. */
export function feltTextures(scene: Scene, anisotropy: number): { albedo: RawTexture; normal: RawTexture } {
  const size = LOOK.feltTextureSize;
  const h = feltHeight(size, BALL_ART.seed);
  const albedo = new Uint8Array(size * size * RGBA);
  const normal = new Uint8Array(size * size * RGBA);
  const at = (x: number, y: number): number => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * RGBA;
      const v = Math.round(BYTE * (1 - LOOK.feltNoise + LOOK.feltNoise * at(x, y)));
      albedo.set([v, v, v, BYTE], i);
      const dx = (at(x + 1, y) - at(x - 1, y)) * LOOK.feltBump * size;
      const dy = (at(x, y + 1) - at(x, y - 1)) * LOOK.feltBump * size;
      const len = Math.hypot(dx, dy, size);
      const pack = (c: number): number => Math.round(((c / len) * 0.5 + 0.5) * BYTE);
      normal.set([pack(-dx), pack(-dy), pack(size), BYTE], i);
    }
  }
  return { albedo: raw(scene, albedo, size, anisotropy), normal: raw(scene, normal, size, anisotropy) };
}

function canvasTexture(scene: Scene, name: string, width: number, height: number, draw: (ctx: Ctx) => void): DynamicTexture {
  const tex = new DynamicTexture(name, { width, height }, scene, true);
  draw(tex.getContext() as unknown as Ctx);
  tex.update();
  return tex;
}

const hexRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const smoothstep = (lo: number, hi: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/** Directions of the six training dots on the cue ball: the axes of a cube. */
const DOTS: readonly (readonly [number, number, number])[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/**
 * Equirectangular skin of a ball, painted per pixel on the sphere so discs and stripes are
 * undistorted: white number discs on the +z and -z points, a colour band round the equator for stripes.
 */
export function ballTexture(scene: Scene, id: number): DynamicTexture {
  const w = LOOK.ballTextureSize;
  const h = w / 2;
  const colour = hexRgb(ballColour(id));
  const white = hexRgb(LOOK.cueWhite);
  const dot = hexRgb(BALL_ART.dotColour);
  const striped = id > BALL.eight;
  return canvasTexture(scene, `ball${id}`, w, h, (ctx) => {
    const image = ctx.createImageData(w, h);
    for (let py = 0; py < h; py++) {
      const lat = (0.5 - (py + 0.5) / h) * Math.PI;
      for (let px = 0; px < w; px++) {
        const lon = ((px + 0.5) / w) * Math.PI * 2;
        const d: [number, number, number] = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
        let whiteness = 0;
        let rgb = colour;
        if (id === BALL.cue) {
          const nearest = Math.max(...DOTS.map((a) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2]));
          whiteness = smoothstep(BALL_ART.dot - BALL_ART.edge, BALL_ART.dot + BALL_ART.edge, Math.acos(Math.min(1, nearest)));
          rgb = dot;
        } else {
          const disc = 1 - smoothstep(BALL_ART.disc - BALL_ART.edge, BALL_ART.disc + BALL_ART.edge, Math.acos(Math.min(1, Math.abs(d[2]))));
          const band = striped ? smoothstep(BALL_ART.stripe - BALL_ART.edge, BALL_ART.stripe + BALL_ART.edge, Math.abs(lat)) : 0;
          whiteness = Math.max(disc, band);
        }
        const i = (py * w + px) * RGBA;
        for (let c = 0; c < 3; c++) image.data[i + c] = rgb[c] + (white[c] - rgb[c]) * whiteness;
        image.data[i + 3] = BYTE;
      }
    }
    ctx.putImageData(image, 0, 0);
    if (id === BALL.cue) return;
    ctx.fillStyle = BALL_ART.numeralColour;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = h * BALL_ART.numeral * (id > BALL.eight + 1 ? 0.86 : 1);
    ctx.font = `800 ${size}px 'Avenir Next', 'Helvetica Neue', Arial, sans-serif`;
    for (const u of [0.25, 0.75]) {
      ctx.fillText(String(id), w * u, h / 2 + size * 0.04);
      // 6 and 9 are underlined so they cannot be confused.
      if (id === 6 || id === 9) ctx.fillRect(w * u - size * 0.28, h / 2 + size * 0.46, size * 0.56, size * 0.08);
    }
  });
}

/** A worn patterned rug: border bands, a field colour and a lattice of small medallions. */
export function rugTexture(scene: Scene): DynamicTexture {
  const s = LOOK.rugTextureSize;
  const [field, band, gold, accent] = LOOK.rug;
  const rng = createRng(BALL_ART.seed + 1);
  return canvasTexture(scene, 'rug', s, s, (ctx) => {
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, s, s);
    const inset = (k: number, colour: string): void => {
      ctx.fillStyle = colour;
      ctx.fillRect(s * k, s * k, s * (1 - 2 * k), s * (1 - 2 * k));
    };
    inset(0.03, gold);
    inset(0.04, accent);
    inset(0.085, gold);
    inset(0.093, field);
    const cells = 9;
    const step = (s * (1 - 2 * 0.12)) / cells;
    for (let y = 0; y <= cells; y++) {
      for (let x = 0; x <= cells; x++) {
        const cx = s * 0.12 + x * step;
        const cy = s * 0.12 + y * step;
        ctx.fillStyle = (x + y) % 2 === 0 ? band : accent;
        ctx.beginPath();
        ctx.moveTo(cx, cy - step * 0.3); ctx.lineTo(cx + step * 0.3, cy); ctx.lineTo(cx, cy + step * 0.3); ctx.lineTo(cx - step * 0.3, cy);
        ctx.fill();
        ctx.fillStyle = gold;
        ctx.fillRect(cx - step * 0.05, cy - step * 0.05, step * 0.1, step * 0.1);
      }
    }
    // Wear: faint speckle so the rug does not look printed.
    for (let i = 0; i < s * 12; i++) {
      ctx.fillStyle = `rgba(${rng.chance(0.5) ? '0,0,0' : '255,240,220'},${rng.range(0.02, 0.07)})`;
      ctx.fillRect(rng.next() * s, rng.next() * s, rng.range(1, 3), rng.range(1, 3));
    }
  });
}
