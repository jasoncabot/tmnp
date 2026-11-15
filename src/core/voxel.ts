import * as THREE from 'three';

/** A rectangle of RGBA pixels read from a sprite sheet. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type Rgb = [number, number, number];

export interface VoxelOptions {
  /**
   * `side`: the sprite is a side view, so it stands up in the XY plane and is inflated along Z.
   * `top`: the sprite is a top-down view, so it lies in the XZ plane and is inflated along Y.
   */
  plane: 'side' | 'top';
  /** World size of one pixel. */
  scale: number;
  /** Half-thickness, in voxels, of the thickest part of the model. */
  depth: number;
  /** How far in from the silhouette edge (in pixels) the model reaches full thickness. */
  roundness?: number;
  /** Recolours or drops (returns null) a pixel. */
  filter?: (rgb: Rgb, x: number, y: number) => Rgb | null;
}

export function readPixels(img: HTMLImageElement, x = 0, y = 0, w = img.width, h = img.height): Pixels {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
}

export function pixelsFromRows(rows: string[], palette: Record<string, Rgb>): Pixels {
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * rows.length * 4);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = palette[ch];
      if (!c) return;
      data.set([...c, 255], (y * width + x) * 4);
    }),
  );
  return { width, height: rows.length, data };
}

// Each face: outward normal and its four corners as a cycle around the unit cube face.
const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
  {
    n: [1, 0, 0],
    c: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    c: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
  {
    n: [0, 1, 0],
    c: [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
    ],
  },
  {
    n: [0, -1, 0],
    c: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    n: [0, 0, 1],
    c: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    n: [0, 0, -1],
    c: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  },
];

// Make every face wind counter-clockwise when seen from outside, whatever order the corners were listed in.
for (const f of FACES) {
  const [a, b, c] = f.c.map((p) => new THREE.Vector3(...p));
  const cross = b.clone().sub(a).cross(c.clone().sub(a));
  if (cross.dot(new THREE.Vector3(...f.n)) < 0) f.c.reverse();
}

/**
 * Turns a pixel-art sprite into a chunky, rounded voxel model: each opaque pixel becomes a column of cubes whose
 * height follows the distance to the sprite's edge, so silhouettes "inflate" like a plush toy.
 * Returns an indexed geometry with vertex colours, centred on the sprite's centre.
 */
export function voxelize(px: Pixels, opts: VoxelOptions): THREE.BufferGeometry {
  const { width: w, height: h } = px;
  const colours: (Rgb | null)[] = new Array(w * h).fill(null);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px.data[i + 3] < 128) continue;
      const rgb: Rgb = [px.data[i], px.data[i + 1], px.data[i + 2]];
      colours[y * w + x] = opts.filter ? opts.filter(rgb, x, y) : rgb;
    }
  }

  // Two-pass chamfer distance transform: distance (in pixels) from each opaque pixel to the nearest empty one.
  const dist = new Float32Array(w * h);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : dist[y * w + x]);
  for (let i = 0; i < w * h; i++) dist[i] = colours[i] ? Infinity : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!dist[i]) continue;
      dist[i] = Math.min(
        dist[i],
        at(x - 1, y) + 1,
        at(x, y - 1) + 1,
        at(x - 1, y - 1) + 1.414,
        at(x + 1, y - 1) + 1.414,
      );
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!dist[i]) continue;
      dist[i] = Math.min(
        dist[i],
        at(x + 1, y) + 1,
        at(x, y + 1) + 1,
        at(x + 1, y + 1) + 1.414,
        at(x - 1, y + 1) + 1.414,
      );
    }

  // Circular profile: thin at the edge, full depth `roundness` pixels in.
  const radius = opts.roundness ?? opts.depth;
  const half = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!colours[i]) continue;
    const t = Math.min(dist[i], radius) / radius;
    half[i] = Math.max(1, Math.round(opts.depth * Math.sqrt(1 - (1 - t) * (1 - t))));
  }

  const d = opts.depth * 2;
  const filled = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h || z < 0 || z >= d) return false;
    const hh = half[y * w + x];
    return hh > 0 && z >= opts.depth - hh && z < opts.depth + hh;
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const vertexColours: number[] = [];
  const index: number[] = [];
  const colour = new THREE.Color();

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const rgb = colours[y * w + x];
      if (!rgb) continue;
      colour.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
      for (let z = 0; z < d; z++) {
        if (!filled(x, y, z)) continue;
        for (const f of FACES) {
          if (filled(x + f.n[0], y + f.n[1], z + f.n[2])) continue;
          const base = positions.length / 3;
          for (const c of f.c) {
            positions.push(x + c[0] - w / 2, y + c[1] - h / 2, z + c[2] - opts.depth);
            normals.push(...f.n);
            vertexColours.push(colour.r, colour.g, colour.b);
          }
          index.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColours, 3));
  geometry.setIndex(index);

  // Grid space has image y pointing down. Map it into model space with a proper rotation (determinant +1),
  // so face winding survives; the depth axis is symmetric, so flipping it is harmless.
  const s = opts.scale;
  const m = new THREE.Matrix4();
  if (opts.plane === 'side') m.set(s, 0, 0, 0, 0, -s, 0, 0, 0, 0, -s, 0, 0, 0, 0, 1);
  else m.set(s, 0, 0, 0, 0, 0, -s, 0, 0, s, 0, 0, 0, 0, 0, 1);
  geometry.applyMatrix4(m);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Converts a sprite pixel coordinate to model space, matching `voxelize`'s centring and orientation. */
export function pixelToModel(
  plane: 'side' | 'top',
  scale: number,
  size: number,
  x: number,
  y: number,
  lift = 0,
): THREE.Vector3 {
  const px = (x - size / 2) * scale;
  const py = (y - size / 2) * scale;
  return plane === 'side' ? new THREE.Vector3(px, -py, 0) : new THREE.Vector3(px, lift, py);
}

/** A handful of the model's own colours, for tinting debris when it explodes. */
export function samplePalette(geometry: THREE.BufferGeometry, count = 8): THREE.Color[] {
  const attr = geometry.getAttribute('color');
  const out: THREE.Color[] = [];
  for (let i = 0; i < count; i++) {
    const j = Math.floor(Math.random() * attr.count);
    out.push(new THREE.Color(attr.getX(j), attr.getY(j), attr.getZ(j)));
  }
  return out;
}
