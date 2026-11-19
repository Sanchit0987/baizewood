// Downloads the CC0 Poly Haven assets listed below into public/assets/. Run: node tools/fetch-assets.mjs
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../public/assets/', import.meta.url));
const API = 'https://api.polyhaven.com/files/';
const RES = '1k';
const HDRIS = ['billiard_hall'];
const TEXTURES = ['rosewood_veneer1', 'herringbone_parquet', 'painted_plaster_wall', 'dark_wood'];
const TEXTURE_MAPS = { Diffuse: 'diff', nor_gl: 'nor', arm: 'arm' };
const MODELS = ['bar_chair_round_01', 'ArmChair_01', 'potted_plant_04', 'dartboard', 'fancy_picture_frame_01', 'side_table_tall_01', 'vintage_grandfather_clock_01'];

async function save(url, path) {
  try { await access(path); return; } catch { /* download */ }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  console.log('saved', path.replace(ROOT, ''));
}
const files = async (id) => (await fetch(API + id)).json();

for (const id of HDRIS) {
  try { await save((await files(id)).hdri[RES].hdr.url, join(ROOT, 'hdri', `${id}.hdr`)); } catch (e) { console.error('FAILED hdri', id, e.message); }
}
for (const id of TEXTURES) {
  try {
    const f = await files(id);
    for (const [map, short] of Object.entries(TEXTURE_MAPS)) await save(f[map][RES].jpg.url, join(ROOT, 'textures', `${id}_${short}.jpg`));
  } catch (e) { console.error('FAILED texture', id, e.message); }
}
for (const id of MODELS) {
  try {
    const g = (await files(id)).gltf[RES].gltf;
    await save(g.url, join(ROOT, 'models', id, `${id}.gltf`));
    for (const [rel, inc] of Object.entries(g.include ?? {})) await save(inc.url, join(ROOT, 'models', id, rel));
  } catch (e) { console.error('FAILED model', id, e.message); }
}
console.log('done');
