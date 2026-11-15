import * as THREE from 'three';

const GRAVITY = -32;
const MAX_DEBRIS = 900;

export function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Chunk {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  size: number;
  life: number;
  maxLife: number;
}

interface Puff {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  grow: number;
  fade: number;
}

/** Voxel debris, flashes and smoke. Everything is pooled. */
export class Effects {
  private debris: THREE.InstancedMesh;
  private chunks: Chunk[] = [];
  private puffs: Puff[] = [];
  private free: THREE.Sprite[] = [];
  private dot = softDot();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {
    this.debris = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.8 }),
      MAX_DEBRIS,
    );
    this.debris.count = 0;
    this.debris.castShadow = true;
    this.debris.frustumCulled = false;
    this.debris.setColorAt(0, new THREE.Color());
    scene.add(this.debris);
  }

  /** Bursts a model into voxel chunks coloured from its own palette. */
  shatter(at: THREE.Vector3, palette: THREE.Color[], count = 40, force = 14, size = 0.22) {
    for (let i = 0; i < count && this.chunks.length < MAX_DEBRIS; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize();
      this.debris.setColorAt(this.chunks.length, palette[i % palette.length]);
      this.chunks.push({
        pos: at.clone().addScaledVector(dir, 0.5),
        vel: dir.multiplyScalar(force * (0.4 + Math.random())),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        size: size * (0.6 + Math.random()),
        life: 0,
        maxLife: 1.4 + Math.random() * 1.2,
      });
    }
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
  }

  private sprite(colour: THREE.ColorRepresentation, additive: boolean) {
    const sprite = this.free.pop() ?? new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dot, depthWrite: false }));
    const mat = sprite.material;
    mat.color.set(colour);
    mat.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    mat.opacity = 1;
    sprite.visible = true;
    this.scene.add(sprite);
    return sprite;
  }

  puff(
    at: THREE.Vector3,
    opts: {
      colour: THREE.ColorRepresentation;
      size: number;
      life: number;
      additive?: boolean;
      vel?: THREE.Vector3;
      grow?: number;
      fade?: number;
    },
  ) {
    const sprite = this.sprite(opts.colour, opts.additive ?? false);
    sprite.position.copy(at);
    sprite.scale.setScalar(opts.size);
    this.puffs.push({
      sprite,
      vel: opts.vel ?? new THREE.Vector3(),
      life: 0,
      maxLife: opts.life,
      grow: opts.grow ?? 1.5,
      fade: opts.fade ?? 1,
    });
  }

  explosion(at: THREE.Vector3, palette: THREE.Color[], big = false) {
    const k = big ? 2.2 : 1;
    this.puff(at, { colour: 0xfff2c0, size: 7 * k, life: 0.18, additive: true, grow: 3 });
    this.puff(at, { colour: 0xff8a20, size: 5 * k, life: 0.45, additive: true, grow: 2 });
    for (let i = 0; i < 6 * k; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6 + 0.3, Math.random() - 0.5).multiplyScalar(
        6,
      );
      this.puff(at, { colour: 0x6b6f78, size: 2.5 * k, life: 1.2 + Math.random(), vel: v, grow: 2.2, fade: 0.55 });
    }
    // Water splash from the shattered dome.
    for (let i = 0; i < 10 * k; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() + 0.5, Math.random() - 0.5).multiplyScalar(10);
      this.puff(at, { colour: 0x8fdcff, size: 0.7, life: 0.7, vel: v, additive: true, grow: 0.5 });
    }
    this.shatter(at, palette, big ? 160 : 55, big ? 22 : 15);
  }

  update(dt: number) {
    let n = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      c.life += dt;
      if (c.life >= c.maxLife) continue;
      c.vel.y += GRAVITY * dt;
      c.pos.addScaledVector(c.vel, dt);
      if (c.pos.y < c.size / 2) {
        c.pos.y = c.size / 2;
        c.vel.y *= -0.35;
        c.vel.x *= 0.6;
        c.vel.z *= 0.6;
        c.spin.multiplyScalar(0.6);
      }
      c.rot.x += c.spin.x * dt;
      c.rot.y += c.spin.y * dt;
      const shrink = Math.min(1, (c.maxLife - c.life) / 0.4);
      this.m.compose(c.pos, this.q.setFromEuler(c.rot), this.s.setScalar(c.size * shrink));
      // Compact live chunks to the front so the instance count stays tight.
      if (n !== i && this.debris.instanceColor) {
        this.chunks[n] = c;
        const col = new THREE.Color();
        this.debris.getColorAt(i, col);
        this.debris.setColorAt(n, col);
      }
      this.debris.setMatrixAt(n++, this.m);
    }
    this.chunks.length = n;
    this.debris.count = n;
    this.debris.instanceMatrix.needsUpdate = true;
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;

    this.puffs = this.puffs.filter((p) => {
      p.life += dt;
      const t = p.life / p.maxLife;
      if (t >= 1) {
        p.sprite.visible = false;
        this.scene.remove(p.sprite);
        this.free.push(p.sprite);
        return false;
      }
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 1.5);
      p.sprite.scale.multiplyScalar(1 + p.grow * dt);
      p.sprite.material.opacity = (1 - t) * p.fade;
      return true;
    });
  }
}
