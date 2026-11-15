import * as THREE from 'three';
import type { Assets } from '../core/assets';
import { pixelsFromRows, pixelToModel, readPixels, samplePalette, voxelize, type Rgb } from '../core/voxel';

export type VehicleKind = 'tank' | 'helicopter' | 'plane';

const SPRITE = 48;

// Goldfish pilot, side view facing right (+X). Small enough to sit wholly inside its dome.
const GOLDFISH_ROWS = [
  '......oooo......',
  'tt..oooooooo....',
  'ttfoooooooooowk.',
  '.ttooooooooooooo',
  'ttfooooooooooo..',
  'tt..oooooooo....',
  '......ooo.......',
];
const GOLDFISH_PALETTE: Record<string, Rgb> = {
  o: [255, 128, 24],
  t: [255, 176, 72],
  f: [255, 150, 50],
  w: [255, 255, 255],
  k: [20, 20, 30],
};

export const voxelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });

const glassMaterial = new THREE.MeshStandardMaterial({
  color: 0xaee8ff,
  emissive: 0x0b3a52,
  roughness: 0.05,
  metalness: 0.1,
  transparent: true,
  opacity: 0.38,
  depthWrite: false,
});
const brassMaterial = new THREE.MeshStandardMaterial({ color: 0xc8932f, roughness: 0.35, metalness: 0.8 });
const rotorMaterial = new THREE.MeshStandardMaterial({
  color: 0x3a3a40,
  roughness: 0.6,
  transparent: true,
  opacity: 0.55,
});
const blurMaterial = new THREE.MeshBasicMaterial({
  color: 0xdddddd,
  transparent: true,
  opacity: 0.1,
  depthWrite: false,
  side: THREE.DoubleSide,
});

interface VehicleSpec {
  geometry: THREE.BufferGeometry;
  palette: THREE.Color[];
  /** Rotation that turns the sprite so its nose points along +X. */
  yaw: number;
  /** Lift so the model's lowest point sits on y = 0. */
  lift: number;
  dome: { centre: THREE.Vector3; radius: number };
  build(body: THREE.Group, root: THREE.Group, spin: THREE.Object3D[]): void;
}

export interface Models {
  goldfish: THREE.BufferGeometry;
  vehicles: Record<VehicleKind, VehicleSpec>;
}

const isYellow = ([r, g, b]: Rgb) => r > 190 && g > 140 && b < 110;
const isDark = ([r, g, b]: Rgb) => r + g + b < 140;
const inCircle = (x: number, y: number, cx: number, cy: number, r: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** A spinning rotor. Orient `mount`; spin `hub` about its Y axis. */
function rotor(radius: number, blades: number) {
  const mount = new THREE.Group();
  const hub = new THREE.Group();
  mount.add(hub);
  for (let i = 0; i < blades; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(radius * 2, 0.05, radius * 0.07), rotorMaterial);
    blade.rotation.y = (i / blades) * Math.PI;
    blade.castShadow = true;
    hub.add(blade);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), blurMaterial);
  disc.rotation.x = -Math.PI / 2;
  hub.add(disc);
  return { mount, hub };
}

export function buildModels(assets: Assets): Models {
  const goldfish = voxelize(pixelsFromRows(GOLDFISH_ROWS, GOLDFISH_PALETTE), {
    plane: 'side',
    scale: 1,
    depth: 2,
    roundness: 2,
  });

  const vehicles: Record<VehicleKind, VehicleSpec> = {
    helicopter: (() => {
      const scale = 0.1;
      const dome = { x: 38, y: 24, r: 6.6 };
      const geometry = voxelize(readPixels(assets.helicopter), {
        plane: 'side',
        scale,
        depth: 10,
        roundness: 8,
        filter: (rgb, x, y) => {
          if (y <= 13 && isDark(rgb)) return null; // the painted rotor is replaced by a spinning 3D one
          if (inCircle(x, y, dome.x, dome.y, dome.r)) return null; // cockpit becomes a glass dome
          return rgb;
        },
      });
      return {
        geometry,
        palette: samplePalette(geometry),
        yaw: 0,
        lift: 0,
        dome: { centre: pixelToModel('side', scale, SPRITE, dome.x, dome.y), radius: dome.r * scale },
        build(body, _root, spin) {
          const main = rotor(2.6, 2);
          main.mount.position.copy(pixelToModel('side', scale, SPRITE, 31, 13));
          const tail = rotor(0.55, 2);
          tail.mount.rotation.x = Math.PI / 2;
          tail.mount.position.copy(pixelToModel('side', scale, SPRITE, 3, 18)).setZ(0.35);
          body.add(main.mount, tail.mount);
          spin.push(main.hub, tail.hub);
        },
      };
    })(),

    tank: (() => {
      const scale = 0.11;
      const dome = { x: 24, y: 28.5, r: 5.2 };
      const geometry = voxelize(readPixels(assets.tank), {
        plane: 'side',
        scale,
        depth: 7,
        roundness: 4,
        filter: (rgb, x, y) => {
          if (y < 32.5 && inCircle(x, y, dome.x, dome.y, dome.r + 0.5)) return null; // the hatch gets a glass dome
          if (isYellow(rgb)) return null;
          return rgb;
        },
      });
      geometry.computeBoundingBox();
      return {
        geometry,
        palette: samplePalette(geometry),
        yaw: 0,
        lift: -geometry.boundingBox!.min.y,
        dome: { centre: pixelToModel('side', scale, SPRITE, dome.x, dome.y), radius: dome.r * scale },
        build() {},
      };
    })(),

    plane: (() => {
      const scale = 0.105;
      const dome = { x: 37, y: 33, r: 6.8 };
      const geometry = voxelize(readPixels(assets.spitfire), {
        plane: 'top',
        scale,
        depth: 3,
        roundness: 4,
        filter: (rgb, x, y) => (inCircle(x, y, dome.x, dome.y, dome.r) ? null : rgb),
      });
      return {
        geometry,
        palette: samplePalette(geometry),
        yaw: Math.PI / 4,
        lift: 0,
        dome: { centre: pixelToModel('top', scale, SPRITE, dome.x, dome.y, 0.1), radius: dome.r * scale },
        build(_body, root, spin) {
          // The nose is at the bottom-right of the sprite; the propeller spins about the forward (X) axis just in front of it.
          const prop = rotor(0.9, 3);
          prop.mount.rotation.z = Math.PI / 2;
          prop.mount.position
            .copy(pixelToModel('top', scale, SPRITE, 44.5, 40.5, 0.1))
            .applyAxisAngle(THREE.Object3D.DEFAULT_UP, Math.PI / 4);
          root.add(prop.mount);
          spin.push(prop.hub);
        },
      };
    })(),
  };

  return { goldfish, vehicles };
}

/** A sealed, water-filled glass dome with a goldfish pilot swimming wholly inside it. */
export function buildDome(models: Models, radius: number) {
  const group = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), glassMaterial);
  glass.renderOrder = 2;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.86, radius * 0.11, 8, 24), brassMaterial);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = -radius * 0.5;
  collar.castShadow = true;

  // 16 px fish, scaled to ~60% of the dome's diameter so every fin stays inside the glass.
  const fish = new THREE.Mesh(models.goldfish, voxelMaterial);
  fish.scale.setScalar((radius * 1.2) / 16);
  fish.position.y = radius * 0.05;
  group.add(fish, glass, collar);
  return { group, fish };
}

/** A complete goldfish-crewed vehicle. Its nose points along +X. */
export function buildVehicle(models: Models, kind: VehicleKind, material: THREE.Material) {
  const spec = models.vehicles[kind];
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = spec.yaw;
  body.position.y = spec.lift;
  const hull = new THREE.Mesh(spec.geometry, material);
  hull.castShadow = true;
  hull.receiveShadow = true;
  body.add(hull);

  const dome = buildDome(models, spec.dome.radius);
  dome.group.position.copy(spec.dome.centre);
  dome.group.rotation.y = -spec.yaw; // the pilot faces the direction of travel
  body.add(dome.group);

  const spin: THREE.Object3D[] = [];
  spec.build(body, root, spin);
  root.add(body);
  return { root, body, fish: dome.fish, spin, palette: spec.palette };
}
