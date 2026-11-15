// Dev-only model viewer: http://localhost:5173/?preview  (drag to orbit, hold space to open the beak)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { softDot } from '../game/effects';
import { ParrotModel } from '../game/parrot';

export function startPreview(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6f8f5a);
  scene.add(new THREE.HemisphereLight(0xdff1ff, 0x41602a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.8);
  sun.position.set(5, 10, 6);
  sun.castShadow = true;
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x4f7a3a }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3;
  ground.receiveShadow = true;
  scene.add(ground);

  const parrot = new ParrotModel(softDot());
  scene.add(parrot.root);

  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
  const view = new URLSearchParams(location.search).get('preview');
  // "game" matches the in-game camera angle; anything else is a close three-quarter view.
  if (view === 'game') camera.position.set(0, 16, 15);
  else if (view === 'top') camera.position.set(0.01, 9, 0);
  else camera.position.set(4.5, 2.5, 5.5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.3, 0, 0);
  controls.update();

  let open = 0;
  let held = new URLSearchParams(location.search).has('open');
  addEventListener('keydown', (e) => e.code === 'Space' && (held = true));
  addEventListener('keyup', (e) => e.code === 'Space' && (held = false));
  const timer = new THREE.Timer();
  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = timer.getDelta();
    open = THREE.MathUtils.lerp(open, held ? 1 : 0, dt * 12);
    parrot.animate(dt, timer.getElapsed(), 3, open, Math.sin(timer.getElapsed() * 0.7));
    renderer.render(scene, camera);
  });
}
