import { icon } from './ui/icons.js';
import {
  ROUTE_SET_EVENT,
  ROUTE_CLEARED_EVENT,
  PROGRESS_EVENT,
  PLAYBACK_EVENT,
  PLAY_EVENT,
  PAUSE_EVENT,
  SEEK_EVENT,
} from './core/events.js';
import { formatDistance } from './RouteSelector.js';

const STYLE = `
.sat-player, .sat-player * { box-sizing: border-box; }
.sat-player {
  font-family: var(--sat-font, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  display: flex; align-items: center; gap: 14px; padding: 10px 18px 10px 10px; border-radius: 999px;
  background: var(--sat-glass, rgba(21,23,28,.8)); border: 1px solid var(--sat-border, rgba(255,255,255,.09));
  -webkit-backdrop-filter: blur(14px) saturate(1.4); backdrop-filter: blur(14px) saturate(1.4);
  box-shadow: 0 14px 36px rgba(0,0,0,.45); color: var(--sat-text, #eef1f5);
  width: min(460px, calc(100vw - 32px));
  opacity: 0; transform: translateY(16px); pointer-events: none;
  transition: opacity .35s ease, transform .4s cubic-bezier(.2,.9,.3,1.1);
}
.sat-player.is-visible { opacity: 1; transform: none; pointer-events: auto; }
.sat-player-btn {
  appearance: none; border: 0; flex: none; width: 44px; height: 44px; border-radius: 50%; cursor: pointer; padding: 0;
  background: #4285f4; color: #fff; display: grid; place-items: center;
  box-shadow: 0 6px 18px rgba(66,133,244,.45); transition: transform .12s ease, background .15s ease;
}
.sat-player-btn:hover { background: #5a95f5; }
.sat-player-btn:active { transform: scale(.93); }
.sat-player-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.sat-player-body { flex: 1; min-width: 0; }
.sat-player-label { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--sat-muted, #98a2b3); margin-bottom: 8px; }
.sat-player-label strong { color: var(--sat-text, #eef1f5); font-weight: 600; }
.sat-player-track { position: relative; height: 18px; display: flex; align-items: center; }
.sat-player-rail { position: absolute; left: 0; right: 0; height: 5px; border-radius: 3px; background: rgba(255,255,255,.14); overflow: hidden; }
.sat-player-fill { height: 100%; width: 0; background: linear-gradient(90deg, #4285f4, #6aa4ff); border-radius: 3px; }
.sat-player-thumb {
  position: absolute; left: 0; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.5); pointer-events: none;
}
.sat-player input[type=range] { position: absolute; inset: 0; width: 100%; margin: 0; opacity: 0; cursor: pointer; }
@media (max-width: 560px) { .sat-player { gap: 10px; } }
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const el = document.createElement('style');
  el.textContent = STYLE;
  document.head.appendChild(el);
  styleInjected = true;
}

/**
 * Route preview bar: play / pause a walk-through of the route (the blue dot
 * travels along it) and scrub through it. It only speaks CustomEvents.
 */
export class RouteControls {
  constructor(container, options = {}) {
    this.container = container;
    this.eventTarget = options.eventTarget || container;
    this.playing = false;
    this.total = 0;

    ensureStyle();
    this.root = document.createElement('div');
    this.root.className = 'sat-player';
    this.root.innerHTML = `
      <button type="button" class="sat-player-btn" aria-label="Preview route">${icon('play', { size: 20 })}</button>
      <div class="sat-player-body">
        <div class="sat-player-label"><span data-role="left"></span><span data-role="total"></span></div>
        <div class="sat-player-track">
          <div class="sat-player-rail"><div class="sat-player-fill"></div></div>
          <div class="sat-player-thumb"></div>
          <input type="range" min="0" max="1000" value="0" step="1" aria-label="Route progress" />
        </div>
      </div>`;
    container.appendChild(this.root);

    this.button = this.root.querySelector('.sat-player-btn');
    this.fill = this.root.querySelector('.sat-player-fill');
    this.thumb = this.root.querySelector('.sat-player-thumb');
    this.input = this.root.querySelector('input');
    this.leftEl = this.root.querySelector('[data-role="left"]');
    this.totalEl = this.root.querySelector('[data-role="total"]');

    this.button.addEventListener('click', () => {
      this.eventTarget.dispatchEvent(new CustomEvent(this.playing ? PAUSE_EVENT : PLAY_EVENT, { bubbles: true }));
    });
    this.input.addEventListener('input', () => {
      this.eventTarget.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: { progress: this.input.value / 1000 }, bubbles: true }));
    });
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('wheel', (e) => e.stopPropagation());

    this._handlers = {
      [ROUTE_SET_EVENT]: (e) => {
        this.total = e.detail?.distanceMeters || 0;
        this.root.classList.toggle('is-visible', this.total > 0);
        this._setPlaying(false);
        this._render(0);
      },
      [ROUTE_CLEARED_EVENT]: () => this.root.classList.remove('is-visible'),
      [PROGRESS_EVENT]: (e) => this._render(e.detail?.progress || 0),
      [PLAYBACK_EVENT]: (e) => this._setPlaying(!!e.detail?.playing),
    };
    for (const [type, fn] of Object.entries(this._handlers)) this.eventTarget.addEventListener(type, fn);
  }

  _setPlaying(playing) {
    this.playing = playing;
    this.button.innerHTML = icon(playing ? 'pause' : 'play', { size: 20 });
    this.button.setAttribute('aria-label', playing ? 'Pause preview' : 'Preview route');
  }

  _render(progress) {
    const pct = Math.min(1, Math.max(0, progress)) * 100;
    this.fill.style.width = `${pct}%`;
    this.thumb.style.left = `${pct}%`;
    this.input.value = Math.round(progress * 1000);
    const left = this.total * (1 - progress);
    this.leftEl.innerHTML = progress >= 0.999 ? '<strong>You have arrived</strong>' : `<strong>${formatDistance(left)}</strong> left`;
    this.totalEl.textContent = `of ${formatDistance(this.total)}`;
  }

  dispose() {
    for (const [type, fn] of Object.entries(this._handlers)) this.eventTarget.removeEventListener(type, fn);
    this.root.remove();
  }
}
