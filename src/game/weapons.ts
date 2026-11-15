import type { PickupId } from '../core/assets';

export type UpgradeId = Exclude<PickupId, 'heal' | 'bomb'>;

export const PICKUPS: Record<PickupId, { name: string; blurb: string; max?: number }> = {
  spread: { name: 'Spread Shot', blurb: 'More ice bubbles, wider fan', max: 3 },
  rapid: { name: 'Rapid Fire', blurb: 'Faster firing', max: 3 },
  homing: { name: 'Homing Ice', blurb: 'Shots curve towards goldfish', max: 2 },
  pierce: { name: 'Piercing Ice', blurb: 'Shots punch through vehicles', max: 2 },
  bounce: { name: 'Ricochet', blurb: 'Shots bounce off the treeline', max: 2 },
  heal: { name: 'Feather Heart', blurb: '+1 heart' },
  bomb: { name: 'Frost Bomb', blurb: '+1 bomb' },
};

export type WeaponLevels = Record<UpgradeId, number>;

export const emptyWeapon = (): WeaponLevels => ({ spread: 0, rapid: 0, homing: 0, pierce: 0, bounce: 0 });

export const SHOT_SPEED = 34;
/** How much of the parrot's own velocity each shot keeps, so shots carry your momentum. */
export const SHOT_INERTIA = 0.7;

export function fireInterval(w: WeaponLevels) {
  return 0.16 / (1 + 0.5 * w.rapid);
}

/** Angles (radians, relative to aim) of each shot in one volley. */
export function volleyAngles(w: WeaponLevels): number[] {
  return [[0], [-0.16, 0, 0.16], [-0.28, -0.14, 0, 0.14, 0.28], [-0.42, -0.28, -0.14, 0, 0.14, 0.28, 0.42]][w.spread];
}

/** A light nudge towards goldfish for sticks and touch only; a mouse aims precisely on its own. */
export const AIM_ASSIST = 0.12;
