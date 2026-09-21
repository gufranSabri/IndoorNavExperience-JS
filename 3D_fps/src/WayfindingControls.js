import { MOVE_START_EVENT, MOVE_STOP_EVENT, PROGRESS_EVENT, ROUTE_SET_EVENT } from './WayfindingView.js';

const STYLE = `
.wf-controls {
  display: flex; align-items: center; gap: 14px; font-family: system-ui, sans-serif;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
}
.wf-controls button {
  appearance: none; border: none; cursor: pointer;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent; touch-action: none;
  width: 56px; height: 56px; border-radius: 50%;
  background: #2f6fed; color: #fff; font-size: 22px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 14px rgba(47,111,237,0.35);
  transition: transform 0.08s ease, opacity 0.15s ease;
}
.wf-controls button.wf-pressed { transform: scale(0.92); }
.wf-controls button:disabled { opacity: 0.35; cursor: default; box-shadow: none; }
.wf-controls .wf-progress-wrap { flex: 1; min-width: 80px; }
.wf-controls .wf-progress-track { height: 6px; border-radius: 3px; background: #d9e2f3; overflow: hidden; }
.wf-controls .wf-progress-fill { height: 100%; background: #2f6fed; width: 0%; transition: width 0.1s linear; }
.wf-controls .wf-progress-label { font-size: 12px; color: #4a5568; margin-top: 4px; }
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
 * Component 2: forward/backward controls.
 *
 * Knows nothing about Three.js or the view's internals — it only dispatches
 * 'wayfinding:move-start' / 'wayfinding:move-stop' CustomEvents on the
 * shared event target (press-and-hold walks continuously; releasing stops
 * it — there is no click-to-step), and listens for 'wayfinding:route-set' /
 * 'wayfinding:progress' purely to enable/disable itself and draw a
 * progress bar.
 */
export class WayfindingControls {
  constructor(container, options = {}) {
    this.container = container;
    this.eventTarget = options.eventTarget || container;
    this.showProgress = options.showProgress ?? true;
    this._activePointerId = null;
    this._activeDirection = null;

    ensureStyle();

    this.root = document.createElement('div');
    this.root.className = 'wf-controls';

    this.backBtn = document.createElement('button');
    this.backBtn.type = 'button';
    this.backBtn.textContent = '←';
    this.backBtn.setAttribute('aria-label', 'Hold to move backward along the path');

    this.forwardBtn = document.createElement('button');
    this.forwardBtn.type = 'button';
    this.forwardBtn.textContent = '→';
    this.forwardBtn.setAttribute('aria-label', 'Hold to move forward along the path');

    this.root.appendChild(this.backBtn);

    if (this.showProgress) {
      const wrap = document.createElement('div');
      wrap.className = 'wf-progress-wrap';
      const track = document.createElement('div');
      track.className = 'wf-progress-track';
      this.progressFill = document.createElement('div');
      this.progressFill.className = 'wf-progress-fill';
      track.appendChild(this.progressFill);
      this.progressLabel = document.createElement('div');
      this.progressLabel.className = 'wf-progress-label';
      this.progressLabel.textContent = 'Select a start and destination';
      wrap.appendChild(track);
      wrap.appendChild(this.progressLabel);
      this.root.appendChild(wrap);
    }

    this.root.appendChild(this.forwardBtn);
    this.container.appendChild(this.root);

    this._onBackDown = (e) => this._startHold(e, 'backward', this.backBtn);
    this._onForwardDown = (e) => this._startHold(e, 'forward', this.forwardBtn);
    this._onPointerUp = (e) => this._endHold(e);
    this._onPointerCancel = (e) => this._endHold(e);

    for (const btn of [this.backBtn, this.forwardBtn]) {
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    this.backBtn.addEventListener('pointerdown', this._onBackDown);
    this.forwardBtn.addEventListener('pointerdown', this._onForwardDown);
    // Bound on the button itself (not window): pointer capture (set in
    // _startHold) routes these here even if the finger drifts off the
    // button before lifting, which is common on a phone.
    this.backBtn.addEventListener('pointerup', this._onPointerUp);
    this.backBtn.addEventListener('pointercancel', this._onPointerCancel);
    this.forwardBtn.addEventListener('pointerup', this._onPointerUp);
    this.forwardBtn.addEventListener('pointercancel', this._onPointerCancel);

    this._onProgress = this._onProgress.bind(this);
    this._onRouteSet = this._onRouteSet.bind(this);
    this.eventTarget.addEventListener(PROGRESS_EVENT, this._onProgress);
    this.eventTarget.addEventListener(ROUTE_SET_EVENT, this._onRouteSet);

    this.setEnabled(false);
  }

  _startHold(event, direction, btn) {
    event.preventDefault();
    if (btn.disabled) return;
    this._activePointerId = event.pointerId;
    this._activeDirection = direction;
    btn.setPointerCapture?.(event.pointerId);
    btn.classList.add('wf-pressed');
    this.eventTarget.dispatchEvent(new CustomEvent(MOVE_START_EVENT, { detail: { direction }, bubbles: true }));
  }

  _endHold(event) {
    if (this._activePointerId !== null && event.pointerId !== this._activePointerId) return;
    this._activePointerId = null;
    this._activeDirection = null;
    this.backBtn.classList.remove('wf-pressed');
    this.forwardBtn.classList.remove('wf-pressed');
    this.eventTarget.dispatchEvent(new CustomEvent(MOVE_STOP_EVENT, { bubbles: true }));
  }

  setEnabled(enabled) {
    this.backBtn.disabled = !enabled;
    this.forwardBtn.disabled = !enabled;
    if (!enabled) this._endHold({ pointerId: this._activePointerId });
  }

  _onRouteSet(event) {
    const { distanceMeters } = event.detail || {};
    this.setEnabled((distanceMeters || 0) > 0);
    if (this.progressLabel) {
      this.progressLabel.textContent =
        distanceMeters > 0 ? `0.0 m / ${distanceMeters.toFixed(1)} m` : 'Already there';
    }
    if (this.progressFill) this.progressFill.style.width = '0%';
  }

  _onProgress(event) {
    const { progress, distance, atStart, atEnd } = event.detail || {};
    if (this.progressFill) this.progressFill.style.width = `${Math.round(progress * 100)}%`;
    if (this.progressLabel) this.progressLabel.textContent = `${distance.toFixed(1)} m walked`;
    if (this.backBtn) this.backBtn.disabled = atStart;
    if (this.forwardBtn) this.forwardBtn.disabled = atEnd;
  }

  dispose() {
    this.backBtn.removeEventListener('pointerdown', this._onBackDown);
    this.forwardBtn.removeEventListener('pointerdown', this._onForwardDown);
    this.backBtn.removeEventListener('pointerup', this._onPointerUp);
    this.backBtn.removeEventListener('pointercancel', this._onPointerCancel);
    this.forwardBtn.removeEventListener('pointerup', this._onPointerUp);
    this.forwardBtn.removeEventListener('pointercancel', this._onPointerCancel);
    this.eventTarget.removeEventListener(PROGRESS_EVENT, this._onProgress);
    this.eventTarget.removeEventListener(ROUTE_SET_EVENT, this._onRouteSet);
    this.root.remove();
  }
}
