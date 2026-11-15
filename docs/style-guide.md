# Teenage Mutant Ninja Parrots: Asset Style Guide

The one-page reference for anyone making art, audio or UI for the game. The shared prompt fragments in
[`scripts/lib/style.mjs`](../scripts/lib/style.mjs) are the machine-readable version of this guide, so keep the two in sync.

## The pitch

A small, fierce green parrot ninja defends a sunny jungle from an invading **goldfish army** that drives tanks, flies
propeller fighter planes and pilots helicopters. The tone is **heroic but silly**. The stakes are played straight, the
premise is not. Think Saturday-morning cartoon, made by a small indie team that loves pixel art.

## Pillars

1. **Hand-made, not slick.** Painterly textures, bold ink outlines and a little wobble. Avoid glossy AAA rendering,
   photorealism and generic mobile-game gradients.
2. **Readable first.** Gameplay objects must pop against the ground. The world is mid-tone and slightly desaturated,
   and the action (ice, explosions, pickups) is bright and glowing.
3. **Rooted in the original sprites.** The 48×48 pixel sprites in `public/assets/sprites` set the colours and designs.
   2D art uses them as references. The goldfish vehicles become chunky "inflated voxel" models, while the parrot hero
   is a fuller, semi-realistic 3D model that keeps the sprite's colours.
4. **The goldfish world makes sense** on its own terms (see the rules below).

## Characters

| Character | Canon look |
| --- | --- |
| **Hero parrot** | A believable green parrot with stylised, cartoon proportions: leaf-green back, paler yellow-green belly and brighter crown. Green wings and tail with **blue-tipped flight feathers**, an orange hooked beak, side-set golden eyes, grey feet, and a **red ninja bandana** over the eyes with two long tails that stream behind. Its beak snaps open to spit **icy blue bubbles**. |
| **Goldfish crew** | Small orange goldfish (`#FF8018`), paler tail fins, big dark eyes, grumpy or determined. Always crew a vehicle. |
| **Goldfish general** (villain) | Scowling goldfish with a tiny military cap and medals, inside a brass-collared diving-helmet dome. |
| **Vehicles** | Orange helicopter, olive-green propeller fighter with roundels, olive-green tank. Toy-like proportions from the sprites. |

### Goldfish rules (non-negotiable)

- Every goldfish is **crewing a machine**. There are no loose or free-floating fishbowls and no open-topped bowls.
- Each fish sits **entirely inside a sealed, water-filled clear glass dome** built into the vehicle (cockpit canopy,
  turret hatch or helicopter cabin), with a **brass collar** where the dome meets the hull.
- **Every fin and tail stays inside the water and the glass.** Nothing pokes through or overlaps the dome edge.
- Fish are small relative to their vehicle, like a pilot.
- In 3D the same rule holds: `buildDome()` sizes the voxel fish to about 60% of the dome's diameter.

## Palette

| Role | Colour |
| --- | --- |
| Ink / outlines / UI shadow | `#10240F` |
| Leaf green (hero, primary UI) | `#7ED321`, dark `#2F6B1F` |
| Bandana red (hearts, danger) | `#D8262C` |
| Goldfish orange (enemies, score) | `#FF9A1F` |
| Ice blue (player shots, pickups) | `#9FF3FF` |
| Paper (text, buttons) | `#FFF8E6` |

Player effects are cool blues and whites. Enemy fire is warm orange bubbles. Never swap them: colour tells you who
fired.

## 2D art (title, portraits, icons)

- **Style:** hand-painted 2D indie game art, bold clean ink outlines, saturated jungle colours, soft cel shading with
  painterly texture.
- **Key art:** two compositions, each designed around the title layout rather than cropped from the other.
  - **Wide (`title-bg`):** calm foliage in the left 40% for the logo and Play button. An open sunburst at about 69% across
    and 35% down for the hero.
  - **Portrait (`title-bg-portrait`):** an open sunburst at about 30% down for the hero. Dark foliage at the bottom for the
    logo and Play button.
  - **Both:** the goldfish army frames the hero's space from the edges and heads towards it, never behind the hero.
    The hero art is placed over the sunburst with a warm rim glow.
- **Cut-outs** (hero, villain, logo): generated on flat white, then background-removed and trimmed.
- **Power-up icons:** chunky round badges with thick dark outlines, readable at 30 px.
- **Format:** `.webp` in `public/assets/generated/`. Key art 1920 px wide, cut-outs 512 to 1400 px, icons 256 px.

## 3D game world

- **Parrot:** a hand-built model (`src/game/parrot.ts`). It has a feathered body with soft scalloped detail, layered
  wings with individual feathers that flap, a fanned tail that spreads in turns, a hinged lower beak, and an ink outline
  on the solid parts. Preview it in dev at `/?preview`, or `/?preview=game` for the gameplay angle.
- **Ice bubbles:** the original `ice-blast` sprite as wobbling, glowing bubbles spat from the beak. They carry the parrot's
  momentum and burst into frost shards on impact. Frozen vehicles briefly slow down and frost over.
- **Voxel vehicles:** sprites become 3D with `voxelize()`. Each pixel is a cube column, "inflated" with a rounded
  profile so silhouettes look like plush toys. Keep the voxels chunky; never smooth them.
- **Environment:** low-poly flat-shaded trees and painted ground, warm sun with real shadows, and drifting cloud
  shadows. The ground is tinted down so it never competes with the action.
- **Camera:** about 45° from above, following the parrot.
- **Juice:** bloom on bright effects, voxel debris in the model's own colours, water splash and glass on every kill,
  screen shake, hit-stop and a subtle vignette with film grain.

## UI

- **Fonts:** **Bungee** for display text (titles, numbers, buttons) and **Space Grotesk** for body text. Both are
  bundled locally.
- **Buttons:** chunky, with paper or leaf fill, a 3 px ink border and a hard ink drop shadow that pushes in on press.
- **HUD:** sits on the edges and respects safe areas. Text carries a 2 px ink shadow so it reads on any background.
- **Touch:** twin floating sticks. The left half moves; the right half aims and fires while held. Dash and Bomb
  buttons are at least 72 px across. Control hints show at the start of a run.

## Audio

- **Music:** instrumental. Organic jungle percussion (marimba, bongos, shakers, log drums) with warm retro synths and a
  cheeky brass section. Bright, punchy and catchy. Tracks are seamless loops (the tail is crossfaded into the intro).
  - Title is 112 BPM and swaggering. Battle is 140 BPM and driving. Boss is 150 BPM, a comic military march.
- **Sound effects:** cartoon, punchy, dry with no reverb tail. Player sounds are crystalline and icy. Goldfish sounds
  are wet and bubbly.
- **Signature sound, never replace it:** `public/assets/sounds/boom.wav` is the explosion. It plays on every goldfish
  vehicle destroyed. Generated splash and glass layers may sit *underneath* it, quietly.
- **Mix:** music around -18 LUFS, sound effects around -14 LUFS. Music ducks under jingles.

## Generating assets

```sh
# needs REPLICATE_API_TOKEN in .env.local (gitignored) and ffmpeg for audio
node scripts/generate-assets.mjs              # images: only what's missing
node scripts/generate-assets.mjs title-bg     # regenerate one image
node scripts/generate-audio.mjs               # music and sfx: only what's missing
node scripts/generate-audio.mjs sfx-shoot     # regenerate one sound
```

| Asset type | Model |
| --- | --- |
| Images | `google/nano-banana-pro`, with the original sprites as references |
| Cut-outs | `bria/remove-background` |
| Music | `elevenlabs/music` |
| Sound effects | `stability-ai/stable-audio-2.5` |

**Always review generated art against the goldfish rules before committing it.**
