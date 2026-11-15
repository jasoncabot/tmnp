import { iconUrl, url, type PickupId } from '../core/assets';
import { PICKUPS, type UpgradeId, type WeaponLevels } from '../game/weapons';

export interface HudActions {
  play(): void;
  resume(): void;
  quit(): void;
  dash(): void;
  bomb(): void;
  mute(): void;
}

export interface HudState {
  hearts: number;
  maxHearts: number;
  bombs: number;
  score: number;
  combo: number;
  level: number;
  weapon: WeaponLevels;
}

const UPGRADES: UpgradeId[] = ['spread', 'rapid', 'homing', 'pierce', 'bounce'];
const isTouch = matchMedia('(pointer: coarse)').matches;

const html = String.raw;

export class Hud {
  private el: Record<string, HTMLElement> = {};
  private bannerTimer = 0;
  private toastTimer = 0;

  constructor(
    private root: HTMLElement,
    actions: HudActions,
  ) {
    root.innerHTML = html`
      <section class="screen title" data-screen="title">
        <div
          class="title-art"
          style="--art-wide:url(${url('generated/title-bg.webp')});--art-tall:url(${url('generated/title-bg-portrait.webp')})"
        ></div>
        <img class="title-hero" src="${url('generated/hero-parrot.webp')}" alt="" />
        <div class="title-panel">
          <img class="title-logo" src="${url('generated/logo.webp')}" alt="Teenage Mutant Ninja Parrots" />
          <button class="btn primary" data-action="play">Play</button>
          <p class="best" data-el="best"></p>
          <p class="controls">
            ${
              isTouch
                ? 'Left thumb flies · Right thumb aims &amp; fires'
                : 'WASD fly · Mouse aim · Click fire · Shift dash · E bomb'
            }
          </p>
        </div>
      </section>

      <section class="screen pause" data-screen="paused">
        <div class="card">
          <h2>Paused</h2>
          <button class="btn primary" data-action="resume">Resume</button>
          <button class="btn" data-action="quit">Quit to title</button>
        </div>
      </section>

      <section class="screen over" data-screen="over">
        <div class="card">
          <img class="boss" src="${url('generated/goldfish-boss.webp')}" alt="" />
          <h2>Feathers ruffled!</h2>
          <p data-el="overStats"></p>
          <button class="btn primary" data-action="play">Fly again</button>
          <button class="btn" data-action="quit">Title</button>
        </div>
      </section>

      <div class="hud" data-screen="playing paused">
        <div class="hud-left">
          <div class="hearts" data-el="hearts"></div>
          <div class="bombs" data-el="bombs"></div>
        </div>
        <div class="hud-centre"><div class="wave" data-el="wave"></div></div>
        <div class="hud-right">
          <div class="score" data-el="score">0</div>
          <div class="combo" data-el="combo"></div>
        </div>
        <div class="upgrades" data-el="upgrades"></div>
        <button class="icon-btn pause-btn" data-action="pause" aria-label="Pause">❚❚</button>
      </div>

      <div class="touch-buttons" data-screen="playing">
        <button class="touch-btn dash" data-action="dash">Dash</button>
        <button class="touch-btn bomb" data-action="bomb"><img src="${iconUrl('bomb')}" alt="Bomb" /></button>
      </div>

      <div class="coach" data-el="coach">
        ${
          isTouch
            ? html`<div class="coach-left"><b>Drag</b> to fly</div>
                <div class="coach-right"><b>Drag</b> to aim &amp; fire</div>`
            : html`<div class="coach-centre">
                <b>WASD</b> to fly · <b>Mouse</b> to aim · <b>Hold click</b> to fire<br />
                <small>No keyboard? Hold right-click to fly towards the cursor · Shift dash · E frost bomb</small>
              </div>`
        }
      </div>

      <button class="icon-btn mute-btn" data-action="mute" aria-label="Toggle sound" data-el="mute">♪</button>
      <div class="banner" data-el="banner"><strong></strong><span></span></div>
      <div class="toast" data-el="toast">
        <img alt="" />
        <div><strong></strong><span></span></div>
      </div>
      <div class="popups" data-el="popups"></div>
    `;
    root.classList.toggle('is-touch', isTouch);

    for (const node of root.querySelectorAll<HTMLElement>('[data-el]')) this.el[node.dataset.el!] = node;
    const handlers: Record<string, () => void> = {
      ...actions,
      pause: () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })),
    };
    for (const btn of root.querySelectorAll<HTMLElement>('[data-action]')) {
      const run = handlers[btn.dataset.action!];
      // pointerdown, not click: touch buttons must react instantly mid-fight.
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        run();
      });
    }

    this.el.upgrades.innerHTML = UPGRADES.map(
      (id) =>
        html`<div class="chip" data-id="${id}" title="${PICKUPS[id].name}">
          <img src="${iconUrl(id)}" alt="" /><span class="pips"></span>
        </div>`,
    ).join('');
  }

  show(state: string) {
    for (const node of this.root.querySelectorAll<HTMLElement>('[data-screen]')) {
      node.classList.toggle('visible', node.dataset.screen!.split(' ').includes(state));
    }
  }

  setBest(best: number) {
    this.el.best.textContent = best ? `Best: ${best.toLocaleString()}` : '';
  }

  setMuted(muted: boolean) {
    this.el.mute.classList.toggle('muted', muted);
  }

  update(s: HudState) {
    this.el.hearts.innerHTML = Array.from(
      { length: s.maxHearts },
      (_, i) => `<i class="heart ${i < s.hearts ? 'full' : ''}"></i>`,
    ).join('');
    this.el.bombs.innerHTML = Array.from({ length: s.bombs }, () => `<img src="${iconUrl('bomb')}" alt="bomb" />`).join(
      '',
    );
    this.el.score.textContent = s.score.toLocaleString();
    this.el.wave.textContent = s.level ? `Wave ${s.level}` : '';
    this.el.combo.textContent = s.combo >= 4 ? `${s.combo} combo · ×${Math.min(8, 1 + Math.floor(s.combo / 4))}` : '';
    for (const chip of this.el.upgrades.querySelectorAll<HTMLElement>('.chip')) {
      const id = chip.dataset.id as UpgradeId;
      const level = s.weapon[id];
      chip.classList.toggle('owned', level > 0);
      chip.querySelector('.pips')!.textContent = '●'.repeat(level) + '○'.repeat((PICKUPS[id].max ?? 1) - level);
    }
  }

  banner(title: string, subtitle: string) {
    const b = this.el.banner;
    b.querySelector('strong')!.textContent = title;
    b.querySelector('span')!.textContent = subtitle;
    b.classList.remove('show');
    void b.offsetWidth; // restart the animation
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => b.classList.remove('show'), 2200);
  }

  toast(id: PickupId, title: string, subtitle: string) {
    const t = this.el.toast;
    t.querySelector('img')!.src = iconUrl(id);
    t.querySelector('strong')!.textContent = title;
    t.querySelector('span')!.textContent = subtitle;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), 1800);
  }

  /** Floating score text at a screen position given in 0..1 coordinates. */
  popup(at: { x: number; y: number }, text: string) {
    const p = document.createElement('div');
    p.className = 'popup';
    p.textContent = text;
    p.style.left = `${at.x * 100}%`;
    p.style.top = `${at.y * 100}%`;
    this.el.popups.append(p);
    setTimeout(() => p.remove(), 900);
  }

  /** Control hints shown at the start of a run, until the player gets going. */
  coach(show: boolean) {
    this.el.coach.classList.toggle('show', show);
  }

  gameOver(score: number, best: number, wave: number) {
    this.el.overStats.innerHTML = `Reached wave ${wave}<br><b>${score.toLocaleString()}</b> points${score >= best && score > 0 ? ' · New best!' : ` · Best ${best.toLocaleString()}`}`;
  }
}
