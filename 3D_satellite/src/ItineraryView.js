import { icon } from './ui/icons.js';
import { styleForNode } from './ui/itineraryStyle.js';
import { formatDistance, formatDuration } from './RouteSelector.js';

const STYLE = `
.wf-itin, .wf-itin * { box-sizing: border-box; }
.wf-itin {
  --text: var(--sat-text, #eef1f5); --muted: var(--sat-muted, #98a2b3); --border: var(--sat-border, rgba(255,255,255,.09));
  font-family: var(--sat-font, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  color: var(--text); position: fixed; inset: 0; z-index: 55; display: flex; flex-direction: column;
  background: radial-gradient(120% 90% at 50% 0%, #17191e 0%, #0e0f13 55%, #08090b 100%);
  -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;
}
.wf-itin[hidden] { display: none; }
.wf-itin-header { flex: none; padding: calc(20px + env(safe-area-inset-top)) 20px 4px; max-width: 480px; width: 100%; margin: 0 auto; }
.wf-itin-header h1 { margin: 0 0 4px; font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
.wf-itin-header p { margin: 0; font-size: 13px; color: var(--muted); }
.wf-itin-summary { font-size: 13px; color: var(--muted); margin-top: 2px; }
.wf-itin-summary strong { color: var(--text); font-weight: 650; }

.wf-itin-steps { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 20px; max-width: 480px; width: 100%; margin: 0 auto; }
.wf-itin-step { position: relative; display: flex; gap: 14px; padding-bottom: 26px; }
.wf-itin-step:last-child { padding-bottom: 0; }
.wf-itin-step-rail { display: flex; flex-direction: column; align-items: center; flex: none; }
.wf-itin-step-dot { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--c); color: #0d0f13; flex: none; }
.wf-itin-step-connector { flex: 1; width: 2px; margin: 6px 0; background: rgba(255,255,255,.14); min-height: 14px; }
.wf-itin-step:last-child .wf-itin-step-connector { display: none; }
.wf-itin-step-body { flex: 1; min-width: 0; padding-top: 2px; }
.wf-itin-step-kicker { display: block; font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--c); margin-bottom: 3px; }
.wf-itin-step-title { font-size: 16.5px; font-weight: 650; letter-spacing: -0.01em; }
.wf-itin-step-sub { font-size: 12.5px; color: var(--muted); margin-top: 3px; }

.wf-itin-error { margin: 0 20px 14px; padding: 12px 14px; border-radius: 12px; background: rgba(234,67,53,.12); border: 1px solid rgba(234,67,53,.3); color: #ff8a80; font-size: 13px; max-width: 480px; box-sizing: border-box; }

.wf-itin-actions {
  flex: none; display: flex; gap: 10px; padding: 14px 20px calc(16px + env(safe-area-inset-bottom)); max-width: 480px; width: 100%; margin: 0 auto;
  border-top: 1px solid var(--border);
}
.wf-itin-btn {
  appearance: none; border: 0; flex: 1; height: 46px; border-radius: 999px; font: 600 14.5px/1 inherit; font-family: inherit; cursor: pointer;
  transition: background .15s ease;
}
.wf-itin-btn--primary { background: #4285f4; color: #fff; }
.wf-itin-btn--primary:hover { background: #5a95f5; }
.wf-itin-btn--ghost { background: rgba(255,255,255,.06); color: var(--text); border: 1px solid var(--border); }
.wf-itin-btn--ghost:hover { background: rgba(255,255,255,.1); }

/* ---- wide screens: a docked left sidebar instead of a full-screen takeover —
   same treatment as TripPlanner.js's own, so the two feel like one panel
   that swaps its content rather than two different kinds of screen. ---- */
@media (min-width: 561px) {
  .wf-itin {
    inset: auto; left: 0; top: 0; bottom: 0; width: 400px;
    border-right: 1px solid var(--border); box-shadow: 0 0 40px rgba(0,0,0,.35);
  }
  .wf-itin-header, .wf-itin-steps, .wf-itin-error, .wf-itin-actions { max-width: none; }
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

/**
 * Read-only step-by-step summary of a planned trip (see core/routePlanner.js),
 * with Start / Cancel. Purely informational — it never touches the map;
 * Start just hands the plan back to the caller to decide what to do with it
 * (today: open the map on the start floor, no route drawn).
 */
export class ItineraryView {
  constructor(container) {
    ensureStyle();
    this.root = document.createElement('div');
    this.root.className = 'wf-itin';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="wf-itin-header">
        <h1>Your route</h1>
        <p data-role="subtitle"></p>
      </div>
      <div class="wf-itin-error" data-role="error" hidden></div>
      <div class="wf-itin-steps" data-role="steps"></div>
      <div class="wf-itin-actions">
        <button type="button" class="wf-itin-btn wf-itin-btn--ghost" data-role="cancel">Cancel</button>
        <button type="button" class="wf-itin-btn wf-itin-btn--primary" data-role="start">Start</button>
      </div>`;
    container.appendChild(this.root);

    this.subtitleEl = this.root.querySelector('[data-role="subtitle"]');
    this.errorEl = this.root.querySelector('[data-role="error"]');
    this.stepsEl = this.root.querySelector('[data-role="steps"]');
    this.startBtn = this.root.querySelector('[data-role="start"]');
    this.cancelBtn = this.root.querySelector('[data-role="cancel"]');
  }

  /**
   * `plan` is routePlanner.planTrip()'s result, or null if no route was
   * found. `startFloor`/`startNode`/`destFloor`/`destNode` are the raw
   * selections (needed here even on success, for labels/floor names).
   */
  show({ plan, startFloor, startNode, destFloor, destNode }) {
    this.stepsEl.innerHTML = '';
    this.errorEl.hidden = true;
    this._plan = plan;
    this._startFloor = startFloor;

    if (!plan) {
      this.subtitleEl.textContent = `${startNode.label} → ${destNode.label}`;
      this.errorEl.hidden = false;
      this.errorEl.textContent = startFloor === destFloor || startFloor.url === destFloor.url
        ? "No walkable route was found between those two places."
        : "No elevator or stairs connects those two floors under the same name yet — ask whoever maintains this map to check the naming.";
      this.startBtn.disabled = true;
    } else {
      this.startBtn.disabled = false;
      if (plan.sameFloor) {
        this.subtitleEl.textContent = `${startFloor.name} · ${formatDistance(plan.route.distance)} · ${formatDuration(plan.route.distance / 1.3)}`;
        this._renderStep(startNode, 'Start here', startNode.label, null);
        this._renderStep(destNode, 'Destination', destNode.label, null, { last: true });
      } else {
        const totalDistance = plan.legA.route.distance + plan.legB.route.distance;
        this.subtitleEl.textContent = `${startFloor.name} → ${destFloor.name} · ${formatDistance(totalDistance)} · ${formatDuration(totalDistance / 1.3)}`;
        this._renderStep(startNode, 'Start here', startNode.label, startFloor.name);
        this._renderStep(plan.legA.transporter, `Take ${plan.transporterName}`, null, `to ${destFloor.name}`);
        this._renderStep(destNode, 'Destination', destNode.label, destFloor.name, { last: true });
      }
    }

    this.root.hidden = false;
  }

  // `kicker` is the small colored label (e.g. "Start here", "Take Elevator 4");
  // `title` is the big place name below it — omitted when the kicker already
  // says it all (the transporter step, where repeating the name adds nothing).
  _renderStep(node, kicker, title, sub, { last = false } = {}) {
    const style = styleForNode(node);
    const step = document.createElement('div');
    step.className = 'wf-itin-step';
    step.innerHTML = `
      <div class="wf-itin-step-rail">
        <span class="wf-itin-step-dot" style="--c:${style.color}">${icon(style.icon, { size: 15, stroke: 2.2 })}</span>
        <span class="wf-itin-step-connector"></span>
      </div>
      <div class="wf-itin-step-body">
        <span class="wf-itin-step-kicker" style="--c:${style.color}">${kicker}</span>
        ${title ? `<div class="wf-itin-step-title">${title}</div>` : ''}
        ${sub ? `<div class="wf-itin-step-sub">${sub}</div>` : ''}
      </div>`;
    if (last) step.querySelector('.wf-itin-step-connector').style.display = 'none';
    this.stepsEl.appendChild(step);
  }

  hide() {
    this.root.hidden = true;
  }

  dispose() {
    this.root.remove();
  }
}
