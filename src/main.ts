import '@fontsource/bungee';
import '@fontsource-variable/space-grotesk';
import './style.css';
import { loadAssets } from './core/assets';
import { Game } from './game/game';

const app = document.getElementById('app')!;

if (import.meta.env.DEV && new URLSearchParams(location.search).has('preview')) {
  document.getElementById('loading')!.remove();
  void import('./dev/preview').then((m) => m.startPreview(app));
} else {
  boot();
}

function boot() {
  const bar = document.querySelector<HTMLElement>('#loading .bar span')!;

  loadAssets((p) => (bar.style.width = `${Math.round(p * 100)}%`))
    .then((assets) => {
      new Game(app, assets);
      document.getElementById('loading')!.classList.add('done');
    })
    .catch((e: Error) => {
      console.error(e);
      document.querySelector('#loading p')!.textContent = `Couldn't load the game: ${e.message}`;
    });
}
