// Generates the game's painted art with Replicate and writes it to public/assets/generated.
//
//   node scripts/generate-assets.mjs            # generate anything that's missing
//   node scripts/generate-assets.mjs logo hero  # (re)generate specific assets
//
// Needs REPLICATE_API_TOKEN in .env.local (gitignored).
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { download, root, run, runAll, selectTodo } from './lib/replicate.mjs';
import { ART_STYLE as STYLE, CUTOUT, GOLDFISH_RULES } from './lib/style.mjs';

const outDir = resolve(root, 'public/assets/generated');
const sprites = resolve(root, 'public/assets/sprites');

/** Upscaled pixel-art sprite as a data URI so the model can use our art as a reference. */
async function spriteRef(file, crop) {
  let img = sharp(resolve(sprites, file));
  if (crop) img = img.extract(crop);
  const png = await img.resize(512, 512, { kernel: 'nearest' }).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function jungleRef() {
  const jpg = await sharp(resolve(root, 'public/assets/background/jungle.jpg')).resize(1024).jpeg().toBuffer();
  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}

/** One of our own generated images, as a style reference for another. */
async function fileRef(name) {
  const jpg = await sharp(resolve(outDir, `${name}.webp`)).resize(1024).jpeg().toBuffer();
  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}

const parrot = () => spriteRef('birds.png', { left: 192, top: 192, width: 48, height: 48 });
const heli = () => spriteRef('helicopter.png');
const plane = () => spriteRef('spitfire.png');
const tank = () => spriteRef('tank.png');

const icon = (name, what) => ({
  name: `icon-${name}`,
  prompt: `${STYLE} A chunky round video game power-up badge icon: ${what}. Glossy, readable at small sizes, thick dark outline. ${CUTOUT}`,
  aspect: '1:1',
  cutout: true,
  size: 256,
});

const ASSETS = [
  {
    name: 'title-bg',
    prompt:
      `${STYLE} Wide cinematic key art for the title screen of a game, under a dramatic sunset sky. Composition, designed ` +
      'around the layout: the left 40% is calm, slightly darker jungle foliage and soft sky (a logo and button sit there). ' +
      'Right of centre, about 65% across and 35% down, the sun bursts through an open patch of sky with god rays; that area ' +
      'is completely clear of vehicles (a hero will be placed there). A goldfish army frames it and heads towards it: orange ' +
      'helicopters and green propeller fighter planes across the top right and the far right edge, and green tanks on a dirt ' +
      `road along the bottom right, like the reference sprites, in a lush jungle valley like the reference landscape. ${GOLDFISH_RULES} ` +
      'Lots of depth, atmospheric haze. No birds, no characters in the open sky, no text, no logo.',
    refs: [jungleRef, heli, plane, tank],
    aspect: '16:9',
    resolution: '2K',
    width: 1920,
  },
  {
    // Phones in portrait get their own composition rather than a centre-crop of the wide art.
    name: 'title-bg-portrait',
    prompt:
      `${STYLE} Tall portrait key art for a mobile game title screen, matching the style, palette and lighting of the ` +
      'reference title art. Composition, top to bottom: the upper half is an open, dramatic sunset sky with soft clouds and ' +
      'god rays radiating from a glowing point in the upper centre, and that upper-centre area is completely clear of ' +
      'vehicles (a hero will be placed there). A goldfish army closes in from the edges: a couple of orange helicopters and ' +
      'green propeller fighter planes at the far left and right edges in the middle distance, small enough to frame the empty ' +
      'centre, all heading inwards. In the lower third, green tanks roll along a winding dirt road through the jungle valley, ' +
      `fairly small and distant. The bottom fifth fades into dark, calm jungle foliage. ${GOLDFISH_RULES} ` +
      'No birds, no characters in the centre, no text, no logo.',
    refs: [() => fileRef('title-bg'), heli, plane, tank],
    aspect: '9:16',
    resolution: '2K',
    width: 1080,
  },
  {
    name: 'hero-parrot',
    prompt:
      `${STYLE} The hero: a small, fierce green parrot ninja (based on the reference sprite's colours) with a red ninja bandana mask ` +
      'tied around its eyes with long fluttering tails, wings spread mid-flight in a dynamic heroic pose, a swirl of icy blue energy ' +
      `gathering in front of its beak. ${CUTOUT}`,
    refs: [parrot],
    aspect: '1:1',
    cutout: true,
    width: 1024,
  },
  {
    name: 'goldfish-boss',
    prompt:
      `${STYLE} The villain: a grumpy, scheming orange goldfish general wearing a tiny military cap with medals, scowling, inside a ` +
      'sealed water-filled glass diving-helmet dome with a brass collar and rivets, bubbles rising. The whole fish, fins and tail ' +
      `stay inside the water and glass. Bust portrait. ${CUTOUT}`,
    aspect: '1:1',
    cutout: true,
    width: 512,
  },
  {
    name: 'logo',
    prompt:
      'A bold video game title logo that reads exactly "TEENAGE MUTANT NINJA PARROTS" stacked on three lines: "TEENAGE MUTANT" small ' +
      'on top, "NINJA" huge in the middle, "PARROTS" large underneath. Chunky hand-lettered display type, leaf-green to lime gradient fill ' +
      'with a thick dark outline, a red ninja bandana wrapped around the word NINJA, a few feathers and splashes of water. ' +
      'Indie game style, crisp and readable. On a plain flat pure white background, nothing else.',
    aspect: '16:9',
    cutout: true,
    width: 1400,
  },
  {
    name: 'ground',
    prompt:
      'Seamless tileable top-down texture of a stylised jungle floor seen from directly above: short grass, moss, small leaves, ' +
      'tiny flowers and a few pebbles, hand-painted indie game style, soft even lighting, no shadows from large objects, ' +
      'no horizon, no perspective, mid-tone green so sprites read clearly on top of it.',
    aspect: '1:1',
    width: 1024,
  },
  icon('spread', 'three blue icy energy bolts fanning out in a triangle'),
  icon('rapid', 'a lightning bolt over a stopwatch, electric yellow'),
  icon('homing', 'a glowing purple seeking missile curving towards a target crosshair'),
  icon('pierce', 'a sharp cyan ice spear piercing through two rings'),
  icon('bounce', 'a teal energy ball ricocheting off a wall with motion trails'),
  icon('heal', 'a red heart made of feathers with a sparkle'),
  icon('bomb', 'a round blue ice bomb with a frosty sparkling fuse'),
];

async function generate(asset) {
  const refs = (await Promise.all((asset.refs ?? []).map((r) => r()))).filter(Boolean);
  const url = await run('google/nano-banana-pro', {
    prompt: asset.prompt,
    image_input: refs,
    aspect_ratio: asset.aspect,
    resolution: asset.resolution ?? '1K',
    output_format: 'png',
    allow_fallback_model: true,
  });
  let buf = await download(url);
  if (asset.cutout) {
    const cut = await run('bria/remove-background', { image: `data:image/png;base64,${buf.toString('base64')}` });
    buf = await download(cut);
    // Trim the empty margin left behind by background removal.
    buf = await sharp(buf).trim().toBuffer();
  }
  const width = asset.size ?? asset.width;
  const file = fileFor(asset);
  await sharp(buf)
    .resize({ width, height: asset.size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 95 })
    .toFile(file);
  console.log(`✓ ${asset.name}`);
}

mkdirSync(outDir, { recursive: true });
const fileFor = (a) => resolve(outDir, `${a.name}.webp`);
await runAll(selectTodo(ASSETS, fileFor), generate);
