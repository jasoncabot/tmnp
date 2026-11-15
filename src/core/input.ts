import * as THREE from 'three';

export type Action = 'dash' | 'bomb' | 'pause' | 'mute' | 'confirm';

/**
 * Where aim comes from. Whichever device was used last wins, so they never fight each other:
 * - `pointer`: the parrot faces the mouse cursor.
 * - `stick`: right stick or the right touch thumb gives an aim direction.
 * - `none`: no aim input; the parrot faces the way it's flying.
 */
export type AimMode = 'pointer' | 'stick' | 'none';

const KEY_ACTIONS: Record<string, Action> = {
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyE: 'bomb',
  KeyQ: 'bomb',
  Escape: 'pause',
  KeyP: 'pause',
  KeyM: 'mute',
  Enter: 'confirm',
};

// Standard gamepad mapping: A, B, X, Y, LB, RB, LT, RT, Back, Start.
const PAD_ACTIONS: [number, Action][] = [
  [1, 'dash'],
  [4, 'dash'],
  [3, 'bomb'],
  [5, 'bomb'],
  [9, 'pause'],
  [0, 'confirm'],
];

const DEADZONE = 0.18;
const STICK_RADIUS = 60;

/** A virtual thumbstick that appears wherever a thumb lands on its half of the screen. */
class TouchStick {
  readonly value = new THREE.Vector2();
  id: number | null = null;
  private origin = new THREE.Vector2();
  private base: HTMLDivElement;
  private knob: HTMLDivElement;

  constructor(parent: HTMLElement, side: 'left' | 'right') {
    this.base = document.createElement('div');
    this.base.className = `stick stick-${side}`;
    this.knob = document.createElement('div');
    this.knob.className = 'stick-knob';
    this.base.append(this.knob);
    parent.append(this.base);
  }

  start(t: Touch) {
    this.id = t.identifier;
    this.origin.set(t.clientX, t.clientY);
    this.base.style.transform = `translate(${t.clientX}px, ${t.clientY}px)`;
    this.base.classList.add('active');
    this.move(t);
  }

  move(t: Touch) {
    let dx = t.clientX - this.origin.x;
    let dy = t.clientY - this.origin.y;
    const len = Math.hypot(dx, dy);
    // Drag past the rim and the stick follows your thumb, so it never "runs out".
    if (len > STICK_RADIUS) {
      this.origin.x += (dx / len) * (len - STICK_RADIUS);
      this.origin.y += (dy / len) * (len - STICK_RADIUS);
      this.base.style.transform = `translate(${this.origin.x}px, ${this.origin.y}px)`;
      dx = t.clientX - this.origin.x;
      dy = t.clientY - this.origin.y;
    }
    this.value.set(dx / STICK_RADIUS, -dy / STICK_RADIUS);
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  end() {
    this.id = null;
    this.value.set(0, 0);
    this.base.classList.remove('active');
  }
}

/**
 * Controls, the same shape on every device: one input moves the parrot, another aims and fires.
 * - Mouse: the cursor aims; hold left to fire; hold right to fly towards the cursor.
 * - Keyboard: WASD / arrows move; Space fires.
 * - Gamepad: left stick moves; right stick aims (and fires when pushed); RT / A fire.
 * - Touch: left thumb moves; right thumb aims and fires while held (a tap fires straight ahead).
 */
export class Input {
  /** Movement in screen space (x right, y up), length 0..1. */
  readonly move = new THREE.Vector2();
  /** Aim direction in screen space when `aimMode` is `stick`. */
  readonly aimStick = new THREE.Vector2();
  /** Mouse position in normalised device coordinates. */
  readonly pointer = new THREE.Vector2();
  aimMode: AimMode = 'none';
  firing = false;
  /** Right mouse held: fly towards the cursor. */
  thrust = false;
  /** True once the player has used touch, so the UI can show touch controls. */
  touch = false;

  private keys = new Set<string>();
  private pressed = new Set<Action>();
  private buttons = new Set<number>();
  private padButtons: boolean[] = [];
  private sticks: { move: TouchStick; aim: TouchStick };

  constructor(surface: HTMLElement) {
    this.sticks = { move: new TouchStick(surface, 'left'), aim: new TouchStick(surface, 'right') };

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const action = KEY_ACTIONS[e.code];
      if (action) this.pressed.add(action);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
    });

    surface.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = surface.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.aimMode = 'pointer';
    });
    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.buttons.add(e.button);
      this.aimMode = 'pointer';
    });
    window.addEventListener('pointerup', (e) => this.buttons.delete(e.button));
    surface.addEventListener('contextmenu', (e) => e.preventDefault());

    surface.addEventListener('touchstart', (e) => this.onTouch(e, 'start'), { passive: false });
    surface.addEventListener('touchmove', (e) => this.onTouch(e, 'move'), { passive: false });
    surface.addEventListener('touchend', (e) => this.onTouch(e, 'end'));
    surface.addEventListener('touchcancel', (e) => this.onTouch(e, 'end'));
  }

  private onTouch(e: TouchEvent, phase: 'start' | 'move' | 'end') {
    if (phase !== 'end') e.preventDefault();
    this.touch = true;
    for (const t of Array.from(e.changedTouches)) {
      if (phase === 'start') {
        const stick = t.clientX < window.innerWidth / 2 ? this.sticks.move : this.sticks.aim;
        if (stick.id === null) stick.start(t);
        continue;
      }
      for (const stick of Object.values(this.sticks)) {
        if (stick.id !== t.identifier) continue;
        if (phase === 'move') stick.move(t);
        else stick.end();
      }
    }
  }

  /** On-screen touch buttons call this. */
  trigger(action: Action) {
    this.pressed.add(action);
  }

  /** Returns true once per press of `action`. */
  consume(action: Action) {
    return this.pressed.delete(action);
  }

  update() {
    const k = (...codes: string[]) => codes.some((c) => this.keys.has(c));
    this.move.set(
      (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0),
      (k('KeyW', 'ArrowUp') ? 1 : 0) - (k('KeyS', 'ArrowDown') ? 1 : 0),
    );
    const aim = new THREE.Vector2();
    let padFire = false;

    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const ls = new THREE.Vector2(pad.axes[0] ?? 0, -(pad.axes[1] ?? 0));
      const rs = new THREE.Vector2(pad.axes[2] ?? 0, -(pad.axes[3] ?? 0));
      if (ls.length() > DEADZONE) this.move.add(ls);
      if (rs.length() > DEADZONE) aim.copy(rs);
      padFire ||= (pad.buttons[7]?.value ?? 0) > 0.3 || (pad.buttons[0]?.pressed ?? false) || rs.length() > 0.5;
      for (const [button, action] of PAD_ACTIONS) {
        const down = pad.buttons[button]?.pressed ?? false;
        if (down && !this.padButtons[button]) this.pressed.add(action);
        this.padButtons[button] = down;
      }
    }

    this.move.add(this.sticks.move.value);
    if (this.move.length() > 1) this.move.normalize();
    if (this.sticks.aim.value.length() > 0.25) aim.copy(this.sticks.aim.value);

    if (aim.lengthSq() > 0) {
      this.aimMode = 'stick';
      this.aimStick.copy(aim).normalize();
    } else if (this.aimMode === 'stick') {
      this.aimMode = 'none';
    }

    this.thrust = this.buttons.has(2);
    this.firing = this.buttons.has(0) || k('Space') || padFire || this.sticks.aim.id !== null;
  }

  /** Forget queued presses and held buttons, e.g. when switching screens. */
  clear() {
    this.pressed.clear();
    this.buttons.clear();
  }
}
