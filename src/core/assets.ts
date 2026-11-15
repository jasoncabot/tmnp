import * as THREE from 'three';

export const UPGRADE_IDS = ['spread', 'rapid', 'homing', 'pierce', 'bounce', 'heal', 'bomb'] as const;
export type PickupId = (typeof UPGRADE_IDS)[number];

export const SOUND_IDS = [
  'boom',
  'sfx-shoot',
  'sfx-enemy-shot',
  'sfx-hit',
  'sfx-explode',
  'sfx-hurt',
  'sfx-pickup',
  'sfx-dash',
  'sfx-bomb',
  'sfx-glub',
  'sfx-horn',
  'sfx-click',
  'jingle-wave-clear',
  'jingle-game-over',
] as const;
export type SoundId = (typeof SOUND_IDS)[number];

export const MUSIC_IDS = ['music-title', 'music-battle', 'music-boss'] as const;
export type MusicId = (typeof MUSIC_IDS)[number];

export interface Assets {
  helicopter: HTMLImageElement;
  spitfire: HTMLImageElement;
  tank: HTMLImageElement;
  iceBlast: THREE.Texture;
  ground: THREE.Texture;
  icons: Record<PickupId, THREE.Texture>;
  sounds: Partial<Record<SoundId | MusicId, ArrayBuffer>>;
}

export const url = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;

export function iconUrl(id: PickupId) {
  return url(`generated/icon-${id}.webp`);
}

// The original recordings live in sounds/; everything else is generated into audio/.
const ORIGINAL_SOUNDS: Partial<Record<SoundId, string>> = { boom: 'sounds/boom.wav' };
const soundUrl = (id: SoundId | MusicId) => url(ORIGINAL_SOUNDS[id as SoundId] ?? `audio/${id}.mp3`);

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function texture(img: HTMLImageElement | HTMLCanvasElement) {
  const t = img instanceof HTMLCanvasElement ? new THREE.CanvasTexture(img) : new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** A painted-looking fallback in case the generated ground art is missing. */
function fallbackGround() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4f7f2f';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `hsl(${85 + Math.random() * 30}, 45%, ${25 + Math.random() * 25}%)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  return c;
}

function fallbackIcon(id: PickupId) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1b3a2b';
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 64px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(id[0].toUpperCase(), 64, 68);
  return c;
}

async function fetchBuffer(src: string) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Failed to load ${src}`);
  return res.arrayBuffer();
}

/** Loads everything the game needs, reporting progress from 0 to 1. Optional art falls back gracefully. */
export async function loadAssets(onProgress: (p: number) => void): Promise<Assets> {
  let done = 0;
  const jobs: Promise<unknown>[] = [];
  const track = <T>(p: Promise<T>) => {
    jobs.push(p);
    void p.finally(() => onProgress(++done / jobs.length)).catch(() => undefined);
    return p;
  };
  const optional = <T>(p: Promise<T>) => p.catch((e: Error) => (console.warn(e.message), null));

  const helicopter = track(loadImage(url('sprites/helicopter.png')));
  const spitfire = track(loadImage(url('sprites/spitfire.png')));
  const tank = track(loadImage(url('sprites/tank.png')));
  const iceBlast = track(loadImage(url('sprites/ice-blast.png')));
  const ground = track(optional(loadImage(url('generated/ground.webp'))));
  const icons = UPGRADE_IDS.map((id) => track(optional(loadImage(iconUrl(id)))));
  const sounds = [...SOUND_IDS, ...MUSIC_IDS].map((id) => track(optional(fetchBuffer(soundUrl(id)))));

  const groundTex = texture((await ground) ?? fallbackGround());
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.anisotropy = 8;

  const iconImgs = await Promise.all(icons);
  const soundBufs = await Promise.all(sounds);

  return {
    helicopter: await helicopter,
    spitfire: await spitfire,
    tank: await tank,
    iceBlast: texture(await iceBlast),
    ground: groundTex,
    icons: Object.fromEntries(UPGRADE_IDS.map((id, i) => [id, texture(iconImgs[i] ?? fallbackIcon(id))])) as Record<
      PickupId,
      THREE.Texture
    >,
    sounds: Object.fromEntries(
      [...SOUND_IDS, ...MUSIC_IDS].flatMap((id, i) => (soundBufs[i] ? [[id, soundBufs[i]]] : [])),
    ) as Assets['sounds'],
  };
}
