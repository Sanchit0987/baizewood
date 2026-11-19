import earcut from 'earcut';
import { Mesh, VertexData, type Material, type Scene } from '@babylonjs/core';
import type { Vec2 } from '../math/vec2';

export type P3 = readonly [number, number, number];

const XYZ = 3;
const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: P3, b: P3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: P3): P3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Small mesh builder. Triangles are wound automatically so that their front agrees with the
 * vertex normals, which removes any need to think about winding order when adding faces.
 */
export class Geo {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];

  vertex(p: P3, n: P3, u: number, v: number): number {
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    this.uvs.push(u, v);
    return this.positions.length / XYZ - 1;
  }

  private at(source: number[], i: number): P3 {
    return [source[i * XYZ], source[i * XYZ + 1], source[i * XYZ + 2]];
  }

  tri(a: number, b: number, c: number): void {
    const pa = this.at(this.positions, a);
    const face = cross(sub(this.at(this.positions, b), pa), sub(this.at(this.positions, c), pa));
    const na = this.at(this.normals, a);
    const nb = this.at(this.normals, b);
    const nc = this.at(this.normals, c);
    const want: P3 = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
    if (dot(face, want) >= 0) this.indices.push(a, b, c);
    else this.indices.push(a, c, b);
  }

  /** Flat quad p0-p1-p2-p3 (in order round the edge) facing roughly along `toward`. */
  quad(p0: P3, p1: P3, p2: P3, p3: P3, toward: P3, uv: readonly [number, number, number, number] = [0, 0, 1, 1]): void {
    let n = unit(cross(sub(p1, p0), sub(p3, p0)));
    if (dot(n, toward) < 0) n = [-n[0], -n[1], -n[2]];
    const [u0, v0, u1, v1] = uv;
    const a = this.vertex(p0, n, u0, v0);
    const b = this.vertex(p1, n, u1, v0);
    const c = this.vertex(p2, n, u1, v1);
    const d = this.vertex(p3, n, u0, v1);
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** Horizontal polygon (with optional holes) at height y, facing up or down. `uv` maps a plan point to texture coordinates. */
  cap(outline: readonly Vec2[], y: number, up: boolean, uv: (p: Vec2) => readonly [number, number], holes: readonly (readonly Vec2[])[] = []): void {
    const rings = [outline, ...holes];
    const flat: number[] = [];
    const holeStarts: number[] = [];
    const base = this.positions.length / XYZ;
    for (const [i, ring] of rings.entries()) {
      if (i > 0) holeStarts.push(flat.length / 2);
      for (const p of ring) {
        flat.push(p.x, p.z);
        const [u, v] = uv(p);
        this.vertex([p.x, y, p.z], [0, up ? 1 : -1, 0], u, v);
      }
    }
    const tris = earcut(flat, holeStarts);
    for (let i = 0; i < tris.length; i += XYZ) this.tri(base + tris[i], base + tris[i + 1], base + tris[i + 2]);
  }

  /**
   * Vertical wall along a plan-view path between two heights. `outward` says which side it faces
   * relative to the centre of the path's loop; smooth walls share normals between segments.
   */
  wall(path: readonly Vec2[], y0: number, y1: number, options: { closed: boolean; outward: boolean; smooth: boolean; tiling: number; centre?: Vec2 }): void {
    const n = path.length;
    const centre = options.centre ?? { x: path.reduce((s, p) => s + p.x, 0) / n, z: path.reduce((s, p) => s + p.z, 0) / n };
    const segments = options.closed ? n : n - 1;
    const segNormal = (i: number): P3 => {
      const a = path[i % n];
      const b = path[(i + 1) % n];
      let nx = b.z - a.z;
      let nz = -(b.x - a.x);
      const mid = { x: (a.x + b.x) / 2 - centre.x, z: (a.z + b.z) / 2 - centre.z };
      if ((nx * mid.x + nz * mid.z > 0) !== options.outward) {
        nx = -nx;
        nz = -nz;
      }
      return unit([nx, 0, nz]);
    };
    let run = 0;
    for (let i = 0; i < segments; i++) {
      const a = path[i % n];
      const b = path[(i + 1) % n];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length === 0) continue;
      const here = segNormal(i);
      let na = here;
      let nb = here;
      if (options.smooth) {
        const prev = i > 0 || options.closed ? segNormal((i - 1 + n) % n) : here;
        const next = i < segments - 1 || options.closed ? segNormal(i + 1) : here;
        na = unit([here[0] + prev[0], 0, here[2] + prev[2]]);
        nb = unit([here[0] + next[0], 0, here[2] + next[2]]);
      }
      const u0 = run * options.tiling;
      const u1 = (run + length) * options.tiling;
      run += length;
      const v0 = y0 * options.tiling;
      const v1 = y1 * options.tiling;
      const i0 = this.vertex([a.x, y0, a.z], na, u0, v0);
      const i1 = this.vertex([b.x, y0, b.z], nb, u1, v0);
      const i2 = this.vertex([b.x, y1, b.z], nb, u1, v1);
      const i3 = this.vertex([a.x, y1, a.z], na, u0, v1);
      this.tri(i0, i1, i2);
      this.tri(i0, i2, i3);
    }
  }

  toMesh(name: string, scene: Scene, material: Material): Mesh {
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = this.positions;
    data.normals = this.normals;
    data.uvs = this.uvs;
    data.indices = this.indices;
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  }
}

/** Points of a circle in plan view. */
export function circle(centre: Vec2, radius: number, segments: number): Vec2[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return { x: centre.x + Math.cos(a) * radius, z: centre.z + Math.sin(a) * radius };
  });
}
