import { icon } from './ui/icons.js';
import { styleForNode } from './ui/itineraryStyle.js';
import { formatDistance } from './RouteSelector.js';

const STYLE = `
.wf-progress-top, .wf-progress-top *, .wf-progress-bottom, .wf-progress-bottom * { box-sizing: border-box; }
.wf-progress-top, .wf-progress-bottom {
  --text: var(--sat-text, #eef1f5); --muted: var(--sat-muted, #98a2b3); --border: var(--sat-border, rgba(255,255,255,.09));
  font-family: var(--sat-font, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  position: absolute; z-index: 20; left: 50%; transform: translateX(-50%); color: var(--text);
  width: min(420px, calc(100vw - 32px));
  -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;
}
.wf-progress-top[hidden], .wf-progress-bottom[hidden] { display: none; }
.wf-progress-top { top: calc(16px + env(safe-area-inset-top)); }
.wf-progress-bottom { bottom: calc(16px + env(safe-area-inset-bottom)); }

.wf-pill {
  border-radius: 999px; background: var(--sat-glass, rgba(21,23,28,.8)); border: 1px solid var(--border);
  -webkit-backdrop-filter: blur(18px) saturate(1.5); backdrop-filter: blur(18px) saturate(1.5);
  box-shadow: 0 18px 50px rgba(0,0,0,.5);
}

/* ---- top pill: next-step button + Cancel ---- */
.wf-progress-next-row { display: flex; align-items: stretch; gap: 4px; padding: 6px 6px 6px 8px; }
.wf-progress-next {
  appearance: none; flex: 1; min-width: 0; display: flex; align-items: center; gap: 11px; cursor: pointer;
  background: rgba(66,133,244,.1); border: 1px solid rgba(66,133,244,.3); color: var(--text); text-align: left;
  padding: 7px 8px 7px 10px; border-radius: 999px; transition: background .15s ease, border-color .15s ease;
}
.wf-progress-next:hover { background: rgba(66,133,244,.18); border-color: rgba(66,133,244,.5); }
.wf-progress-next:active { background: rgba(66,133,244,.26); }
.wf-progress-next-icon { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--c); color: #0d0f13; }
.wf-progress-next-body { flex: 1; min-width: 0; }
.wf-progress-next-kicker { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.wf-progress-next-title { font-size: 15px; font-weight: 650; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wf-progress-next-cta { flex: none; display: flex; align-items: center; align-self: center; color: #cfe0ff; padding-right: 4px; }
.wf-progress-cancel {
  appearance: none; border: 0; flex: none; display: flex; align-items: center; gap: 6px; cursor: pointer;
  background: #d93025; color: #fff; font: 650 12.5px/1 inherit; font-family: inherit; border-radius: 999px; padding: 0 16px;
  transition: background .15s ease;
}
.wf-progress-cancel:hover { background: #e8463a; }
.wf-progress-cancel:active { background: #c62a1f; }

/* ---- bottom card: slider row, then Previous / arrived buttons ---- */
.wf-progress-card { border-radius: 22px; padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 10px; }
.wf-progress-caption { text-align: center; font-size: 12px; font-weight: 600; letter-spacing: .01em; color: var(--muted); }

/* The whole 52px-tall track is the drag target (see the pointer handlers in the
   class): pressing anywhere grabs the handle and moves it there. The handle's
   half-width equals the rail inset, so it never pokes out of the card. */
.wf-progress-track { position: relative; height: 52px; cursor: grab; touch-action: none; outline: none; }
.wf-progress-track.is-dragging { cursor: grabbing; }
.wf-progress-track:focus-visible .wf-progress-thumb { box-shadow: 0 0 0 3px rgba(66,133,244,.7), 0 2px 10px rgba(0,0,0,.55); }
.wf-progress-rail {
  position: absolute; left: 20px; right: 20px; top: 50%; height: 12px; margin-top: -6px; border-radius: 7px;
  background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.08); overflow: hidden; pointer-events: none;
}
.wf-progress-fill { height: 100%; width: 0; background: linear-gradient(90deg, #4285f4, #6aa4ff); border-radius: 7px; }
/* A grip-textured knob (three raised bars) so it reads as "drag me". */
.wf-progress-thumb {
  position: absolute; top: 50%; width: 40px; height: 40px; margin: -20px 0 0 -20px; border-radius: 12px; pointer-events: none;
  background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.04);
  display: flex; align-items: center; justify-content: center; gap: 4px; transition: transform .08s ease;
}
.wf-progress-thumb span { width: 3px; height: 16px; border-radius: 2px; background: rgba(13,15,19,.45); }
.wf-progress-track.is-dragging .wf-progress-thumb { transform: scale(1.1); }

.wf-progress-actions { display: flex; gap: 10px; }
.wf-progress-action {
  appearance: none; border: 0; flex: 1; min-width: 0; height: 48px; border-radius: 14px; padding: 0 12px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px; font: 700 14px/1 inherit; font-family: inherit;
  transition: background .15s ease, transform .1s ease;
}
.wf-progress-action svg { flex: none; }
.wf-progress-action span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wf-progress-action:active:not(:disabled) { transform: scale(.97); }
.wf-progress-action:disabled { cursor: default; }
/* Previous = orange; the "I'm here" button = green with a pulsing ring to invite the tap. */
.wf-progress-action[data-role="back"] { background: #f59e0b; color: #231500; }
.wf-progress-action[data-role="back"]:hover:not(:disabled) { background: #fbaa2c; }
/* Disabled keeps the orange identity — a dim amber tint with a soft outline — instead of fading to mud. */
.wf-progress-action[data-role="back"]:disabled { background: rgba(245,158,11,.14); color: rgba(251,170,44,.6); box-shadow: inset 0 0 0 1px rgba(245,158,11,.3); }
.wf-progress-action[data-role="skip"] { background: #1e9e4a; color: #fff; animation: wf-progress-pulse 1.8s ease-out infinite; }
.wf-progress-action[data-role="skip"]:hover { background: #25b358; }
@keyframes wf-progress-pulse {
  0% { box-shadow: 0 0 0 0 rgba(52,199,89,.55); }
  100% { box-shadow: 0 0 0 12px rgba(52,199,89,0); }
}
@media (prefers-reduced-motion: reduce) { .wf-progress-action[data-role="skip"] { animation: none; } }

/* ---- shared overlay card (full-path modal + arrival modal) ---- */
.wf-overlay {
  --text: var(--sat-text, #eef1f5); --muted: var(--sat-muted, #98a2b3); --border: var(--sat-border, rgba(255,255,255,.09));
  font-family: var(--sat-font, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  color: var(--text); position: fixed; inset: 0; z-index: 70; display: none; align-items: center; justify-content: center; padding: 24px;
  -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;
}
.wf-overlay.is-open { display: flex; }
.wf-overlay-backdrop { position: absolute; inset: 0; background: rgba(6,7,9,.68); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
.wf-overlay-card {
  position: relative; width: min(420px, 100%); max-height: min(70vh, 100%); display: flex; flex-direction: column;
  background: rgba(19,21,26,.97); border: 1px solid var(--border); border-radius: 22px; box-shadow: 0 24px 60px rgba(0,0,0,.55);
  -webkit-backdrop-filter: blur(20px) saturate(1.4); backdrop-filter: blur(20px) saturate(1.4); overflow: hidden;
}
.wf-overlay-header { display: flex; align-items: center; gap: 10px; padding: 16px 16px 10px 18px; flex: none; }
.wf-overlay-title { flex: 1; font: 650 15px/1.3 inherit; letter-spacing: -.01em; }
.wf-overlay-close {
  appearance: none; border: 0; background: transparent; color: var(--text); width: 32px; height: 32px; border-radius: 50%;
  display: grid; place-items: center; cursor: pointer; flex: none; transition: background .15s ease;
}
.wf-overlay-close:hover { background: rgba(255,255,255,.08); }
.wf-overlay-body { padding: 4px 18px 18px; overflow-y: auto; flex: 1; }

/* full-path step list — same visual language as ItineraryView's, smaller */
.wf-path-step { position: relative; display: flex; gap: 12px; padding-bottom: 20px; }
.wf-path-step:last-child { padding-bottom: 0; }
.wf-path-step-rail { display: flex; flex-direction: column; align-items: center; flex: none; }
.wf-path-step-dot { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--c); color: #0d0f13; flex: none; }
.wf-path-step-dot.is-current { box-shadow: 0 0 0 3px rgba(66,133,244,.4); }
.wf-path-step-connector { flex: 1; width: 2px; margin: 5px 0; background: rgba(255,255,255,.14); min-height: 12px; }
.wf-path-step:last-child .wf-path-step-connector { display: none; }
.wf-path-step-body { flex: 1; min-width: 0; padding-top: 2px; }
.wf-path-step-kicker { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--c); margin-bottom: 2px; }
.wf-path-step-title { font-size: 14.5px; font-weight: 650; letter-spacing: -0.01em; }
.wf-path-step-sub { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.wf-path-step.is-done { opacity: .45; }

/* final "you've arrived" confirmation */
.wf-success-icon {
  width: 84px; height: 84px; margin: 8px auto 18px; border-radius: 50%; display: grid; place-items: center;
  background: #1e9e4a; color: #fff; animation: wf-success-pulse 1.8s ease-out infinite;
}
.wf-success-title { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 6px; }
@keyframes wf-success-pulse {
  0% { box-shadow: 0 0 0 0 rgba(52,199,89,.6); transform: scale(1); }
  50% { transform: scale(1.06); }
  100% { box-shadow: 0 0 0 22px rgba(52,199,89,0); transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) { .wf-success-icon { animation: none; } }

/* arrival confirmation */
.wf-arrival-body { padding: 4px 18px 18px; text-align: center; }
.wf-arrival-icon { width: 48px; height: 48px; margin: 4px auto 14px; border-radius: 50%; display: grid; place-items: center; background: var(--c); color: #0d0f13; }
.wf-arrival-text { font-size: 14px; line-height: 1.45; color: var(--text); margin: 0 0 20px; }
.wf-arrival-actions { display: flex; gap: 10px; }
.wf-arrival-btn {
  appearance: none; border: 0; flex: 1; height: 44px; border-radius: 12px; font: 600 14px/1 inherit; font-family: inherit; cursor: pointer;
  transition: background .15s ease;
}
.wf-arrival-btn--primary { background: #4285f4; color: #fff; }
.wf-arrival-btn--primary:hover { background: #5a95f5; }
.wf-arrival-btn--ghost { background: rgba(255,255,255,.06); color: var(--text); border: 1px solid var(--border); }
.wf-arrival-btn--ghost:hover { background: rgba(255,255,255,.1); }

@media (max-width: 560px) {
  .wf-progress-bottom { bottom: calc(10px + env(safe-area-inset-bottom)); width: calc(100vw - 20px); }
  .wf-progress-top { top: calc(10px + env(safe-area-inset-top)); width: calc(100vw - 20px); }
}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const el = document.createElement('style');
  el.textContent = STYLE;
  document.head.appendChild(el);
  styleInjected = true;
}

const TRACK_INSET = 20; // px; must match .wf-progress-rail's left/right

function legKicker(leg) {
  return leg.kind === 'transporter' ? `Take ${leg.toNode.label}` : `To ${leg.toNode.label}`;
}

/**
 * The in-map trip-progress UI: two independent floating pills —
 *   1. top-center: the next-step button (tap to see the full path) with a
 *      prominent red Cancel button built into its right end;
 *   2. bottom-center card: a drag track, then Previous step / "I'm here", for the
 *      CURRENT leg only.
 * Plus two on-demand overlays — the full multi-leg path (tap the top pill)
 * and the arrival confirmation shown once the scrubber is released at its
 * end (or Skip is pressed).
 *
 * This component only renders state and emits callbacks — it never touches
 * SatelliteView directly. The caller (see index.html's trip runner) drives
 * `view.setRoute` / `view.seek` from `onSeek`, and advances `legIndex` via
 * `onAdvance` / `onBack` / arrival confirmation.
 */
export class TripProgress {
  constructor(container) {
    ensureStyle();
    this.container = container;
    this.legs = [];
    this.legIndex = 0;

    this.topRoot = document.createElement('div');
    this.topRoot.className = 'wf-progress-top';
    this.topRoot.hidden = true;
    this.topRoot.innerHTML = `
      <div class="wf-pill wf-progress-next-row">
        <button type="button" class="wf-progress-next" data-role="next">
          <span class="wf-progress-next-icon" data-role="next-icon"></span>
          <span class="wf-progress-next-body">
            <span class="wf-progress-next-kicker" data-role="next-kicker"></span>
            <span class="wf-progress-next-title" data-role="next-title"></span>
          </span>
          <span class="wf-progress-next-cta" style="transform:rotate(-90deg)">${icon('chevron', { size: 16, stroke: 2.4 })}</span>
        </button>
        <button type="button" class="wf-progress-cancel" data-role="cancel">${icon('close', { size: 13, stroke: 2.6 })} Cancel</button>
      </div>`;
    container.appendChild(this.topRoot);

    this.bottomRoot = document.createElement('div');
    this.bottomRoot.className = 'wf-progress-bottom';
    this.bottomRoot.hidden = true;
    this.bottomRoot.innerHTML = `
      <div class="wf-pill wf-progress-card">
        <div class="wf-progress-caption">Drag to show how far you've walked</div>
        <div class="wf-progress-track" data-role="track" role="slider" tabindex="0" aria-label="Progress along this step" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="wf-progress-rail"><div class="wf-progress-fill" data-role="fill"></div></div>
          <div class="wf-progress-thumb" data-role="thumb"><span></span><span></span><span></span></div>
        </div>
        <div class="wf-progress-actions">
          <button type="button" class="wf-progress-action" data-role="back">${icon('back', { size: 18, stroke: 2.6 })}<span>Previous step</span></button>
          <button type="button" class="wf-progress-action" data-role="skip">${icon('check', { size: 18, stroke: 2.8 })}<span data-role="skip-label">I've arrived</span></button>
        </div>
      </div>`;
    container.appendChild(this.bottomRoot);

    this.nextIconEl = this.topRoot.querySelector('[data-role="next-icon"]');
    this.nextKickerEl = this.topRoot.querySelector('[data-role="next-kicker"]');
    this.nextTitleEl = this.topRoot.querySelector('[data-role="next-title"]');
    this.fillEl = this.bottomRoot.querySelector('[data-role="fill"]');
    this.thumbEl = this.bottomRoot.querySelector('[data-role="thumb"]');
    this.trackEl = this.bottomRoot.querySelector('[data-role="track"]');
    this.skipLabelEl = this.bottomRoot.querySelector('[data-role="skip-label"]');
    this._progress = 0;
    this.backBtn = this.bottomRoot.querySelector('[data-role="back"]');
    this.skipBtn = this.bottomRoot.querySelector('[data-role="skip"]');

    this.topRoot.querySelector('[data-role="next"]').addEventListener('click', () => this._openFullPath());
    this.topRoot.querySelector('[data-role="cancel"]').addEventListener('click', () => this.onCancel?.());
    this.backBtn.addEventListener('click', () => this.onBack?.());
    this.skipBtn.addEventListener('click', () => this._skip());
    // Drag handling is ours, not a native range input's: the handle you see is the
    // thing you drag, and pressing anywhere on the track grabs it.
    const seekFromPointer = (e) => {
      const rect = this.trackEl.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (e.clientX - rect.left - TRACK_INSET) / (rect.width - 2 * TRACK_INSET)));
      this._render(p);
      this.onSeek?.(p);
    };
    this.trackEl.addEventListener('pointerdown', (e) => {
      this.trackEl.setPointerCapture(e.pointerId);
      this.trackEl.classList.add('is-dragging');
      this.trackEl.focus({ preventScroll: true });
      seekFromPointer(e);
      e.preventDefault();
    });
    this.trackEl.addEventListener('pointermove', (e) => {
      if (this.trackEl.hasPointerCapture(e.pointerId)) seekFromPointer(e);
    });
    const release = (e) => {
      if (!this.trackEl.classList.contains('is-dragging')) return;
      this.trackEl.classList.remove('is-dragging');
      if (e.type === 'pointerup' && this._progress >= 0.98) this._promptArrival(); // only when they let go near the end
    };
    this.trackEl.addEventListener('pointerup', release);
    this.trackEl.addEventListener('pointercancel', release);
    this.trackEl.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05 }[e.key];
      if (step === undefined && e.key !== 'Home' && e.key !== 'End') return;
      const p = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : Math.min(1, Math.max(0, this._progress + step));
      e.preventDefault();
      this._render(p);
      this.onSeek?.(p);
      if (p >= 0.98) this._promptArrival();
    });
    for (const root of [this.topRoot, this.bottomRoot]) {
      root.addEventListener('pointerdown', (e) => e.stopPropagation());
      root.addEventListener('wheel', (e) => e.stopPropagation());
    }

    this._buildFullPathOverlay(container);
    this._buildArrivalOverlay(container);
  }

  /** `legs` is routePlanner.planToLegs()'s output. Shows the first leg, reset to 0 progress. */
  setLegs(legs) {
    this.legs = legs;
    this.setLeg(0);
  }

  setLeg(index) {
    this.legIndex = index;
    const leg = this.legs[this.legIndex];
    if (!leg) return;
    const style = styleForNode(leg.toNode);
    this.nextIconEl.style.setProperty('--c', style.color);
    this.nextIconEl.innerHTML = icon(style.icon, { size: 17, stroke: 2.2 });
    this.nextKickerEl.textContent = leg.kind === 'transporter' ? 'Next' : 'Heading to';
    this.nextTitleEl.textContent = legKicker(leg);
    this.backBtn.disabled = this.legIndex === 0;
    // Names what tapping it means for THIS step — arriving at the stairs/lift isn't arriving.
    this.skipLabelEl.textContent = leg.kind === 'transporter' ? `I'm at ${leg.toNode.label}` : "I've arrived";
    this._render(0);
    this._renderFullPath();
  }

  _render(progress) {
    const pct = Math.min(1, Math.max(0, progress)) * 100;
    this.fillEl.style.width = `${pct}%`;
    this._progress = pct / 100;
    this.trackEl.setAttribute('aria-valuenow', String(Math.round(pct)));
    // The thumb travels only between the rail's insets, never past them.
    this.thumbEl.style.left = `calc(${TRACK_INSET}px + (100% - ${2 * TRACK_INSET}px) * ${pct / 100})`;
  }

  _skip() {
    this._render(1);
    this.onSeek?.(1);
    this._promptArrival();
  }

  show() {
    this.topRoot.hidden = false;
    this.bottomRoot.hidden = false;
  }

  hide() {
    this.topRoot.hidden = true;
    this.bottomRoot.hidden = true;
    this._closeFullPath();
    this._closeArrival();
    this.successOverlay?.classList.remove('is-open');
  }

  // ---- full path overlay -------------------------------------------------

  _buildFullPathOverlay(container) {
    this.pathOverlay = document.createElement('div');
    this.pathOverlay.className = 'wf-overlay';
    this.pathOverlay.innerHTML = `
      <div class="wf-overlay-backdrop" data-role="backdrop"></div>
      <div class="wf-overlay-card" role="dialog" aria-label="Full route">
        <div class="wf-overlay-header">
          <div class="wf-overlay-title">Your route</div>
          <button type="button" class="wf-overlay-close" data-role="close" aria-label="Close">${icon('close', { size: 16, stroke: 2.3 })}</button>
        </div>
        <div class="wf-overlay-body" data-role="steps"></div>
      </div>`;
    container.appendChild(this.pathOverlay);
    this.pathStepsEl = this.pathOverlay.querySelector('[data-role="steps"]');
    this.pathOverlay.querySelector('[data-role="backdrop"]').addEventListener('click', () => this._closeFullPath());
    this.pathOverlay.querySelector('[data-role="close"]').addEventListener('click', () => this._closeFullPath());
    this.pathOverlay.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.pathOverlay.addEventListener('wheel', (e) => e.stopPropagation());
  }

  _openFullPath() {
    this._renderFullPath();
    this.pathOverlay.classList.add('is-open');
  }

  _closeFullPath() {
    this.pathOverlay.classList.remove('is-open');
  }

  _renderFullPath() {
    this.pathStepsEl.innerHTML = '';
    this.legs.forEach((leg, i) => {
      const style = styleForNode(leg.toNode);
      const isCurrent = i === this.legIndex;
      const isDone = i < this.legIndex;
      const step = document.createElement('div');
      step.className = `wf-path-step${isDone ? ' is-done' : ''}`;
      step.innerHTML = `
        <div class="wf-path-step-rail">
          <span class="wf-path-step-dot${isCurrent ? ' is-current' : ''}" style="--c:${style.color}">${icon(style.icon, { size: 13, stroke: 2.2 })}</span>
          <span class="wf-path-step-connector"></span>
        </div>
        <div class="wf-path-step-body">
          <span class="wf-path-step-kicker" style="--c:${style.color}">${leg.kind === 'transporter' ? 'Change floors' : 'Destination'}</span>
          <div class="wf-path-step-title">${legKicker(leg)}</div>
          <div class="wf-path-step-sub">${formatDistance(leg.route.distance)}${leg.nextFloor ? ` · ${leg.nextFloor.name}` : ''}</div>
        </div>`;
      this.pathStepsEl.appendChild(step);
    });
  }

  // ---- arrival confirmation -----------------------------------------------

  _buildArrivalOverlay(container) {
    this.arrivalOverlay = document.createElement('div');
    this.arrivalOverlay.className = 'wf-overlay';
    this.arrivalOverlay.innerHTML = `
      <div class="wf-overlay-backdrop"></div>
      <div class="wf-overlay-card" role="dialog" aria-label="Confirm arrival" style="max-height:none;">
        <div class="wf-arrival-body">
          <div class="wf-arrival-icon" data-role="icon"></div>
          <p class="wf-arrival-text" data-role="text"></p>
          <div class="wf-arrival-actions">
            <button type="button" class="wf-arrival-btn wf-arrival-btn--ghost" data-role="no">Not yet</button>
            <button type="button" class="wf-arrival-btn wf-arrival-btn--primary" data-role="yes">Yes</button>
          </div>
        </div>
      </div>`;
    container.appendChild(this.arrivalOverlay);
    this.arrivalIconEl = this.arrivalOverlay.querySelector('[data-role="icon"]');
    this.arrivalTextEl = this.arrivalOverlay.querySelector('[data-role="text"]');
    this.arrivalOverlay.querySelector('[data-role="no"]').addEventListener('click', () => this._closeArrival());
    this.arrivalOverlay.querySelector('[data-role="yes"]').addEventListener('click', () => {
      this._closeArrival();
      const leg = this.legs[this.legIndex];
      if (leg && leg.kind === 'destination') this._showSuccess(leg); // final stop: confirm before handing off
      else this.onArrive?.(leg, this.legIndex);
    });
    this.arrivalOverlay.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.arrivalOverlay.addEventListener('wheel', (e) => e.stopPropagation());
  }

  // The last "yes": swaps the question for a pulsing green tick; Done hands off to onArrive.
  _showSuccess(leg) {
    if (!this.successOverlay) {
      this.successOverlay = document.createElement('div');
      this.successOverlay.className = 'wf-overlay';
      this.successOverlay.innerHTML = `
        <div class="wf-overlay-backdrop"></div>
        <div class="wf-overlay-card" role="dialog" aria-label="Arrived" style="max-height:none;">
          <div class="wf-arrival-body">
            <div class="wf-success-icon">${icon('check', { size: 46, stroke: 3 })}</div>
            <h2 class="wf-success-title">You've arrived</h2>
            <p class="wf-arrival-text" data-role="text"></p>
            <div class="wf-arrival-actions"><button type="button" class="wf-arrival-btn wf-arrival-btn--primary" data-role="done">Done</button></div>
          </div>
        </div>`;
      this.container.appendChild(this.successOverlay);
      this.successOverlay.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.successOverlay.addEventListener('wheel', (e) => e.stopPropagation());
      this.successOverlay.querySelector('[data-role="done"]').addEventListener('click', () => {
        this.successOverlay.classList.remove('is-open');
        this.onArrive?.(this.legs[this.legIndex], this.legIndex);
      });
    }
    this.successOverlay.querySelector('[data-role="text"]').textContent = `You reached ${leg.toNode.label}.`;
    this.successOverlay.classList.add('is-open');
  }

  _promptArrival() {
    const leg = this.legs[this.legIndex];
    if (!leg) return;
    const style = styleForNode(leg.toNode);
    this.arrivalIconEl.style.setProperty('--c', style.color);
    this.arrivalIconEl.innerHTML = icon(style.icon, { size: 20, stroke: 2.2 });
    this.arrivalTextEl.textContent = leg.kind === 'transporter'
      ? `Take ${leg.toNode.label} to ${leg.nextFloor.name}, then tap Yes once you're there.`
      : `Did you reach ${leg.toNode.label}?`;
    this.arrivalOverlay.classList.add('is-open');
  }

  _closeArrival() {
    this.arrivalOverlay.classList.remove('is-open');
  }

  dispose() {
    this.topRoot.remove();
    this.bottomRoot.remove();
    this.pathOverlay.remove();
    this.arrivalOverlay.remove();
    this.successOverlay?.remove();
  }
}
