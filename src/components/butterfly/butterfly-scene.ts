import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * "Butterfly in a Garden" — scattered particles bloom into a butterfly
 * surrounded by flowers, then dissolve again (owner-supplied three.js export).
 *
 * Same maths as the original, but everything that doesn't depend on time is
 * precomputed once per particle, and instance matrices / colours are written
 * straight into their typed arrays, so a frame is a tight loop of a few sins.
 *
 *  full       — the /butterfly page: black sky, bloom, drag to orbit.
 *  background — Settings › Orqa fon: transparent, no bloom, fewer particles,
 *               no pointer input (the page underneath stays clickable).
 */
export type ButterflyOptions = { variant: 'full' | 'background'; count?: number };

const P = {
  cycle: 20,
  bScale: 30,
  scatterRadius: 300,
  drift: 0.46,
  flowerCount: 18,
  fieldSpread: 110,
  fieldCenterY: 15.6,
  flowerSize: 7.84,
  flapSpeed: 5.84,
  flapAmp: 0.573,
};
const DEG = Math.PI / 180;
const fract = (x: number) => x - Math.floor(x);

// Wing / tail lobes: [u upper bound, cx, cy, ea, eb, angle]. Past the last
// lobe and below 0.62 is the body; above 0.62 are the flowers.
const LOBES: [number, number, number, number, number, number][] = [
  [0.19344, 0.72, 0.52, 0.775, 0.425, 32 * DEG],
  [0.38688, -0.72, 0.52, 0.775, 0.425, -32 * DEG],
  [0.49476, 0.62, -0.28, 0.525, 0.35, -28 * DEG],
  [0.60264, -0.62, -0.28, 0.525, 0.35, 28 * DEG],
  [0.607476, 1.18, -0.62, 0.15, 0.055, -55 * DEG],
  [0.612312, -1.18, -0.62, 0.15, 0.055, 55 * DEG],
];

export function mountButterfly(host: HTMLElement, { variant, count }: ButterflyOptions) {
  const full = variant === 'full';
  const mobile = Math.min(host.clientWidth, host.clientHeight) < 700;
  const COUNT = count ?? (full ? (mobile ? 12000 : 20000) : mobile ? 5000 : 10000);

  const scene = new THREE.Scene();
  if (full) scene.fog = new THREE.FogExp2(0x000000, 0.01);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);

  const renderer = new THREE.WebGLRenderer({
    antialias: full,
    alpha: !full,
    powerPreference: full ? 'high-performance' : 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, full ? 2 : 1.5));
  renderer.setClearColor(0x000000, full ? 1 : 0);
  renderer.domElement.style.display = 'block';
  host.appendChild(renderer.domElement);

  const controls = full ? new OrbitControls(camera, renderer.domElement) : null;
  if (controls) controls.enableDamping = true;

  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (full) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.8, 0.4, 0);
    composer.addPass(bloom);
  }

  const geometry = new THREE.TetrahedronGeometry(full ? 0.25 : 0.35);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const c0 = new THREE.Color(0x00ff88);
  for (let i = 0; i < COUNT; i++) mesh.setColorAt(i, c0); // identity matrices by default
  mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const mat = mesh.instanceMatrix.array as Float32Array;
  const col = mesh.instanceColor!.array as Float32Array;

  // ---- Per-particle constants ----
  const sigma = P.scatterRadius / 3;
  const gauss = new Float32Array(COUNT * 3); // scatter-cloud point (σ-scaled)
  const drift = new Float32Array(COUNT); // drift phase
  const shimmer = new Float32Array(COUNT);
  const kind = new Uint8Array(COUNT); // 0 body, 1 wing, 2 flower
  const tgt = new Float32Array(COUNT * 3); // wing local x/y | flower field x/y/z
  const petal = new Float32Array(COUNT * 2);
  const fcol = new Float32Array(COUNT * 3);
  const pos = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    const u = i / COUNT;
    const gu1 = Math.max(1e-6, fract(Math.sin(i * 12.9898) * 43758.5453));
    const gu2 = fract(Math.sin(i * 78.233) * 12543.987);
    const gu3 = Math.max(1e-6, fract(Math.sin(i * 39.346) * 25563.641));
    const gu4 = fract(Math.sin(i * 54.716) * 31415.926);
    const r1 = Math.sqrt(-2 * Math.log(gu1));
    const r2 = Math.sqrt(-2 * Math.log(gu3));
    gauss[i * 3] = r1 * Math.cos(2 * Math.PI * gu2) * sigma;
    gauss[i * 3 + 1] = r1 * Math.sin(2 * Math.PI * gu2) * sigma;
    gauss[i * 3 + 2] = r2 * Math.cos(2 * Math.PI * gu4) * sigma;
    drift[i] = fract(Math.sin(i * 6.283) * 9999.123) * 2 * Math.PI;
    shimmer[i] = fract(Math.sin(i * 3.1415) * 4321.1234) * 2 * Math.PI;
    pos[i * 3] = (Math.random() - 0.5) * 100;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 100;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 100;

    if (u < 0.62) {
      let cx = 0, cy = -0.05, ea = 0.06, eb = 0.68, ang = 0, wing = 0;
      for (const l of LOBES) {
        if (u < l[0]) {
          [, cx, cy, ea, eb, ang] = l;
          wing = 1;
          break;
        }
      }
      const rf = Math.sqrt(fract(Math.sin(i * 91.345) * 10000));
      const phi = fract(Math.sin(i * 57.234) * 20000) * 2 * Math.PI;
      const lx = rf * ea * Math.cos(phi);
      const ly = rf * eb * Math.sin(phi);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      tgt[i * 3] = cx + lx * ca - ly * sa;
      tgt[i * 3 + 1] = cy + lx * sa + ly * ca;
      kind[i] = wing ? 1 : 0;
    } else {
      kind[i] = 2;
      const fi = Math.floor(((u - 0.62) / 0.38) * P.flowerCount);
      const theta = fract(Math.sin(i * 63.71) * 10000) * 2 * Math.PI;
      const rf2 = Math.sqrt(fract(Math.sin(i * 84.19) * 10000));
      const pr = Math.abs(Math.cos(5 * theta)) * P.flowerSize;
      petal[i * 2] = rf2 * pr * Math.cos(theta);
      petal[i * 2 + 1] = rf2 * pr * Math.sin(theta);
      const fTheta = fract(Math.sin(fi * 17.53 + 11.1) * 10000) * 2 * Math.PI;
      const cosPhi = fract(Math.sin(fi * 29.13 + 7.7) * 10000) * 2 - 1;
      const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
      const shellR = P.fieldSpread * (0.65 + 0.35 * fract(Math.sin(fi * 41.91 + 3.3) * 10000));
      tgt[i * 3] = shellR * sinPhi * Math.cos(fTheta);
      tgt[i * 3 + 1] = shellR * cosPhi + P.fieldCenterY;
      tgt[i * 3 + 2] = shellR * sinPhi * Math.sin(fTheta);
      // Yellow heart → pink petal tips.
      fcol[i * 3] = 0.976;
      fcol[i * 3 + 1] = 0.827 + (0.416 - 0.827) * rf2;
      fcol[i * 3 + 2] = 0.325 + (0.686 - 0.325) * rf2;
    }
  }

  // ---- Sizing: keep the whole butterfly in frame on portrait phones ----
  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    const aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (!controls || camera.position.lengthSq() === 0) {
      camera.position.set(0, 0, Math.max(100, 130 / (1.155 * aspect)));
    }
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    composer?.setSize(w, h);
    bloom?.resolution.set(w, h);
  };
  camera.position.set(0, 0, 0);
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // ---- Frame ----
  const clock = new THREE.Clock();
  let raf = 0;
  let running = false;

  const frame = () => {
    raf = requestAnimationFrame(frame);
    const time = clock.getElapsedTime();
    controls?.update();

    const phase = (time % P.cycle) / P.cycle;
    const progress = 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI);
    const flap = Math.sin(Math.sin(time * P.flapSpeed) * P.flapAmp * progress);
    const driftAmp = sigma * 0.08 * P.drift;
    const bfR = 0.243 + (0.91 - 0.243) * progress;
    const bfG = 0.651 + (0.639 - 0.651) * progress;
    const bfB = 1 + (0.239 - 1) * progress;
    const rot = time * 0.05;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const t2 = time * 2, t3 = time * 0.3, t25 = time * 0.25, t20 = time * 0.2;

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      const dp = drift[i];
      const sx = gauss[i3] + Math.sin(t3 + dp) * driftAmp;
      const sy = gauss[i3 + 1] + Math.cos(t25 + dp * 1.3) * driftAmp;
      const sz = gauss[i3 + 2] + Math.sin(t20 + dp * 0.7) * driftAmp;

      let bx: number, by: number, bz: number, r: number, g: number, b: number;
      if (kind[i] === 2) {
        bx = tgt[i3] + petal[i * 2] * progress;
        by = tgt[i3 + 1] + petal[i * 2 + 1] * progress;
        bz = tgt[i3 + 2];
        r = fcol[i3]; g = fcol[i3 + 1]; b = fcol[i3 + 2];
      } else {
        const wx = tgt[i3];
        bx = wx * P.bScale;
        by = tgt[i3 + 1] * P.bScale;
        bz = kind[i] === 1 ? Math.abs(wx) * flap * P.bScale : 0;
        r = bfR; g = bfG; b = bfB;
      }

      const px = sx + (bx - sx) * progress;
      const py = sy + (by - sy) * progress;
      const pz = sz + (bz - sz) * progress;
      const tx = px * cr - pz * sr;
      const tz = px * sr + pz * cr;

      // Ease toward the target (the original's lerp 0.1).
      const x = (pos[i3] += (tx - pos[i3]) * 0.1);
      const y = (pos[i3 + 1] += (py - pos[i3 + 1]) * 0.1);
      const z = (pos[i3 + 2] += (tz - pos[i3 + 2]) * 0.1);
      const m = i * 16;
      mat[m + 12] = x;
      mat[m + 13] = y;
      mat[m + 14] = z;

      const glow = 0.85 + 0.15 * Math.sin(t2 + shimmer[i]);
      col[i3] = Math.min(1, r * glow);
      col[i3 + 1] = Math.min(1, g * glow);
      col[i3 + 2] = Math.min(1, b * glow);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;

    if (composer) composer.render();
    else renderer.render(scene, camera);
  };

  const start = () => {
    if (running) return;
    running = true;
    clock.start();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  // Hidden tabs: stop burning the CPU (the clock restarts on return, which
  // just replays the cycle from the scattered cloud).
  const onVis = () => (document.visibilityState === 'hidden' ? stop() : start());
  document.addEventListener('visibilitychange', onVis);
  onVis();

  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVis);
    ro.disconnect();
    controls?.dispose();
    composer?.dispose();
    geometry.dispose();
    material.dispose();
    mesh.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
