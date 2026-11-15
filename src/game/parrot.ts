import * as THREE from 'three';

/*
 * A hand-built 3D ninja parrot: feathered body, articulated flapping wings, fanned tail, hooked beak whose lower
 * mandible hinges open, side-set eyes and a red bandana with fluttering tails. The nose points along +X, up is +Y
 * and the right wing extends along +Z.
 */

const INK = 0x10240f;
const BACK = new THREE.Color(0x2f8f2a);
const BELLY = new THREE.Color(0xa8d84a);
const CROWN = new THREE.Color(0x7fd23c);

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Overlapping scalloped feather rows, used as a light/dark detail map over the body's vertex colours. */
function scallopTexture() {
  return canvas(512, 256, (g) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 512, 256);
    const r = 22;
    for (let row = 0; row < 256 / (r * 0.8) + 1; row++) {
      for (let col = -1; col < 512 / (r * 1.6) + 1; col++) {
        const x = col * r * 1.6 + (row % 2) * r * 0.8;
        const y = row * r * 0.8;
        const grad = g.createRadialGradient(x, y - r * 0.4, 1, x, y, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.7, '#f2f2f2');
        grad.addColorStop(1, '#c4c4c4');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI);
        g.fill();
      }
    }
  });
}

/** A single feather, painted along its length (u = base → tip). */
function featherTexture(base: string, tip: string, shaft = 'rgba(255,255,230,0.55)') {
  return canvas(256, 64, (g) => {
    const along = g.createLinearGradient(0, 0, 256, 0);
    along.addColorStop(0, base);
    along.addColorStop(0.55, base);
    along.addColorStop(1, tip);
    g.fillStyle = along;
    g.fillRect(0, 0, 256, 64);
    // Barbs sweeping towards the tip.
    g.strokeStyle = 'rgba(0,0,0,0.16)';
    g.lineWidth = 1;
    for (let x = -40; x < 256; x += 5) {
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.moveTo(x, 32);
        g.lineTo(x + 26, 32 + dir * 32);
        g.stroke();
      }
    }
    // Darker edges and tip give each feather a crisp silhouette.
    const across = g.createLinearGradient(0, 0, 0, 64);
    across.addColorStop(0, 'rgba(0,20,0,0.45)');
    across.addColorStop(0.2, 'rgba(0,0,0,0)');
    across.addColorStop(0.8, 'rgba(0,0,0,0)');
    across.addColorStop(1, 'rgba(0,20,0,0.45)');
    g.fillStyle = across;
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = shaft;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 32);
    g.lineTo(250, 32);
    g.stroke();
  });
}

/** A tapered, slightly cupped feather blade lying flat, base at the origin, extending along +X. */
function featherGeometry(length: number, width: number) {
  const geo = new THREE.PlaneGeometry(length, width, 10, 2);
  geo.rotateX(-Math.PI / 2); // lie flat in XZ, facing up
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getX(i) / length + 0.5;
    const z = pos.getZ(i);
    const quill = t < 0.12 ? 0.25 + (t / 0.12) * 0.75 : 1;
    const tip = Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.12) / 0.88, 4)));
    pos.setX(i, t * length);
    pos.setZ(i, z * quill * Math.max(tip, 0.05));
    pos.setY(i, Math.sin(Math.PI * t) * length * 0.04 - (z / width) ** 2 * width * 0.25);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Inverted-hull ink outline, matching the bold outlines of the painted art. */
function outlineMaterial(thickness: number) {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\ntransformed += normal * ${thickness.toFixed(3)};`,
    );
  };
  return m;
}

function paint(geo: THREE.BufferGeometry, colour: (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color) {
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const colours = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    colour(p.fromBufferAttribute(pos, i), n.fromBufferAttribute(nrm, i)).toArray(colours, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geo;
}

/** A hooked beak half: a cone along +X, bent down at the tip by `hook`. */
function beakGeometry(length: number, radius: number, hook: number, from: THREE.Color, to: THREE.Color) {
  const geo = new THREE.ConeGeometry(radius, length, 20, 8);
  geo.rotateZ(-Math.PI / 2);
  geo.translate(length / 2, 0, 0);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getX(i) / length, 0, 1);
    pos.setY(i, pos.getY(i) - hook * Math.pow(t, 2.2));
    pos.setZ(i, pos.getZ(i) * 0.82);
  }
  geo.computeVertexNormals();
  return paint(geo, (p) => from.clone().lerp(to, Math.min(1, p.x / length)));
}

export class ParrotModel {
  readonly root = new THREE.Group();
  private wings: { arm: THREE.Group; hand: THREE.Group }[] = [];
  private tail = new THREE.Group();
  private jaw = new THREE.Group();
  private glow: THREE.Sprite;
  private ribbons: { mesh: THREE.Mesh; side: number }[] = [];
  private knot = new THREE.Vector3(0.36, 0.5, 0);
  private mouthLocal = new THREE.Vector3(1.52, 0.2, 0);
  private phase = 0;

  constructor(glowTexture: THREE.Texture) {
    const scallops = scallopTexture();
    const plumage = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      map: scallops,
      bumpMap: scallops,
      bumpScale: 0.4,
      roughness: 0.7,
      sheen: 0.6,
      sheenColor: new THREE.Color(0xc8ffb0),
    });
    const outline = outlineMaterial(0.022);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = this.root, inked = true) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      parent.add(mesh);
      if (inked) parent.add(new THREE.Mesh(geo, outline));
      return mesh;
    };

    // Body: an egg shape that tapers to the tail, green back and paler belly.
    const body = new THREE.SphereGeometry(1, 40, 28);
    const bp = body.getAttribute('position');
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i);
      const r = 0.62 * (x > 0 ? 1 - 0.12 * x : 1 + 0.4 * x);
      bp.setXYZ(i, x * 0.95, bp.getY(i) * r - 0.06 * (1 - x * x), bp.getZ(i) * r);
    }
    body.computeVertexNormals();
    add(
      paint(body, (_p, n) => BACK.clone().lerp(BELLY, THREE.MathUtils.smoothstep(-n.y, -0.1, 0.6))),
      plumage,
    );

    // Neck and head, with a brighter crown.
    const head = new THREE.Vector3(0.84, 0.4, 0);
    const neck = new THREE.SphereGeometry(0.48, 28, 20).scale(1, 1, 0.95).translate(0.52, 0.2, 0);
    add(
      paint(neck, (_p, n) => BACK.clone().lerp(BELLY, THREE.MathUtils.smoothstep(-n.y, -0.2, 0.5))),
      plumage,
    );
    const skull = new THREE.SphereGeometry(0.5, 32, 24).scale(1.05, 1, 0.92).translate(head.x, head.y, head.z);
    add(
      paint(skull, (p, n) =>
        BACK.clone()
          .lerp(CROWN, THREE.MathUtils.smoothstep(n.y + n.x * 0.5, 0.2, 0.9))
          .lerp(BELLY, THREE.MathUtils.smoothstep(-n.y, 0.2, 0.8) * 0.6 + (p.x > 1.1 ? 0.2 : 0)),
      ),
      plumage,
    );

    // Hooked beak: fixed upper mandible, hinged lower jaw.
    const beakMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 });
    const upper = beakGeometry(0.6, 0.25, 0.3, new THREE.Color(0xffad3a), new THREE.Color(0xc4421c));
    upper.translate(1.16, 0.34, 0);
    add(upper, beakMat);
    this.jaw.position.set(1.14, 0.2, 0);
    this.root.add(this.jaw);
    add(beakGeometry(0.36, 0.17, -0.04, new THREE.Color(0xe0782a), new THREE.Color(0x9c3a18)), beakMat, this.jaw);
    const mouth = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a0f12 }),
    );
    mouth.position.set(1.22, 0.24, 0);
    this.root.add(mouth);

    // Ninja bandana tied across the eyes.
    const red = new THREE.MeshStandardMaterial({ color: 0xd8262c, roughness: 0.8, side: THREE.DoubleSide });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.535, 0.52, 0.26, 36, 1, true), red);
    band.position.set(head.x - 0.02, head.y + 0.1, 0);
    band.rotation.z = 0.32;
    band.scale.set(1.05, 1, 0.94);
    band.castShadow = true;
    this.root.add(band);
    for (const z of [-0.08, 0.08]) {
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), red);
      knot.position.copy(this.knot).setZ(z);
      this.root.add(knot);
    }
    for (const side of [-1, 1]) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 2 * 3), 3));
      const idx: number[] = [];
      for (let i = 0; i < 15; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, red);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.ribbons.push({ mesh, side });
    }

    // Side-set eyes peering out through the bandana: cream eye-ring, golden iris, pupil and a catch-light.
    for (const side of [-1, 1]) {
      const dir = new THREE.Vector3(0.5, 0.22, side * 0.84).normalize();
      const at = head
        .clone()
        .add(new THREE.Vector3(0, 0.08, 0))
        .addScaledVector(dir, 0.43);
      const ring = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xf3efdc, roughness: 0.5 }),
      );
      ring.position.copy(at);
      const iris = new THREE.Mesh(
        new THREE.SphereGeometry(0.095, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xf0b62c, roughness: 0.2 }),
      );
      iris.position.copy(at).addScaledVector(dir, 0.06);
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.058, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.1 }),
      );
      pupil.position.copy(at).addScaledVector(dir, 0.105);
      const glint = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 6, 4),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      glint.position
        .copy(pupil.position)
        .add(new THREE.Vector3(0.03, 0.035, 0))
        .addScaledVector(dir, 0.04);
      this.root.add(ring, iris, pupil, glint);
    }

    // Wings: arm (coverts + secondaries) and a hinged hand (primaries). The left wing is a mirror of the right.
    const covertTex = featherTexture('#3a9a2c', '#2f7d27');
    const secondaryMat = new THREE.MeshStandardMaterial({
      map: featherTexture('#33922c', '#1f6fb0'),
      side: THREE.DoubleSide,
      roughness: 0.7,
    });
    const primaryMat = new THREE.MeshStandardMaterial({
      map: featherTexture('#2f8a2a', '#1745a8'),
      side: THREE.DoubleSide,
      roughness: 0.7,
    });
    const covertMat = new THREE.MeshStandardMaterial({ map: covertTex, side: THREE.DoubleSide, roughness: 0.75 });
    for (const side of [1, -1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.22, 0.34, side * 0.4);
      shoulder.scale.z = side;
      const arm = new THREE.Group();
      shoulder.add(arm);
      for (let i = 0; i < 7; i++) {
        const f = new THREE.Mesh(featherGeometry(1.05 - i * 0.02, 0.3), secondaryMat);
        f.position.set(0.05, -i * 0.012, 0.08 + i * 0.14);
        f.rotation.y = -(Math.PI - 0.12 - i * 0.04);
        f.castShadow = true;
        arm.add(f);
      }
      for (let i = 0; i < 6; i++) {
        const f = new THREE.Mesh(featherGeometry(0.6, 0.3), covertMat);
        f.position.set(0.22, 0.03, 0.06 + i * 0.16);
        f.rotation.y = -(Math.PI - 0.2);
        f.castShadow = true;
        arm.add(f);
      }
      const hand = new THREE.Group();
      hand.position.set(0.05, 0, 1.0);
      arm.add(hand);
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const f = new THREE.Mesh(featherGeometry(1.15 + t * 0.55, 0.3), primaryMat);
        f.position.set(0.04 * t, -i * 0.01, t * 0.45);
        f.rotation.y = -THREE.MathUtils.degToRad(168 - t * 82);
        f.castShadow = true;
        hand.add(f);
      }
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(featherGeometry(0.55, 0.28), covertMat);
        f.position.set(0.18, 0.03, i * 0.13);
        f.rotation.y = -THREE.MathUtils.degToRad(160 - i * 18);
        hand.add(f);
      }
      this.root.add(shoulder);
      this.wings.push({ arm, hand });
    }

    // Tail fan with blue tips.
    const tailMat = new THREE.MeshStandardMaterial({
      map: featherTexture('#3a982d', '#1d5fb5'),
      side: THREE.DoubleSide,
      roughness: 0.7,
    });
    this.tail.position.set(-0.72, 0.08, 0);
    for (let i = 0; i < 7; i++) {
      const t = i / 6 - 0.5;
      const f = new THREE.Mesh(featherGeometry(1.55 - Math.abs(t) * 0.5, 0.3), tailMat);
      f.rotation.y = -(Math.PI + t * 0.55);
      f.position.y = -Math.abs(t) * 0.04;
      f.castShadow = true;
      this.tail.add(f);
    }
    this.root.add(this.tail);

    // Grey zygodactyl feet tucked up under the belly.
    const footMat = new THREE.MeshStandardMaterial({ color: 0x8c8f93, roughness: 0.8 });
    for (const z of [-0.2, 0.2]) {
      const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 4, 8), footMat);
      foot.rotation.z = Math.PI / 2;
      foot.position.set(0.1, -0.52, z);
      this.root.add(foot);
    }

    // The icy glow that gathers in the open beak.
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x7fdcff,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.glow.position.copy(this.mouthLocal);
    this.glow.scale.setScalar(0);
    this.root.add(this.glow);
  }

  /** World position of the open beak, where the ice bubbles come from. */
  mouth(target = new THREE.Vector3()) {
    return this.root.localToWorld(target.copy(this.mouthLocal));
  }

  /**
   * @param flapRate wingbeats per second
   * @param open how far the beak is open, 0..1
   * @param turn -1..1, fans the tail as the parrot turns
   */
  animate(dt: number, time: number, flapRate: number, open: number, turn: number) {
    this.phase += dt * flapRate * Math.PI * 2;
    const p = this.phase;
    for (const { arm, hand } of this.wings) {
      arm.rotation.x = Math.sin(p) * 0.8 + 0.08;
      arm.rotation.y = Math.cos(p) * 0.12;
      hand.rotation.x = Math.sin(p - 0.6) * 0.5;
      hand.rotation.y = Math.max(0, -Math.cos(p)) * 0.35; // primaries sweep back on the upstroke
    }
    this.root.position.y = -Math.sin(p) * 0.08; // each downstroke lifts the body a little

    this.tail.rotation.z = 0.14 + Math.sin(p + 1) * 0.05;
    this.tail.rotation.y = turn * 0.35;
    this.tail.children.forEach((f, i) => (f.rotation.y = -(Math.PI + (i / 6 - 0.5) * (0.55 + Math.abs(turn) * 0.5))));

    this.jaw.rotation.z = -open * 0.75;
    const glow = open * (0.6 + Math.sin(time * 40) * 0.08);
    this.glow.scale.setScalar(glow);

    for (const { mesh, side } of this.ribbons) {
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < 16; i++) {
        const k = i / 15;
        const wave = time * 13 - i * 0.65 + side;
        const centre = new THREE.Vector3(
          this.knot.x - k * 1.7,
          this.knot.y - k * 0.25 + Math.sin(wave) * 0.12 * k,
          side * (0.06 + k * 0.32) + Math.cos(wave * 0.8) * 0.1 * k,
        );
        const twist = side * 0.7 + Math.sin(wave) * 0.5;
        const half = new THREE.Vector3(0, Math.cos(twist), Math.sin(twist)).multiplyScalar(0.085 * (1 - k * 0.3));
        pos.setXYZ(i * 2, centre.x + half.x, centre.y + half.y, centre.z + half.z);
        pos.setXYZ(i * 2 + 1, centre.x - half.x, centre.y - half.y, centre.z - half.z);
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingSphere();
    }
  }
}
