import * as THREE from 'three';
import type { Assets } from '../core/assets';
import { isTouchDevice } from '../core/renderer';

/** Half-extents of the playable area. */
export const ARENA = { x: 52, z: 36 };
export const FLIGHT_HEIGHT = 6;

const SKY = 0xbfe3ff;

function randomIn(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/** Low-poly jungle trees, as instanced meshes so a few hundred cost a couple of draw calls. */
function forest(positions: THREE.Vector3[]) {
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 1, 6).translate(0, 0.5, 0);
  const leafGeo = new THREE.IcosahedronGeometry(1, 0);
  const trunks = new THREE.InstancedMesh(
    trunkGeo,
    new THREE.MeshStandardMaterial({ color: 0x6b4a2b, flatShading: true }),
    positions.length,
  );
  const leaves = new THREE.InstancedMesh(
    leafGeo,
    new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
    positions.length * 3,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  positions.forEach((p, i) => {
    const h = randomIn(4, 9);
    const s = randomIn(0.8, 1.4);
    trunks.setMatrixAt(i, m.compose(p, q, new THREE.Vector3(s, h, s)));
    for (let j = 0; j < 3; j++) {
      const r = (2.6 - j * 0.6) * s * randomIn(0.9, 1.2);
      q.setFromEuler(new THREE.Euler(Math.random(), Math.random() * 6, Math.random()));
      m.compose(
        new THREE.Vector3(p.x + randomIn(-0.5, 0.5), p.y + h + j * 1.5 * s, p.z + randomIn(-0.5, 0.5)),
        q,
        new THREE.Vector3(r, r * 0.9, r),
      );
      leaves.setMatrixAt(i * 3 + j, m);
      leaves.setColorAt(i * 3 + j, c.setHSL(randomIn(0.24, 0.33), randomIn(0.45, 0.65), randomIn(0.22, 0.36)));
    }
    q.identity();
  });
  for (const mesh of [trunks, leaves]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  return [trunks, leaves];
}

export class World {
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  private cloudShadows: THREE.Group;

  constructor(assets: Assets) {
    const { scene } = this;
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 60, 150);

    scene.add(new THREE.HemisphereLight(0xdff1ff, 0x41602a, 1.5));
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(isTouchDevice ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -45;
    sc.right = sc.top = 45;
    sc.near = 1;
    sc.far = 160;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);

    const size = 500;
    assets.ground.repeat.set(size / 48, size / 48);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      // Tinted down so the busy painted floor sits behind the action instead of competing with it.
      new THREE.MeshStandardMaterial({ map: assets.ground, roughness: 1, color: 0x9fb08a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // A thick ring of jungle around the arena.
    const trees: THREE.Vector3[] = [];
    for (let i = 0; i < 260; i++) {
      const edge = Math.random() * 4;
      const along = Math.random() * 2 - 1;
      const depth = randomIn(4, 30);
      // The far side (-Z) starts further back: at this camera angle, tall trees there lean over the play area.
      const x = edge < 2 ? along * (ARENA.x + 30) : (edge < 3 ? -1 : 1) * (ARENA.x + depth);
      const z = edge < 2 ? (edge < 1 ? -(ARENA.z + 12 + depth) : ARENA.z + depth) : along * (ARENA.z + 30);
      trees.push(new THREE.Vector3(x, 0, z));
    }
    scene.add(...forest(trees));

    // Invisible clouds that only cast drifting, dappled shadows across the battlefield.
    this.cloudShadows = new THREE.Group();
    const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    for (let i = 0; i < 9; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(randomIn(3, 6), 1), shadowOnly);
        puff.position.set(randomIn(-6, 6), 0, randomIn(-3, 3));
        puff.castShadow = true;
        cloud.add(puff);
      }
      cloud.position.set(randomIn(-90, 90), 26, randomIn(-60, 60));
      this.cloudShadows.add(cloud);
    }
    scene.add(this.cloudShadows);
  }

  /** Keeps the shadow-casting sun centred on what the camera is looking at. */
  update(dt: number, focus: THREE.Vector3) {
    this.sun.position.set(focus.x + 25, 60, focus.z + 30);
    this.sun.target.position.copy(focus);
    for (const cloud of this.cloudShadows.children) {
      cloud.position.x += dt * 2.2;
      if (cloud.position.x > 100) cloud.position.x = -100;
    }
  }
}
