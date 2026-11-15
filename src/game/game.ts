import * as THREE from 'three';
import { type Assets, type PickupId } from '../core/assets';
import { SoundSystem } from '../core/audio';
import { Input } from '../core/input';
import { Renderer } from '../core/renderer';
import { storage } from '../core/storage';
import { Hud } from '../ui/hud';
import { Effects, softDot } from './effects';
import { Enemy, Pickup, Player, headingOf, turnTowards } from './entities';
import { buildModels, type Models, type VehicleKind } from './models';
import {
  AIM_ASSIST,
  PICKUPS,
  SHOT_INERTIA,
  SHOT_SPEED,
  emptyWeapon,
  fireInterval,
  volleyAngles,
  type UpgradeId,
  type WeaponLevels,
} from './weapons';
import { ARENA, FLIGHT_HEIGHT, World } from './world';

const MAX_HEARTS = 5;
const PLAYER_RADIUS = 1.3;
const PLAYER_MAX_SPEED = 15;
const PLAYER_ACCEL = 60;
/** Drag while steering, and the much stronger drag that brings the parrot to a quick hover when you let go. */
const DRAG_MOVING = 2;
const DRAG_STOPPING = 7;
const TURN_RATE = 16;
const DASH_SPEED = 42;
const DASH_TIME = 0.16;
const DASH_COOLDOWN = 0.7;

/*
 * Hidden techniques, deliberately never explained in the game:
 *
 * Flick: snap the movement input to the opposite direction right as a dash ends (the window opens 0.06s before the
 * end and closes 0.08s after). The parrot barrel-rolls into a faster dash the new way and the dash recharges almost
 * at once, so up to three flicks chain into a zig-zag escape. Reversing too early spoils it.
 *
 * Graze: let a goldfish bubble skim past during a dash. Time slows for a moment, the dash refunds, and the parrot
 * fires twice as fast for a short burst (its shots turn gold).
 */
const FLICK_EARLY = 0.06;
const FLICK_LATE = 0.08;
const FLICK_ANGLE = THREE.MathUtils.degToRad(110);
const FLICK_SPEED = DASH_SPEED * 1.15;
const FLICK_CHAIN = 3;
const GRAZE_RADIUS = 1.7;
const FRENZY_TIME = 1.6;
const COMBO_WINDOW = 2.5;
const CAMERA_OFFSET = new THREE.Vector3(0, 25, 23);

type State = 'title' | 'playing' | 'paused' | 'over';

interface Shot {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  pierce: number;
  bounces: number;
  homing: number;
  hit: Set<Enemy>;
  seed: number;
}

interface EnemyShot {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  grazed?: boolean;
}

function bubbleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 8, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.25)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.5)');
  grad.addColorStop(0.9, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.ellipse(22, 20, 7, 4, -0.6, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Game {
  private world: World;
  private camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400);
  private renderer: Renderer;
  private sound: SoundSystem;
  private input: Input;
  private hud: Hud;
  private models: Models;
  private effects: Effects;
  private timer = new THREE.Timer();
  private raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLIGHT_HEIGHT);
  private bubble = bubbleTexture();

  private state: State = 'title';
  private time = 0;
  private hitstop = 0;
  private trauma = 0;
  private cameraFocus = new THREE.Vector3();

  private player: Player;
  private hearts = MAX_HEARTS;
  private bombs = 1;
  private weapon: WeaponLevels = emptyWeapon();
  private invulnerable = 0;
  private dashTime = 0;
  private dashCooldown = 0;
  private dashDir = new THREE.Vector3();
  /** Seconds since the dash ended, while a flick is still possible. */
  private dashGrace = 0;
  private flickChain = 0;
  private flickReversed = false;
  private flickSpoiled = false;
  private slowmo = 0;
  private frenzy = 0;
  private aim = new THREE.Vector3(1, 0, 0);
  private fireCooldown = 0;
  /** Kicks to 1 on every shot and decays: the beak snaps open as each ice bubble flies out. */
  private beakKick = 0;
  private shots: Shot[] = [];
  /** Seconds the player has spent flying and firing; the control hints hide once they've got the hang of it. */
  private coachTime = 0;

  private enemies: Enemy[] = [];
  private enemyShots: EnemyShot[] = [];
  private pickups: Pickup[] = [];
  private spawnQueue: { kind: VehicleKind; at: number }[] = [];

  private level = 0;
  private score = 0;
  private best = Number(storage.get('best') ?? 0);
  private combo = 0;
  private comboTimer = 0;
  private kills = 0;
  private waveBreak = 0;

  constructor(
    container: HTMLElement,
    private assets: Assets,
  ) {
    this.world = new World(assets);
    this.renderer = new Renderer(container.querySelector('#stage')!, this.world.scene, this.camera);
    this.sound = new SoundSystem(assets);
    this.input = new Input(container.querySelector('#touch')!);
    this.models = buildModels(assets);
    this.effects = new Effects(this.world.scene);
    this.player = new Player(softDot());
    this.world.scene.add(this.player.root, this.player.marker);
    this.hud = new Hud(container.querySelector('#ui')!, {
      play: () => this.start(),
      resume: () => this.setState('playing'),
      quit: () => this.toTitle(),
      dash: () => this.input.trigger('dash'),
      bomb: () => this.input.trigger('bomb'),
      mute: () => this.hud.setMuted(this.sound.toggleMute()),
    });
    this.hud.setMuted(this.sound.muted);
    this.toTitle();
    this.renderer.gl.setAnimationLoop(() => this.frame());

    // Dev-only hook used by automated playtests.
    if (import.meta.env.DEV) {
      Object.assign(window, {
        __tmnp: {
          game: this,
          state: () => ({
            state: this.state,
            level: this.level,
            score: this.score,
            hearts: this.hearts,
            kills: this.kills,
            weapon: { ...this.weapon },
            pickups: this.pickups.length,
            shots: this.shots.length,
            aimMode: this.input.aimMode,
          }),
          enemies: () =>
            this.enemies.map((e) => ({ kind: e.kind, ...this.project(e.position.clone().setY(FLIGHT_HEIGHT)) })),
          pickups: () => this.pickups.map((p) => this.project(p.root.position)),
          player: () => this.project(this.player.position),
        },
      });
    }
  }

  // ---------------------------------------------------------------- flow

  private setState(state: State) {
    this.state = state;
    if (state !== 'playing') this.hud.coach(false);
    this.hud.show(state);
    this.input.clear();
  }

  private toTitle() {
    this.clearField();
    this.setState('title');
    this.hud.setBest(this.best);
    this.sound.music('music-title');
  }

  private start() {
    this.clearField();
    this.hearts = MAX_HEARTS;
    this.bombs = 1;
    this.weapon = emptyWeapon();
    this.score = 0;
    this.combo = 0;
    this.kills = 0;
    this.level = 0;
    this.player.position.set(0, FLIGHT_HEIGHT, 8);
    this.player.velocity.set(0, 0, 0);
    this.player.heading = -Math.PI / 2;
    this.invulnerable = 1.5;
    this.frenzy = 0;
    this.slowmo = 0;
    this.dashTime = 0;
    this.dashGrace = 0;
    this.setState('playing');
    this.coachTime = 0;
    this.hud.coach(true);
    this.sound.music('music-battle');
    this.nextWave();
    this.syncHud();
  }

  private clearField() {
    for (const e of this.enemies) this.removeEnemy(e);
    for (const s of this.shots) this.world.scene.remove(s.sprite);
    for (const s of this.enemyShots) this.world.scene.remove(s.sprite);
    for (const p of this.pickups) this.world.scene.remove(p.root);
    this.enemies = [];
    this.shots = [];
    this.enemyShots = [];
    this.pickups = [];
    this.spawnQueue = [];
  }

  private nextWave() {
    this.level++;
    const count = Math.min(26, 3 + this.level * 2);
    const kinds: VehicleKind[] = this.level === 1 ? ['tank', 'helicopter'] : ['tank', 'helicopter', 'plane'];
    for (let i = 0; i < count; i++) {
      this.spawnQueue.push({ kind: kinds[Math.floor(Math.random() * kinds.length)], at: this.time + 1.2 + i * 0.55 });
    }
    this.hud.banner(
      `Wave ${this.level}`,
      this.level === 1 ? 'The goldfish army attacks!' : `${count} goldfish incoming`,
    );
    this.sound.play('sfx-horn', { volume: 0.7 });
    this.syncHud();
  }

  private gameOver() {
    this.best = Math.max(this.best, this.score);
    storage.set('best', String(this.best));
    this.hud.gameOver(this.score, this.best, this.level);
    this.setState('over');
    this.sound.music(null);
    this.sound.jingle('jingle-game-over');
  }

  // ---------------------------------------------------------------- loop

  private frame() {
    this.timer.update();
    const raw = Math.min(this.timer.getDelta(), 1 / 20);
    this.input.update();
    if (this.input.consume('mute')) this.hud.setMuted(this.sound.toggleMute());

    if (this.state === 'playing' && this.input.consume('pause')) this.setState('paused');
    else if (this.state === 'paused' && this.input.consume('pause')) this.setState('playing');
    else if ((this.state === 'title' || this.state === 'over') && this.input.consume('confirm')) this.start();

    let dt = raw;
    if (this.hitstop > 0) {
      this.hitstop -= raw;
      dt = raw * 0.08;
    } else if (this.slowmo > 0) {
      this.slowmo -= raw;
      dt = raw * 0.3;
    }
    if (this.state === 'paused') dt = 0;
    this.time += dt;

    if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'title') this.updateAttract(dt);
    else this.updateEnemies(dt, false);

    this.effects.update(dt);
    const firing = this.state === 'playing' && this.input.firing;
    this.beakKick = Math.max(0, this.beakKick - dt * 9);
    const beak = Math.max(firing ? 0.3 : 0, this.beakKick);
    this.player.animate(dt, this.time, this.invulnerable > 0 && Math.floor(this.time * 20) % 2 === 0, beak);
    for (const e of this.enemies) e.animate(dt, this.time);
    this.pickups = this.pickups.filter((p) => p.update(dt, this.time) || (this.world.scene.remove(p.root), false));

    this.updateCamera(raw);
    this.world.update(dt, this.cameraFocus);
    this.renderer.aberration = Math.max(0, this.invulnerable - 0.9) * 1.2;
    this.renderer.render(this.time);
  }

  /** Behind the title screen, the camera drifts over the battlefield. */
  private updateAttract(dt: number) {
    this.player.position.x = Math.sin(this.time * 0.2) * 12;
    this.player.position.z = Math.cos(this.time * 0.15) * 8;
    this.player.heading += dt * 0.3;
    if (this.enemies.length < 6) this.spawnEnemy((['tank', 'helicopter', 'plane'] as const)[this.enemies.length % 3]);
    this.updateEnemies(dt, false);
  }

  private updatePlaying(dt: number) {
    this.updatePlayer(dt);
    this.updateShots(dt);
    if (this.coachTime < 4) {
      if (this.input.firing || this.player.velocity.lengthSq() > 4) this.coachTime += dt;
      if (this.coachTime >= 4 || this.level > 1) {
        this.coachTime = 4;
        this.hud.coach(false);
      }
    }
    this.updateEnemies(dt, true);
    this.updateEnemyShots(dt);
    this.updatePickups();

    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.time) this.spawnEnemy(this.spawnQueue.shift()!.kind);

    this.comboTimer -= dt;
    if (this.comboTimer <= 0 && this.combo) {
      this.combo = 0;
      this.syncHud();
    }

    if (!this.enemies.length && !this.spawnQueue.length) {
      if (this.waveBreak <= 0) {
        this.waveBreak = 3;
        this.hud.banner('Wave clear!', `+${this.level * 250} bonus`);
        this.score += this.level * 250;
        this.sound.jingle('jingle-wave-clear');
        this.syncHud();
      } else if ((this.waveBreak -= dt) <= 0) {
        this.nextWave();
      }
    }
  }

  // ---------------------------------------------------------------- player

  private updatePlayer(dt: number) {
    const { player, input } = this;
    // Screen up is world -Z for this camera.
    const move = new THREE.Vector3(input.move.x, 0, -input.move.y);
    const cursor = input.aimMode === 'pointer' ? this.cursorOnFlightPlane() : undefined;
    if (input.thrust && cursor) {
      // Mouse-only flying: hold right-click to fly towards the cursor, easing off as you arrive.
      const d = cursor.clone().sub(player.position).setY(0);
      if (d.length() > 1.5) move.copy(d).setLength(Math.min(1, d.length() / 6));
    }

    this.dashCooldown -= dt;
    if (input.consume('dash') && this.dashCooldown <= 0) {
      const dir = move.lengthSq() > 0.01 ? move.clone().normalize() : this.aim.clone();
      this.startDash(dir, DASH_SPEED);
      this.flickChain = 0;
      this.dashCooldown = DASH_COOLDOWN;
      this.sound.play('sfx-dash', { vary: 150 });
    }
    this.checkFlick(move);

    // Accelerate while steering; let go and strong drag brings the parrot to a hover within about half a second.
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      if (this.dashTime <= 0) this.dashGrace = FLICK_LATE;
    } else {
      this.dashGrace -= dt;
      const steering = move.lengthSq() > 0.01;
      player.velocity.addScaledVector(move, PLAYER_ACCEL * dt);
      player.velocity.multiplyScalar(Math.exp(-dt * (steering ? DRAG_MOVING : DRAG_STOPPING)));
      if (player.velocity.length() > PLAYER_MAX_SPEED) player.velocity.setLength(PLAYER_MAX_SPEED);
    }
    player.position.addScaledVector(player.velocity, dt);
    player.position.x = THREE.MathUtils.clamp(player.position.x, -ARENA.x, ARENA.x);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -ARENA.z, ARENA.z);

    // Aim is independent of movement: the cursor, the right stick / thumb, or else the way you're flying.
    if (cursor) {
      const d = cursor.sub(player.position).setY(0);
      if (d.lengthSq() > 0.2) this.aim.copy(d.normalize());
    } else if (input.aimMode === 'stick') {
      this.aim.copy(this.assist(new THREE.Vector3(input.aimStick.x, 0, -input.aimStick.y)));
    } else if (move.lengthSq() > 0.01) {
      this.aim.copy(this.assist(move.clone().normalize()));
    }
    player.heading = turnTowards(player.heading, headingOf(this.aim.x, this.aim.z), dt * TURN_RATE);

    this.invulnerable -= dt;
    this.fireCooldown -= dt;
    this.frenzy -= dt;
    if (input.firing && this.fireCooldown <= 0) {
      this.fireCooldown = fireInterval(this.weapon) * (this.frenzy > 0 ? 0.5 : 1);
      this.fireVolley();
    }
    if (input.consume('bomb')) this.frostBomb();
  }

  private startDash(dir: THREE.Vector3, speed: number) {
    this.dashDir.copy(dir).normalize();
    this.player.velocity.copy(this.dashDir).multiplyScalar(speed);
    this.dashTime = DASH_TIME;
    this.dashGrace = 0;
    this.flickReversed = false;
    this.flickSpoiled = false;
    this.invulnerable = Math.max(this.invulnerable, DASH_TIME + 0.1);
    for (let i = 0; i < 6; i++) {
      this.effects.puff(this.player.position, {
        colour: 0x9ff3ff,
        size: 1.6,
        life: 0.4,
        additive: true,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4),
      });
    }
  }

  /** The flick: reverse the stick at the very end of a dash to chain into another, faster one. */
  private checkFlick(move: THREE.Vector3) {
    const dashing = this.dashTime > 0 || this.dashGrace > 0;
    if (!dashing || this.flickSpoiled) return;
    const reversed = move.lengthSq() > 0.25 && move.angleTo(this.dashDir) > FLICK_ANGLE;
    if (reversed && !this.flickReversed) {
      const inWindow = this.dashTime <= FLICK_EARLY;
      if (!inWindow || this.flickChain >= FLICK_CHAIN) {
        this.flickSpoiled = true; // too early: this dash can't be flicked any more
      } else {
        const turn = Math.sign(new THREE.Vector3().crossVectors(this.dashDir, move).y) || 1;
        this.flickChain++;
        this.startDash(move.clone().normalize(), FLICK_SPEED);
        this.invulnerable = Math.max(this.invulnerable, DASH_TIME + 0.2);
        this.dashCooldown = this.flickChain >= FLICK_CHAIN ? DASH_COOLDOWN : 0.2;
        this.player.barrelRoll(turn);
        this.hitstop = Math.max(this.hitstop, 0.03);
        this.sound.play('sfx-dash', { rate: 1.15 + this.flickChain * 0.12, volume: 0.9 });
        this.effects.shatter(
          this.player.position,
          [new THREE.Color(0x5fbf3a), new THREE.Color(0x2f8f2a), new THREE.Color(0x1d5fb5)],
          8,
          6,
          0.12,
        );
        return;
      }
    }
    this.flickReversed = reversed;
  }

  /** A goldfish bubble skimmed past mid-dash. */
  private graze(at: THREE.Vector3) {
    if (this.slowmo > 0) return;
    this.slowmo = 0.28;
    this.dashCooldown = 0;
    this.frenzy = FRENZY_TIME;
    this.sound.play('sfx-dash', { rate: 1.7, volume: 0.6 });
    this.sound.play('sfx-hit', { rate: 1.8, volume: 0.5 });
    this.effects.puff(at, { colour: 0xffe08a, size: 2, life: 0.3, additive: true, grow: 4 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.effects.puff(this.player.position, {
        colour: 0xffe9a8,
        size: 0.8,
        life: 0.35,
        additive: true,
        vel: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(14),
        grow: 0.5,
      });
    }
  }

  private cursorOnFlightPlane() {
    this.raycaster.setFromCamera(this.input.pointer, this.camera);
    return this.raycaster.ray.intersectPlane(this.aimPlane, new THREE.Vector3()) ?? undefined;
  }

  /** Sticks and thumbs are imprecise, so nudge their aim onto a goldfish if one is only a few degrees off. */
  private assist(dir: THREE.Vector3) {
    let best: THREE.Vector3 | undefined;
    let bestAngle = AIM_ASSIST;
    for (const e of this.enemies) {
      if (!e.alive || e.entering > 1) continue;
      const d = e.position.clone().sub(this.player.position).setY(0);
      if (d.length() > 28) continue;
      const angle = d.angleTo(dir);
      if (angle < bestAngle) {
        bestAngle = angle;
        best = d.normalize();
      }
    }
    return best ?? dir;
  }

  // ---------------------------------------------------------------- ice shots

  /** Spits a volley of ice bubbles from the beak. Each one keeps some of the parrot's momentum. */
  private fireVolley() {
    const base = headingOf(this.aim.x, this.aim.z);
    const mouth = this.player.model.mouth();
    mouth.y = FLIGHT_HEIGHT;
    const tint = this.frenzy > 0 ? 0xffe39a : this.weapon.homing ? 0xd9c4ff : this.weapon.pierce ? 0xc4fff8 : 0xffffff;
    const inherited = this.player.velocity.clone().multiplyScalar(SHOT_INERTIA);
    for (const a of volleyAngles(this.weapon)) {
      const angle = base + a + (Math.random() - 0.5) * 0.05;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.assets.iceBlast,
          color: tint,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      sprite.scale.setScalar(2.4);
      sprite.position.copy(mouth);
      this.world.scene.add(sprite);
      this.shots.push({
        sprite,
        vel: new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(SHOT_SPEED).add(inherited),
        life: 0.95 + this.weapon.bounce * 0.5,
        pierce: this.weapon.pierce,
        bounces: this.weapon.bounce,
        homing: this.weapon.homing,
        hit: new Set(),
        seed: Math.random() * 10,
      });
    }
    this.beakKick = 1;
    this.sound.play('sfx-shoot', { volume: 0.45, vary: 150 });
  }

  private updateShots(dt: number) {
    this.shots = this.shots.filter((s) => {
      s.life -= dt;
      const p = s.sprite.position;
      if (s.homing) {
        const target = this.nearestEnemy(p, 26, s.hit);
        if (target) {
          const speed = s.vel.length();
          const want = target.position.clone().sub(p).setY(0).setLength(speed);
          s.vel.lerp(want, Math.min(1, dt * 2.2 * s.homing)).setLength(speed);
        }
      }
      p.addScaledVector(s.vel, dt);
      p.y = FLIGHT_HEIGHT;
      // Bubbles wobble as they fly and grow a little before they burst.
      const wobble = Math.sin(this.time * 30 + s.seed) * 0.15;
      s.sprite.scale.set(2.4 + wobble, 2.4 - wobble, 1).multiplyScalar(1 + (1 - Math.min(1, s.life)) * 0.25);

      if (Math.abs(p.x) > ARENA.x + 4 || Math.abs(p.z) > ARENA.z + 4) {
        if (s.bounces-- <= 0) s.life = 0;
        else if (Math.abs(p.x) > ARENA.x + 4) s.vel.x *= -1;
        else s.vel.z *= -1;
      }

      for (const e of this.enemies) {
        if (s.life <= 0 || !e.alive || s.hit.has(e)) continue;
        if (flatDistance(p, e.position) > e.stats.radius + 0.5) continue;
        s.hit.add(e);
        e.frozen = Math.max(e.frozen, 0.3);
        this.damageEnemy(e, 1);
        this.frostImpact(p);
        if (s.pierce-- <= 0) s.life = 0;
      }

      // Ice bubbles and goldfish bubbles cancel each other out.
      for (const b of this.enemyShots) {
        if (s.life <= 0 || flatDistance(p, b.sprite.position) > 1.1) continue;
        b.life = 0;
        s.life = 0;
        this.effects.puff(b.sprite.position, { colour: 0xffc890, size: 1.6, life: 0.25, additive: true, grow: 3 });
      }

      if (s.life > 0) return true;
      this.effects.puff(p, { colour: 0xbff6ff, size: 1.4, life: 0.2, additive: true, grow: 2 });
      this.world.scene.remove(s.sprite);
      s.sprite.material.dispose();
      return false;
    });
  }

  private frostImpact(at: THREE.Vector3) {
    this.effects.puff(at, { colour: 0xbff6ff, size: 2.4, life: 0.18, additive: true, grow: 3 });
    this.effects.shatter(
      at,
      [new THREE.Color(0xe6fcff), new THREE.Color(0x9fe8ff), new THREE.Color(0x5cc8f0)],
      3,
      7,
      0.14,
    );
  }

  private frostBomb() {
    if (this.bombs <= 0) return;
    this.bombs--;
    this.syncHud();
    const at = this.player.position;
    this.sound.play('sfx-bomb');
    this.trauma = Math.min(1, this.trauma + 0.8);
    this.hitstop = 0.08;
    this.invulnerable = Math.max(this.invulnerable, 0.6);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.effects.puff(at, {
        colour: 0x9ff3ff,
        size: 3,
        life: 0.7,
        additive: true,
        vel: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(40),
        grow: 1,
      });
    }
    this.effects.puff(at, { colour: 0xe0ffff, size: 10, life: 0.35, additive: true, grow: 6 });
    this.enemyShots = this.enemyShots.filter((s) =>
      s.sprite.position.distanceTo(at) < 26 ? (this.world.scene.remove(s.sprite), false) : true,
    );
    for (const e of this.enemies) {
      if (flatDistance(e.position, at) < 22) this.damageEnemy(e, 6);
    }
  }

  private hurtPlayer() {
    if (this.invulnerable > 0) return;
    this.hearts--;
    this.invulnerable = 1.4;
    this.combo = 0;
    this.trauma = Math.min(1, this.trauma + 0.7);
    this.hitstop = 0.1;
    this.sound.play('sfx-hurt', { vary: 100 });
    this.effects.shatter(
      this.player.position,
      [new THREE.Color(0x5fbf3a), new THREE.Color(0x3c8c25), new THREE.Color(0xd8262c)],
      18,
      8,
      0.15,
    );
    this.syncHud();
    if (this.hearts <= 0) this.gameOver();
  }

  // ---------------------------------------------------------------- enemy fire

  private updateEnemyShots(dt: number) {
    const pp = this.player.position;
    this.enemyShots = this.enemyShots.filter((s) => {
      s.life -= dt;
      const p = s.sprite.position;
      p.addScaledVector(s.vel, dt);
      p.y = THREE.MathUtils.lerp(p.y, FLIGHT_HEIGHT, Math.min(1, dt * 5));
      s.sprite.scale.setScalar(1.3 + Math.sin(this.time * 20 + p.x) * 0.1);
      const d = flatDistance(p, pp);
      if (!s.grazed && this.dashTime > 0 && d < PLAYER_RADIUS + GRAZE_RADIUS) {
        s.grazed = true;
        this.graze(p);
      }
      if (d < PLAYER_RADIUS + 0.45 && this.invulnerable <= 0) {
        this.hurtPlayer();
        s.life = 0;
      }
      if (s.life > 0) return true;
      this.world.scene.remove(s.sprite);
      return false;
    });
  }

  private enemyFire(e: Enemy, dir: THREE.Vector3, speed: number) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.bubble,
        color: 0xff8a3c,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sprite.position.copy(e.position).addScaledVector(dir, e.stats.radius);
    sprite.position.y = e.stats.altitude + 1.2;
    this.world.scene.add(sprite);
    this.enemyShots.push({ sprite, vel: dir.clone().setY(0).normalize().multiplyScalar(speed), life: 4 });
    this.sound.play('sfx-enemy-shot', { volume: 0.4, vary: 200 });
  }

  // ---------------------------------------------------------------- enemies

  private spawnEnemy(kind: VehicleKind) {
    const e = new Enemy(this.models, kind, Math.max(1, this.level));
    // Arrive from just beyond a random edge of the arena.
    const side = Math.floor(Math.random() * 4);
    const along = Math.random() * 2 - 1;
    const x = side < 2 ? along * ARENA.x : (side === 2 ? -1 : 1) * (ARENA.x + 12);
    const z = side < 2 ? (side === 0 ? -1 : 1) * (ARENA.z + 12) : along * ARENA.z;
    e.position.set(x, kind === 'helicopter' ? 22 : e.stats.altitude, z);
    e.heading = headingOf(-x, -z);
    e.goal.set(along * 20, 0, along * 10);
    this.enemies.push(e);
    this.world.scene.add(e.root, e.marker);
  }

  private removeEnemy(e: Enemy) {
    this.world.scene.remove(e.root, e.marker);
    e.dispose();
  }

  private nearestEnemy(from: THREE.Vector3, range: number, exclude?: Set<Enemy>) {
    let best: Enemy | undefined;
    let bestD = range;
    for (const e of this.enemies) {
      if (!e.alive || exclude?.has(e)) continue;
      const d = flatDistance(from, e.position);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private updateEnemies(dt: number, hostile: boolean) {
    const pp = this.player.position;
    for (const e of this.enemies) {
      const toPlayer = pp.clone().sub(e.position).setY(0);
      const dist = toPlayer.length();
      toPlayer.normalize();
      e.entering -= dt;
      e.goalTimer -= dt;
      e.fireTimer -= dt;

      if (e.kind === 'tank') {
        // Trundle to a firing position near the player, turn to face them, fire shells.
        if (e.goalTimer <= 0) {
          const a = Math.random() * Math.PI * 2;
          e.goal.set(pp.x + Math.cos(a) * 16, 0, pp.z + Math.sin(a) * 12);
          e.goalTimer = 3 + Math.random() * 2;
        }
        const toGoal = e.goal.clone().sub(e.position).setY(0);
        const facePlayer = toGoal.length() < 3;
        const want = facePlayer ? headingOf(toPlayer.x, toPlayer.z) : headingOf(toGoal.x, toGoal.z);
        e.heading = turnTowards(e.heading, want, e.stats.turn * dt);
        const forward = new THREE.Vector3(Math.cos(e.heading), 0, Math.sin(e.heading));
        e.velocity.copy(forward).multiplyScalar(facePlayer ? 0 : e.stats.speed);
        const aligned = forward.dot(toPlayer) > 0.94;
        if (hostile && aligned && dist < 34 && e.fireTimer <= 0) {
          e.fireTimer = e.stats.fireEvery;
          this.enemyFire(e, forward, 13 + this.level * 0.5);
          this.effects.puff(e.position.clone().addScaledVector(forward, 2.6).setY(1.6), {
            colour: 0xaaaaaa,
            size: 1.5,
            life: 0.6,
          });
        }
        if (Math.random() < dt * 6 && e.velocity.lengthSq() > 1) {
          this.effects.puff(e.position.clone().setY(0.3), {
            colour: 0x9a8466,
            size: 1,
            life: 0.8,
            grow: 1.5,
            fade: 0.5,
          });
        }
      } else if (e.kind === 'helicopter') {
        // Hover at a stand-off distance, circling the player, and fire bubble bursts.
        if (e.goalTimer <= 0) {
          const a = Math.random() * Math.PI * 2;
          e.goal.set(Math.cos(a) * 15, 0, Math.sin(a) * 11);
          e.goalTimer = 2.5 + Math.random() * 2;
        }
        const target = pp.clone().add(e.goal).setY(0);
        const steer = target.sub(e.position).setY(0);
        const desired = steer.clampLength(0, e.stats.speed);
        e.velocity.lerp(desired, Math.min(1, dt * 1.5));
        e.heading = turnTowards(e.heading, headingOf(toPlayer.x, toPlayer.z), e.stats.turn * dt);
        e.position.y = THREE.MathUtils.lerp(e.position.y, e.stats.altitude, Math.min(1, dt * 1.2));
        if (hostile && e.entering < 0 && e.fireTimer <= 0 && dist < 30) {
          e.fireTimer = e.stats.fireEvery;
          for (let i = 0; i < 3; i++) {
            setTimeout(
              () =>
                e.alive &&
                this.state === 'playing' &&
                this.enemyFire(e, pp.clone().sub(e.position).setY(0).normalize(), 12),
              i * 150,
            );
          }
        }
      } else {
        // Planes never stop: they loop around and make strafing runs through the player.
        if (e.goalTimer <= 0) {
          e.goal.set((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16);
          e.goalTimer = 1.5;
        }
        const target = pp.clone().add(e.goal);
        const want = headingOf(target.x - e.position.x, target.z - e.position.z);
        const before = e.heading;
        e.heading = turnTowards(e.heading, want, e.stats.turn * dt);
        e.bank = THREE.MathUtils.lerp(
          e.bank,
          THREE.MathUtils.clamp((e.heading - before) / dt / e.stats.turn, -1, 1) * 0.7,
          dt * 4,
        );
        const forward = new THREE.Vector3(Math.cos(e.heading), 0, Math.sin(e.heading));
        e.velocity.copy(forward).multiplyScalar(e.stats.speed);
        if (hostile && e.entering < 0 && forward.dot(toPlayer) > 0.95 && dist < 26 && e.fireTimer <= 0) {
          e.fireTimer = e.stats.fireEvery;
          this.enemyFire(e, forward, 26);
        }
      }

      e.position.addScaledVector(e.velocity, dt * (e.frozen > 0 ? 0.4 : 1));
      if (e.frozen > 0) e.fireTimer += dt * 0.6; // frozen crews fumble their reloads
      if (e.entering < 0 && e.kind !== 'plane') {
        e.position.x = THREE.MathUtils.clamp(e.position.x, -ARENA.x, ARENA.x);
        e.position.z = THREE.MathUtils.clamp(e.position.z, -ARENA.z, ARENA.z);
      }

      // Air units ram the player.
      if (hostile && e.kind !== 'tank' && dist < e.stats.radius + PLAYER_RADIUS && this.invulnerable <= 0) {
        this.hurtPlayer();
        this.damageEnemy(e, 2);
      }
    }

    // Keep units of the same type from stacking on top of each other.
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const a = this.enemies[i];
        const b = this.enemies[j];
        if (a.kind !== b.kind || a.kind === 'plane') continue;
        const d = b.position.clone().sub(a.position).setY(0);
        const min = a.stats.radius + b.stats.radius;
        const len = d.length();
        if (len > 0.001 && len < min) {
          d.multiplyScalar((min - len) / len / 2);
          a.position.sub(d);
          b.position.add(d);
        }
      }
    }
  }

  private damageEnemy(e: Enemy, amount: number, quiet = false) {
    if (!e.alive) return;
    e.hp -= amount;
    if (!quiet) e.flash = 1;
    if (e.alive) {
      if (!quiet) this.sound.play('sfx-hit', { volume: 0.5, vary: 300 });
      return;
    }
    this.killEnemy(e);
  }

  private killEnemy(e: Enemy) {
    const at = e.position.clone().setY(Math.max(1.2, e.position.y + 1));
    this.effects.explosion(at, e.palette);
    this.sound.play('boom', { vary: 80 });
    this.sound.play('sfx-explode', { volume: 0.3, vary: 200 });
    this.trauma = Math.min(1, this.trauma + 0.35);
    this.hitstop = Math.max(this.hitstop, 0.045);

    if (this.state === 'playing') {
      this.kills++;
      this.combo++;
      this.comboTimer = COMBO_WINDOW;
      const mult = Math.min(8, 1 + Math.floor(this.combo / 4));
      const points = e.stats.score * mult;
      this.score += points;
      this.hud.popup(this.project(at), mult > 1 ? `+${points} ×${mult}` : `+${points}`);
      if (Math.random() < 0.2 || this.kills % 7 === 0) this.dropPickup(at);
      this.syncHud();
    }
    this.enemies = this.enemies.filter((x) => x !== e);
    this.removeEnemy(e);
  }

  // ---------------------------------------------------------------- pickups

  private dropPickup(at: THREE.Vector3) {
    const options: PickupId[] = (['spread', 'rapid', 'homing', 'pierce', 'bounce'] as UpgradeId[]).filter(
      (id) => this.weapon[id] < (PICKUPS[id].max ?? 1),
    );
    options.push('spread', 'rapid'); // the crowd-pleasers turn up more often
    if (this.hearts < MAX_HEARTS) options.push('heal', 'heal');
    if (this.bombs < 3) options.push('bomb');
    const id = options[Math.floor(Math.random() * options.length)];
    const p = new Pickup(id, this.assets.icons[id], at);
    this.pickups.push(p);
    this.world.scene.add(p.root);
  }

  private updatePickups() {
    const pp = this.player.position;
    this.pickups = this.pickups.filter((p) => {
      const d = flatDistance(p.root.position, pp);
      if (d < 7) p.root.position.lerp(new THREE.Vector3(pp.x, FLIGHT_HEIGHT, pp.z), 0.08); // gentle magnet
      if (d > 2.2) return true;
      this.collect(p.id);
      this.world.scene.remove(p.root);
      return false;
    });
  }

  private collect(id: PickupId) {
    const info = PICKUPS[id];
    let label = info.name;
    if (id === 'heal') this.hearts = Math.min(MAX_HEARTS, this.hearts + 1);
    else if (id === 'bomb') this.bombs = Math.min(3, this.bombs + 1);
    else if (this.weapon[id] < (info.max ?? 1)) {
      this.weapon[id]++;
      label = `${info.name} Lv${this.weapon[id]}`;
    } else {
      this.score += 500;
      label = `${info.name} maxed +500`;
    }
    this.sound.play('sfx-pickup');
    this.hud.toast(id, label, info.blurb);
    this.syncHud();
  }

  // ---------------------------------------------------------------- camera & hud

  private updateCamera(dt: number) {
    const target = this.player.position.clone().setY(0);
    if (this.state === 'playing') target.addScaledVector(this.aim, 2);
    target.x = THREE.MathUtils.clamp(target.x, -ARENA.x + 8, ARENA.x - 8);
    target.z = THREE.MathUtils.clamp(target.z, -ARENA.z, ARENA.z - 8);
    this.cameraFocus.lerp(target, 1 - Math.exp(-dt * 4));

    const offset = this.state === 'title' ? new THREE.Vector3(Math.sin(this.time * 0.1) * 20, 22, 26) : CAMERA_OFFSET;
    this.camera.position.copy(this.cameraFocus).add(offset);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const shake = this.trauma * this.trauma;
    this.camera.position.x += (Math.random() - 0.5) * shake * 2;
    this.camera.position.y += (Math.random() - 0.5) * shake * 2;
    this.camera.lookAt(this.cameraFocus);
  }

  private project(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }

  private syncHud() {
    this.hud.update({
      hearts: this.hearts,
      maxHearts: MAX_HEARTS,
      bombs: this.bombs,
      score: this.score,
      combo: this.combo,
      level: this.level,
      weapon: this.weapon,
    });
  }
}

function flatDistance(a: THREE.Vector3, b: THREE.Vector3) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
