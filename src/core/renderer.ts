import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Indie finishing pass: vignette, a little film grain, and chromatic aberration that spikes when the player is hurt.
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0 },
    uVignette: { value: 0.35 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAberration;
    uniform float uVignette;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 fromCentre = vUv - 0.5;
      vec2 shift = fromCentre * uAberration * 0.02;
      vec3 colour = vec3(
        texture2D(tDiffuse, vUv + shift).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - shift).b
      );
      colour *= 1.0 - uVignette * smoothstep(0.35, 0.85, length(fromCentre * vec2(1.1, 1.0)));
      colour += (hash(vUv * 900.0 + uTime) - 0.5) * 0.035;
      gl_FragColor = vec4(colour, 1.0);
    }`,
};

// Phones and tablets get a lighter render budget so they hold a steady frame rate.
export const isTouchDevice = matchMedia('(pointer: coarse)').matches;

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  private finish: ShaderPass;

  constructor(container: HTMLElement, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.5 : 2));
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    container.append(this.gl.domElement);

    this.composer = new EffectComposer(this.gl);
    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.82);
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.finish);

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.gl.setSize(w, h);
      this.composer.setPixelRatio(this.gl.getPixelRatio());
      this.composer.setSize(w, h);
      // Bloom is soft anyway, so render it at reduced resolution on mobile.
      if (isTouchDevice) this.bloom.resolution.set(w / 2, h / 2);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(container);
    resize();
  }

  set aberration(v: number) {
    this.finish.uniforms.uAberration.value = v;
  }

  render(time: number) {
    this.finish.uniforms.uTime.value = time % 100;
    this.composer.render();
  }
}
