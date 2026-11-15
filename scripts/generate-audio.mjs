// Generates music and sound effects with Replicate and writes them to public/assets/audio.
//
//   node scripts/generate-audio.mjs             # generate anything that's missing
//   node scripts/generate-audio.mjs sfx-hit     # (re)generate specific sounds
//
// Needs REPLICATE_API_TOKEN in .env.local (gitignored) and ffmpeg on the PATH.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { download, root, run, runAll, selectTodo } from './lib/replicate.mjs';
import { MUSIC_STYLE, SFX_STYLE } from './lib/style.mjs';

const outDir = resolve(root, 'public/assets/audio');

const music = (name, seconds, prompt, loop = true) => ({
  name,
  kind: 'music',
  seconds,
  prompt: `${MUSIC_STYLE} ${prompt}`,
  loop,
});
// `keep` is the most of the (silence-trimmed) generation we keep, in seconds.
const sfx = (name, seconds, keep, prompt) => ({ name, kind: 'sfx', seconds, keep, prompt: `${prompt}. ${SFX_STYLE}` });

const SOUNDS = [
  music(
    'music-title',
    75,
    'Title screen theme for a game about a ninja parrot defending the jungle from a goldfish army. 112 BPM, ' +
      'swaggering and heroic, whistled hook over ukulele and marimba, brass fanfare stabs, builds then settles so it loops cleanly.',
  ),
  music(
    'music-battle',
    110,
    'In-game battle loop. 140 BPM, driving and energetic: taiko and bongo grooves, slap bass, surf-rock guitar riffs and a ' +
      'chiptune lead trading phrases with marimba. Constant momentum, no long breakdowns or fade outs, loops cleanly.',
  ),
  music(
    'music-boss',
    90,
    'Boss battle loop against a pompous goldfish general. 150 BPM, comically menacing military march: oompah tuba, snare ' +
      'rolls, minor-key brass, bubbly underwater synth arpeggios. Tense and silly at once, loops cleanly.',
  ),
  music(
    'jingle-wave-clear',
    6,
    'A short triumphant victory fanfare stinger, 5 seconds, brass and marimba flourish, ending on a bright chord.',
    false,
  ),
  music(
    'jingle-game-over',
    7,
    'A short comedic game over stinger, 6 seconds, sad descending trombone and marimba, ending on a deflated note.',
    false,
  ),

  sfx('sfx-enemy-shot', 1, 0.4, 'A single wet underwater bubble blop as a toy cannon fires a bubble'),
  sfx('sfx-hit', 1, 0.3, 'A small metallic tink of a frozen pellet hitting a toy tin vehicle'),
  sfx('sfx-explode', 2, 1.4, 'A cartoon explosion: punchy boom with a glass dome shattering and a big water splash'),
  sfx('sfx-hurt', 1, 0.6, 'A startled cartoon parrot squawk of pain, short'),
  sfx('sfx-pickup', 2, 1.0, 'A sparkly magical power-up chime, quick ascending arpeggio on glockenspiel and harp'),
  sfx('sfx-dash', 1, 0.45, 'A fast feathery wing whoosh swoosh'),
  sfx('sfx-bomb', 3, 2.2, 'A huge icy freezing shockwave blast followed by shimmering crystal ice crackles'),
  sfx('sfx-glub', 1, 0.7, 'A comedic goldfish glub glub with small bubbles popping'),
  sfx('sfx-horn', 2, 1.6, 'A short comedic war horn blast played on a kazoo and tuba, signalling an attack'),
  sfx('sfx-click', 1, 0.15, 'A soft wooden UI click tick'),
  sfx('sfx-shoot', 1, 0.28, 'A single short bubbly icy pop as a parrot spits a frozen bubble, crisp crystalline plip'),
];

const fileFor = (s) => resolve(outDir, `${s.name}.mp3`);

function ffmpeg(...args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
}

function duration(file) {
  return Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString(),
  );
}

async function generate(sound) {
  const url =
    sound.kind === 'music'
      ? await run('elevenlabs/music', {
          prompt: sound.prompt,
          music_length_ms: sound.seconds * 1000,
          force_instrumental: true,
          output_format: 'wav_cd_quality',
        })
      : await run('stability-ai/stable-audio-2.5', { prompt: sound.prompt, duration: sound.seconds, steps: 8 });

  const tmp = mkdtempSync(join(tmpdir(), 'tmnp-audio-'));
  try {
    const raw = join(tmp, 'raw');
    writeFileSync(raw, await download(url));
    const out = fileFor(sound);

    if (sound.kind === 'sfx' && !sound.loop) {
      // Trim leading/trailing silence, keep the useful bit, fade the tail and normalise loudness.
      const trimSilence = 'silenceremove=start_periods=1:start_threshold=-40dB';
      const fadeAt = Math.max(0, sound.keep - 0.08);
      ffmpeg(
        '-i',
        raw,
        '-af',
        `${trimSilence},areverse,${trimSilence},areverse,atrim=end=${sound.keep},afade=t=out:st=${fadeAt}:d=0.08,loudnorm=I=-14:TP=-1`,
        '-ar',
        '44100',
        '-ac',
        '1',
        '-b:a',
        '96k',
        out,
      );
    } else if (sound.loop) {
      // Seamless loop: crossfade the tail into the intro, so the file ends exactly where it starts.
      const x = sound.kind === 'sfx' ? 1 : 3;
      ffmpeg(
        '-i',
        raw,
        '-filter_complex',
        `[0]asplit=2[s1][s2];[s1]atrim=start=${x},asetpts=PTS-STARTPTS[body];[s2]atrim=end=${x},asetpts=PTS-STARTPTS[head];` +
          `[body][head]acrossfade=d=${x}:c1=qsin:c2=qsin,loudnorm=I=-18:TP=-1.5[o]`,
        '-map',
        '[o]',
        '-ar',
        '44100',
        '-b:a',
        '128k',
        out,
      );
    } else {
      ffmpeg('-i', raw, '-af', 'afade=t=in:d=0.02,loudnorm=I=-16:TP=-1', '-ar', '44100', '-b:a', '128k', out);
    }
    console.log(`✓ ${sound.name} (${duration(out).toFixed(2)}s)`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

mkdirSync(outDir, { recursive: true });
await runAll(selectTodo(SOUNDS, fileFor), generate);
