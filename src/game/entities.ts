import * as THREE from 'three';
import type { PickupId } from '../core/assets';
import { buildVehicle, voxelMaterial, type Models, type VehicleKind } from './models';
import { ParrotModel } from './parrot';
import { FLIGHT_HEIGHT } from './world';

const UP = new THREE.Vector3(0, 1, 0);

/** Heading angle for a direction in the ground plane (0 = +X, PI/2 = +Z). */
export const headingOf = (dx: number, dz: number) => Math.atan2(dz, dx);

/** Turns `from` towards `to` by at most `maxStep` radians. */
export function turnTowards(from: number, to: number, maxStep: number) {
  let d = to - from;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return from + THREE.MathUtils.clamp(d, -maxStep, maxStep);
}

function blobShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const shadowTexture = blobShadow();

/** A soft spot on the ground under flyers, so you can always read their position. */
export function groundMarker(size: number) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.05;
  return m;
}

export class Player {
  readonly root = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  readonly marker = groundMarker(4);
  readonly model: ParrotModel;
  heading = -Math.PI / 2;
  private tilt = new THREE.Group();
  private lastHeading = this.heading;
  private turn = 0;
  private bank = 0;
  private rollT = 1;
  private rollDir = 0;

  constructor(glow: THREE.Texture) {
    this.model = new ParrotModel(glow);
    this.model.root.scale.setScalar(1.1);
    this.tilt.add(this.model.root);
    this.root.add(this.tilt);
    this.root.position.y = FLIGHT_HEIGHT;
  }

  get position() {
    return this.root.position;
  }

  /** A full barrel roll, `dir` = 1 or -1. */
  barrelRoll(dir: number) {
    this.rollT = 0;
    this.rollDir = dir;
  }

  /** Visual update: facing, banking into turns, flapping, and the beak snapping open to spit ice. */
  animate(dt: number, time: number, blink: boolean, beakOpen: number) {
    this.root.rotation.y = -this.heading;
    const forward = new THREE.Vector3(Math.cos(this.heading), 0, Math.sin(this.heading));
    const side = new THREE.Vector3().crossVectors(UP, forward);
    const ahead = this.velocity.dot(forward) / 14;
    const turnRate =
      dt > 0
        ? Math.atan2(Math.sin(this.heading - this.lastHeading), Math.cos(this.heading - this.lastHeading)) / dt
        : 0;
    this.lastHeading = this.heading;
    this.turn = THREE.MathUtils.lerp(this.turn, THREE.MathUtils.clamp(turnRate / 6, -1, 1), Math.min(1, dt * 6));
    const lateral = this.velocity.dot(side) / 14;
    // Bank into turns and sideways drift, pitch nose-down when flying fast.
    this.bank = THREE.MathUtils.lerp(this.bank, (lateral - this.turn) * 0.5, Math.min(1, dt * 8));
    this.rollT = Math.min(1, this.rollT + dt / 0.32);
    this.tilt.rotation.x = this.bank + this.rollDir * Math.PI * 2 * (1 - (1 - this.rollT) ** 3);
    this.tilt.rotation.z = THREE.MathUtils.lerp(this.tilt.rotation.z, -ahead * 0.22, Math.min(1, dt * 8));
    this.root.position.y = FLIGHT_HEIGHT + Math.sin(time * 2.2) * 0.2;

    const speed = this.velocity.length();
    this.model.animate(dt, time, 2.4 + speed * 0.12, beakOpen, this.turn);
    this.model.root.visible = !blink;
    this.marker.position.set(this.position.x, 0.05, this.position.z);
  }
}

export interface EnemyStats {
  hp: number;
  radius: number;
  altitude: number;
  speed: number;
  turn: number;
  fireEvery: number;
  score: number;
}

export const ENEMY_STATS: Record<VehicleKind, EnemyStats> = {
  tank: { hp: 4, radius: 2.4, altitude: 0, speed: 4.5, turn: 1.4, fireEvery: 2.4, score: 150 },
  helicopter: { hp: 3, radius: 2.4, altitude: 5.5, speed: 9, turn: 3, fireEvery: 2.8, score: 120 },
  plane: { hp: 2, radius: 2.2, altitude: 7.5, speed: 17, turn: 1.8, fireEvery: 1.3, score: 100 },
};

export class Enemy {
  readonly root: THREE.Group;
  readonly palette: THREE.Color[];
  readonly stats: EnemyStats;
  readonly velocity = new THREE.Vector3();
  readonly marker: THREE.Mesh;
  hp: number;
  heading: number;
  fireTimer: number;
  flash = 0;
  /** Seconds left frozen by ice: frozen vehicles crawl and frost over. */
  frozen = 0;
  /** Goal position used by the steering behaviours. */
  goal = new THREE.Vector3();
  goalTimer = 0;
  /** Seconds spent arriving (helicopters descend, everything ignores the arena walls). */
  entering = 2.5;
  bank = 0;
  private material: THREE.MeshStandardMaterial;
  private body: THREE.Group;
  private fish: THREE.Mesh;
  private spin: THREE.Object3D[];

  constructor(
    models: Models,
    readonly kind: VehicleKind,
    level: number,
    readonly scale = 1,
  ) {
    this.material = voxelMaterial.clone();
    const v = buildVehicle(models, kind, this.material);
    this.root = v.root;
    this.body = v.body;
    this.fish = v.fish;
    this.spin = v.spin;
    this.palette = v.palette;
    this.root.scale.setScalar(scale);
    this.root.rotation.order = 'YXZ'; // yaw, then bank about the vehicle's own nose axis
    const base = ENEMY_STATS[kind];
    // Early waves fire slowly so you can learn the ropes; the barrage ramps up over the first ten waves.
    const calm = 1.7 - Math.min(0.7, (level - 1) * 0.07);
    this.stats = {
      ...base,
      radius: base.radius * scale,
      speed: base.speed * (1 + level * 0.04),
      fireEvery: base.fireEvery * calm,
    };
    this.hp = Math.ceil(base.hp * (1 + (level - 1) * 0.12) * scale * scale);
    this.heading = 0;
    this.fireTimer = this.stats.fireEvery * (0.8 + Math.random());
    this.marker = groundMarker(this.stats.radius * 2.4);
    this.marker.visible = kind !== 'tank';
  }

  get position() {
    return this.root.position;
  }

  get alive() {
    return this.hp > 0;
  }

  /** Where the pilot is, for the escape animation. */
  get cockpit() {
    return this.fish.getWorldPosition(new THREE.Vector3());
  }

  animate(dt: number, time: number) {
    this.root.rotation.y = -this.heading;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.frozen = Math.max(0, this.frozen - dt);
    const frost = Math.min(1, this.frozen * 3) * 0.22;
    this.material.emissive.setRGB(
      this.flash * 0.35 + frost * 0.1,
      this.flash * 0.35 + frost * 0.5,
      this.flash * 0.35 + frost,
    );
    for (const s of this.spin) s.rotation.y += dt * 40;
    this.fish.rotation.z = Math.sin(time * 6) * 0.15; // the pilot wiggles at the controls
    if (this.kind === 'plane') this.root.rotation.x = this.bank;
    if (this.kind === 'helicopter') {
      this.body.rotation.z = -THREE.MathUtils.clamp(this.velocity.length() / 30, 0, 0.3);
      this.body.position.y = Math.sin(time * 2 + this.goal.x) * 0.3;
    }
    this.marker.position.set(this.position.x, 0.05, this.position.z);
  }

  dispose() {
    this.material.dispose();
  }
}

export class Pickup {
  readonly root = new THREE.Group();
  age = 0;
  private icon: THREE.Sprite;
  private ring: THREE.Mesh;

  constructor(
    readonly id: PickupId,
    texture: THREE.Texture,
    at: THREE.Vector3,
  ) {
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
    this.icon.scale.setScalar(2.6);
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.08, 6, 32),
      new THREE.MeshBasicMaterial({ color: 0x9ff3ff, blending: THREE.AdditiveBlending, transparent: true }),
    );
    this.ring.rotation.x = Math.PI / 2;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.9, FLIGHT_HEIGHT, 12, 1, true).translate(0, -FLIGHT_HEIGHT / 2, 0),
      new THREE.MeshBasicMaterial({
        color: 0x9ff3ff,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.root.add(this.icon, this.ring, beam);
    this.root.position.set(at.x, FLIGHT_HEIGHT, at.z);
  }

  /** Returns false once it has expired. */
  update(dt: number, time: number) {
    this.age += dt;
    this.icon.position.y = Math.sin(time * 3) * 0.3 + 0.4;
    this.ring.rotation.z += dt * 2;
    this.ring.scale.setScalar(1 + Math.sin(time * 5) * 0.08);
    this.root.visible = this.age < 11 || Math.floor(this.age * 8) % 2 === 0;
    return this.age < 14;
  }
}
