import { icon } from './ui/icons.js';
import { labelKey, nodeName } from './core/FloorDataLoader.js';
import { OBJECT_STYLE, PICKER_CATEGORIES, PICKER_HIDDEN, pickerCategoryOf } from './core/constants.js';

const STYLE = `
.wf-trip, .wf-trip * { box-sizing: border-box; }
.wf-trip {
  --text: var(--sat-text, #eef1f5); --muted: var(--sat-muted, #98a2b3); --border: var(--sat-border, rgba(255,255,255,.09));
  font-family: var(--sat-font, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  color: var(--text); position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column;
  background: radial-gradient(120% 90% at 50% 0%, #17191e 0%, #0e0f13 55%, #08090b 100%);
  -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;
}
.wf-trip[hidden] { display: none; }
/* Soft keyboard open (see _fitToVisualViewport): drop the non-essential rows so the results get the space. */
.wf-trip.is-kb .wf-trip-header { padding-top: calc(10px + env(safe-area-inset-top)); padding-bottom: 8px; }
.wf-trip.is-kb .wf-trip-header h1, .wf-trip.is-kb .wf-trip-prefer { display: none; }
.wf-trip.is-kb .wf-trip-fields { margin-bottom: 8px; }
.wf-trip.is-kb .wf-trip-list { padding-bottom: 12px; }
.wf-trip-header {
  flex: none; padding: calc(20px + env(safe-area-inset-top)) 20px 14px; max-width: 520px; width: 100%; margin: 0 auto;
}
.wf-trip-brand {
  display: flex; align-items: center; gap: 12px; margin: 0 0 18px; padding: 10px 10px 10px 12px; border-radius: 18px;
  background: linear-gradient(120deg, rgba(34,170,92,.2), rgba(14,140,214,.2)); border: 1px solid rgba(255,255,255,.1);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 6px 20px rgba(0,0,0,.25);
}
.wf-trip-info {
  appearance: none; margin-left: auto; flex: none; width: 36px; height: 36px; padding: 0; border-radius: 50%; cursor: pointer;
  border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); color: var(--text); display: grid; place-items: center;
  transition: background .15s ease, transform .1s ease;
}
.wf-trip-info:hover { background: rgba(255,255,255,.16); }
.wf-trip-info:active { transform: scale(.92); }

.wf-trip-help { position: absolute; inset: 0; z-index: 5; display: none; align-items: center; justify-content: center; padding: 20px; }
.wf-trip-help.is-open { display: flex; }
.wf-trip-help-backdrop { position: absolute; inset: 0; background: rgba(6,7,9,.7); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
.wf-trip-help-card {
  position: relative; width: min(420px, 100%); max-height: 100%; display: flex; flex-direction: column; overflow: hidden;
  background: rgba(19,21,26,.98); border: 1px solid var(--border); border-radius: 22px; box-shadow: 0 24px 60px rgba(0,0,0,.55);
}
.wf-trip-help-head { display: flex; align-items: center; gap: 10px; padding: 16px 12px 8px 20px; flex: none; }
.wf-trip-help-head h2 { flex: 1; margin: 0; font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
.wf-trip-help-close {
  appearance: none; border: 0; background: transparent; color: var(--text); width: 34px; height: 34px; border-radius: 50%;
  display: grid; place-items: center; cursor: pointer;
}
.wf-trip-help-close:hover { background: rgba(255,255,255,.08); }
.wf-trip-help-steps { margin: 0; padding: 6px 20px 20px; list-style: none; overflow-y: auto; counter-reset: step; }
.wf-trip-help-steps li { position: relative; padding: 10px 0 10px 40px; font-size: 14px; line-height: 1.45; counter-increment: step; }
.wf-trip-help-steps li::before {
  content: counter(step); position: absolute; left: 0; top: 9px; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
  font-size: 12.5px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #22aa5c, #0e8cd6);
}
.wf-trip-help-steps strong { display: block; font-weight: 650; margin-bottom: 1px; }
.wf-trip-help-steps span { color: var(--muted); }
.wf-trip-logo {
  width: 42px; height: 42px; border-radius: 12px; object-fit: cover; flex: none; display: block;
  box-shadow: 0 0 0 1px rgba(255,255,255,.12), 0 4px 14px rgba(0,0,0,.4);
  animation: wf-trip-logo-in .7s cubic-bezier(.2,.9,.3,1.2) both, wf-trip-logo-glow 4.5s ease-in-out 1s infinite;
}
.wf-trip-brand-name {
  font-size: 23px; font-weight: 750; letter-spacing: -0.02em; line-height: 1;
  background: linear-gradient(100deg, #eef1f5 0%, #eef1f5 35%, #7fe3a6 50%, #79c4ff 60%, #eef1f5 75%, #eef1f5 100%);
  background-size: 250% 100%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
  animation: wf-trip-name-in .7s .1s ease-out both, wf-trip-shimmer 6s ease-in-out 1.2s infinite;
}
@keyframes wf-trip-logo-in { from { opacity: 0; transform: scale(.6) rotate(-12deg); } to { opacity: 1; transform: none; } }
@keyframes wf-trip-name-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
/* A soft green/blue glow breathing behind the logo, and a slow light sweep across the name. */
@keyframes wf-trip-logo-glow {
  0%, 100% { box-shadow: 0 0 0 1px rgba(255,255,255,.12), 0 4px 14px rgba(0,0,0,.4), 0 0 0 0 rgba(79,209,165,0); }
  50% { box-shadow: 0 0 0 1px rgba(255,255,255,.18), 0 4px 14px rgba(0,0,0,.4), 0 0 18px 2px rgba(79,209,165,.35); }
}
@keyframes wf-trip-shimmer { 0% { background-position: 100% 0; } 55%, 100% { background-position: -60% 0; } }
@media (prefers-reduced-motion: reduce) { .wf-trip-logo, .wf-trip-brand-name { animation: none; } }
.wf-trip.is-kb .wf-trip-brand { display: none; }
.wf-trip-header h1 { margin: 0 0 14px; font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
.wf-trip-fields { display: flex; align-items: stretch; gap: 10px; margin-bottom: 14px; }
.wf-trip-rail { display: flex; flex-direction: column; align-items: center; padding: 13px 0 11px; width: 16px; flex: none; }
.wf-trip-from { width: 12px; height: 12px; border-radius: 50%; border: 3px solid #4285f4; background: transparent; }
.wf-trip-line { flex: 1; width: 0; margin: 4px 0; border-left: 2px dotted rgba(255,255,255,.28); }
.wf-trip-to { color: #ea4335; display: grid; place-items: center; }
.wf-trip-inputs { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.wf-trip-input-wrap { position: relative; }
.wf-trip-input-wrap input {
  width: 100%; height: 42px; padding: 0 14px; border-radius: 11px; border: 1px solid var(--border);
  background: rgba(255,255,255,.06); color: var(--text); font: 500 14px/1 inherit; font-family: inherit;
  outline: none; -webkit-user-select: text; user-select: text;
}
.wf-trip-input-wrap input::placeholder { color: var(--muted); }
.wf-trip-input-wrap input { padding-right: 38px; }
.wf-trip-input-wrap--dest input { border-color: #4285f4; padding-left: 38px; }
.wf-trip-input-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #4285f4; display: grid; pointer-events: none; }
.wf-trip-clear {
  appearance: none; position: absolute; right: 7px; top: 50%; transform: translateY(-50%); width: 26px; height: 26px; padding: 0;
  border: 0; border-radius: 50%; background: rgba(255,255,255,.12); color: var(--text); cursor: pointer; display: grid; place-items: center;
}
.wf-trip-clear:hover { background: rgba(255,255,255,.2); }
.wf-trip-input-wrap input:placeholder-shown ~ .wf-trip-clear { display: none; }
.wf-trip-input-wrap input:focus { border-color: #4285f4; }
.wf-trip-input-wrap.is-active input { border-color: #4285f4; background: rgba(66,133,244,.08); }
.wf-trip-swap {
  appearance: none; align-self: center; flex: none; width: 36px; height: 36px; border-radius: 50%; padding: 0; cursor: pointer;
  border: 1px solid var(--border); background: rgba(255,255,255,.06); color: var(--text); display: grid; place-items: center;
  transition: background .15s ease, transform .3s ease;
}
.wf-trip-swap:hover { background: rgba(255,255,255,.12); }
.wf-trip-swap:active { transform: rotate(180deg); }

.wf-trip-prefer { display: flex; align-items: center; gap: 8px; margin: 0 0 14px; font-size: 13px; color: var(--muted); cursor: pointer; }
.wf-trip-prefer input { accent-color: #4285f4; width: 16px; height: 16px; }

.wf-trip-cats { display: flex; gap: 10px; overflow-x: auto; padding: 2px 2px 4px; margin: 0 0 6px; scrollbar-width: none; }
.wf-trip-cats::-webkit-scrollbar { display: none; }
.wf-trip-cat {
  appearance: none; border: 1px solid var(--border); background: rgba(255,255,255,.05); color: var(--text);
  display: flex; align-items: center; gap: 7px; flex: none; height: 36px; padding: 0 14px 0 10px; border-radius: 999px;
  font: 600 12.5px/1 inherit; font-family: inherit; cursor: pointer; transition: background .15s ease, border-color .15s ease;
}
.wf-trip-cat:hover { background: rgba(255,255,255,.09); }
.wf-trip-cat.is-active { border-color: #4285f4; background: rgba(66,133,244,.16); }
.wf-trip-cat-dot { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; background: var(--c); color: #0d0f13; flex: none; }

.wf-trip-filter-bar { display: none; align-items: center; gap: 8px; margin: 0 0 10px; font-size: 12.5px; color: var(--muted); }
.wf-trip-filter-bar.is-visible { display: flex; }
.wf-trip-filter-clear {
  appearance: none; border: 1px solid var(--border); background: rgba(255,255,255,.06); color: var(--text); border-radius: 8px;
  height: 26px; padding: 0 10px; font: 600 11.5px/1 inherit; font-family: inherit; cursor: pointer;
}
.wf-trip-filter-clear:hover { background: rgba(255,255,255,.12); }

.wf-trip-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 20px calc(20px + env(safe-area-inset-bottom)); max-width: 520px; width: 100%; margin: 0 auto; }
.wf-trip-group-label {
  appearance: none; border: 0; width: 100%; position: sticky; top: 0; z-index: 1; cursor: pointer;
  display: flex; align-items: center; gap: 8px; padding: 10px 4px; margin-top: 2px;
  font: 700 11px/1 inherit; font-family: inherit; letter-spacing: .08em; text-transform: uppercase;
  color: var(--muted); background: #0e0f13; transition: color .15s ease;
}
.wf-trip-group-label:hover { color: var(--text); }
.wf-trip-group-label span:first-child { flex: 1; text-align: left; }
.wf-trip-group-count {
  flex: none; font-size: 10.5px; font-weight: 700; letter-spacing: 0; color: var(--muted);
  background: rgba(255,255,255,.08); border-radius: 999px; padding: 2px 7px; min-width: 20px; text-align: center;
}
.wf-trip-group-label svg { flex: none; transition: transform .15s ease; }
.wf-trip-group-label.is-expanded svg { transform: rotate(180deg); }
.wf-trip-item {
  appearance: none; border: 0; background: transparent; color: var(--text); width: 100%; display: flex; align-items: center;
  gap: 12px; padding: 11px 8px; border-radius: 11px; cursor: pointer; font: 500 14px/1.25 inherit; text-align: left;
}
.wf-trip-item:hover { background: rgba(255,255,255,.06); }
.wf-trip-item-icon { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--c); color: #0d0f13; }
.wf-trip-item-body { flex: 1; min-width: 0; }
.wf-trip-item-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wf-trip-empty { padding: 32px 8px; text-align: center; font-size: 13px; color: var(--muted); }

/* ---- wide screens: a docked left sidebar instead of a full-screen takeover,
   so the map stays visible and interactive beside it (see index.html's own
   width check, which also keeps the map loaded rather than hiding it). ---- */
@media (min-width: 561px) {
  .wf-trip {
    inset: auto; left: 0; top: 0; bottom: var(--wf-sidebar-bottom, 0px); width: 400px; /* stops above the QR card (index.html) */
    border-right: 1px solid var(--border); box-shadow: 0 0 40px rgba(0,0,0,.35);
  }
  .wf-trip-header, .wf-trip-list { max-width: none; }
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

function styleFor(node) {
  if (node.class === 'room') {
    const cat = pickerCategoryOf(node);
    if (node.profile) return { color: node.profile.tint, icon: node.profile.icon };
    if (cat) return { color: cat.tint, icon: cat.icon };
    return { color: '#9aa4b2', icon: 'box' };
  }
  return OBJECT_STYLE[node.class] || OBJECT_STYLE.default;
}

/**
 * Full-screen trip-setup flow — start / destination as plain text inputs,
 * a category filter row, and a scrollable all-floors destination list
 * (grouped by floor, filtered by category then by typed text). Replaces
 * the old panel-style RouteSelector as the app's entry point.
 *
 * `floors` is [{ url, name, nodes }, ...] across every floor of the
 * building — nodes already deduped/reachable-filtered the way a single
 * floor's own picker expects (see dedupeNodesByLabel upstream).
 *
 * Fires `onPlan({ startFloor, startNode, destFloor, destNode, preferStairs })`
 * once both a start and a destination are chosen.
 */
export class TripPlanner {
  constructor(container, { floors, defaultStartNode = null, appName = 'Masar', logoUrl = null } = {}) {
    ensureStyle();
    this.container = container;
    this.floors = floors;
    this._activeField = null; // 'start' | 'dest' | null (null = fields collapsed, nothing being edited)
    this._query = '';
    this._category = null;
    // Per-floor manual expand/collapse (by floor name), ignored while a
    // query/category filter is active — a filtered floor always shows its
    // matches. Reset to empty (= everything collapsed) whenever the query
    // goes back to empty, so a manual expand never lingers past the search
    // that prompted it — see _renderList.
    this._expandedFloors = new Set();
    this._wasFiltering = false; // tracks the filtering->not-filtering edge, so clearing the search only resets _expandedFloors ONCE, not on every render while already empty (which would also wipe a plain manual toggle's own re-render)
    this.startSelection = defaultStartNode;
    this.destSelection = null;

    this.root = document.createElement('div');
    this.root.className = 'wf-trip';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="wf-trip-header">
        <div class="wf-trip-brand">${logoUrl ? `<img class="wf-trip-logo" src="${logoUrl}" alt="" />` : ''}<span class="wf-trip-brand-name">${appName}</span><button type="button" class="wf-trip-info" data-role="info" aria-label="How to use ${appName}" title="How to use">${icon('info', { size: 19, stroke: 2.2 })}</button></div>
        <h1>Where are you headed?</h1>
        <div class="wf-trip-fields">
          <div class="wf-trip-rail"><span class="wf-trip-from"></span><span class="wf-trip-line"></span><span class="wf-trip-to">${icon('pin', { size: 18, stroke: 2.2 })}</span></div>
          <div class="wf-trip-inputs">
            <div class="wf-trip-input-wrap" data-role="start-wrap"><input type="text" data-role="start-input" placeholder="Choose starting point" autocomplete="off" aria-label="Start" /><button type="button" class="wf-trip-clear" data-role="start-clear" aria-label="Clear start">${icon('close', { size: 13, stroke: 2.6 })}</button></div>
            <div class="wf-trip-input-wrap wf-trip-input-wrap--dest" data-role="dest-wrap"><span class="wf-trip-input-icon">${icon('search', { size: 16, stroke: 2.2 })}</span><input type="text" data-role="dest-input" placeholder="Choose destination" autocomplete="off" aria-label="Destination" /><button type="button" class="wf-trip-clear" data-role="dest-clear" aria-label="Clear destination">${icon('close', { size: 13, stroke: 2.6 })}</button></div>
          </div>
          <button type="button" class="wf-trip-swap" title="Swap start and destination" aria-label="Swap start and destination">${icon('swap', { size: 17, stroke: 2.2 })}</button>
        </div>
        <label class="wf-trip-prefer"><input type="checkbox" data-role="prefer-stairs" /> Prefer stairs over elevators</label>
        <div class="wf-trip-cats" data-role="cats"></div>
        <div class="wf-trip-filter-bar" data-role="filter-bar"><span data-role="filter-text"></span><button type="button" class="wf-trip-filter-clear" data-role="filter-clear">Clear filter</button></div>
      </div>
      <div class="wf-trip-list" data-role="list"></div>
      <div class="wf-trip-help" data-role="help" role="dialog" aria-label="How to use ${appName}">
        <div class="wf-trip-help-backdrop" data-role="help-backdrop"></div>
        <div class="wf-trip-help-card">
          <div class="wf-trip-help-head"><h2>How to use ${appName}</h2><button type="button" class="wf-trip-help-close" data-role="help-close" aria-label="Close">${icon('close', { size: 17, stroke: 2.3 })}</button></div>
          <ol class="wf-trip-help-steps">
            <li><strong>Set your start and destination</strong><span>Tap a field and type or pick from the list. Your start is filled in for you; use the swap button to flip the two.</span></li>
            <li><strong>Narrow it down</strong><span>Use the filter chips for meeting rooms, toilets or amenities. "Exit" and "Elevator" always take you to the nearest one.</span></li>
            <li><strong>Check your route</strong><span>Review the steps and tap Start. Turn on "Prefer stairs" if you'd rather avoid elevators.</span></li>
            <li><strong>Follow the map</strong><span>The top card shows your next step. Drag the slider to show how far you've walked.</span></li>
            <li><strong>Confirm as you go</strong><span>Tap the green button when you reach each stop, or "Previous step" to go back. Cancel ends the trip.</span></li>
          </ol>
        </div>
      </div>`;
    container.appendChild(this.root);

    this.startInput = this.root.querySelector('[data-role="start-input"]');
    this.destInput = this.root.querySelector('[data-role="dest-input"]');
    this.startWrap = this.root.querySelector('[data-role="start-wrap"]');
    this.destWrap = this.root.querySelector('[data-role="dest-wrap"]');
    this.preferStairsInput = this.root.querySelector('[data-role="prefer-stairs"]');
    this.catsEl = this.root.querySelector('[data-role="cats"]');
    this.filterBarEl = this.root.querySelector('[data-role="filter-bar"]');
    this.filterTextEl = this.root.querySelector('[data-role="filter-text"]');
    this.listEl = this.root.querySelector('[data-role="list"]');

    if (defaultStartNode) this.startInput.value = nodeName(defaultStartNode.node);

    this._buildCategoryRow();
    this._renderList();

    this.startInput.addEventListener('focus', () => this._setActiveField('start'));
    this.destInput.addEventListener('focus', () => this._setActiveField('dest'));
    this.startInput.addEventListener('input', () => { this.startSelection = null; this._query = this.startInput.value; this._renderList(); });
    this.destInput.addEventListener('input', () => { this.destSelection = null; this._query = this.destInput.value; this._renderList(); });
    this.root.querySelector('[data-role="filter-clear"]').addEventListener('click', () => this._setCategory(null));
    this.root.querySelector('.wf-trip-swap').addEventListener('click', () => this._swap());
    this.helpEl = this.root.querySelector('[data-role="help"]');
    const setHelp = (open) => this.helpEl.classList.toggle('is-open', open);
    this.root.querySelector('[data-role="info"]').addEventListener('click', () => setHelp(true));
    this.root.querySelector('[data-role="help-close"]').addEventListener('click', () => setHelp(false));
    this.root.querySelector('[data-role="help-backdrop"]').addEventListener('click', () => setHelp(false));
    this.root.addEventListener('keydown', (e) => { if (e.key === 'Escape') setHelp(false); });
    this.root.querySelector('[data-role="start-clear"]').addEventListener('click', () => this._clearField('start'));
    this.root.querySelector('[data-role="dest-clear"]').addEventListener('click', () => this._clearField('dest'));

    // Mobile: a fixed panel is sized to the layout viewport, which the soft
    // keyboard overlays instead of shrinking — so track the visual viewport.
    this._vv = window.visualViewport || null;
    this._onViewport = () => this._fitToVisualViewport();
    if (this._vv) {
      this._vv.addEventListener('resize', this._onViewport);
      this._vv.addEventListener('scroll', this._onViewport);
    }
  }

  _fitToVisualViewport() {
    const vv = this._vv;
    const docked = window.matchMedia('(min-width: 561px)').matches; // sidebar mode: no keyboard overlap handling needed
    const keyboard = !docked && !!vv && window.innerHeight - vv.height > 120;
    this.root.classList.toggle('is-kb', keyboard);
    if (keyboard) {
      this.root.style.top = `${vv.offsetTop}px`;
      this.root.style.height = `${vv.height}px`;
      this.root.style.bottom = 'auto';
    } else {
      this.root.style.top = this.root.style.height = this.root.style.bottom = '';
    }
  }

  /** `node` is { floor, node } or null — kept separate from the text input so clearing/retyping text never loses the resolved selection until a NEW one is picked. */
  _setActiveField(field) {
    this._activeField = field;
    this.startWrap.classList.toggle('is-active', field === 'start');
    this.destWrap.classList.toggle('is-active', field === 'dest');
    this._query = (field === 'start' ? this.startInput.value : this.destInput.value) || '';
    this._renderList();
  }

  // The x button: empties the field AND drops its resolved selection, then keeps the keyboard up on it.
  _clearField(field) {
    const input = field === 'start' ? this.startInput : this.destInput;
    input.value = '';
    if (field === 'start') this.startSelection = null;
    else this.destSelection = null;
    this._activeField = field;
    this._setActiveField(field);
    input.focus();
  }

  _swap() {
    const a = this.startSelection;
    this.startSelection = this.destSelection;
    this.destSelection = a;
    this.startInput.value = this.startSelection ? nodeName(this.startSelection.node) : '';
    this.destInput.value = this.destSelection ? nodeName(this.destSelection.node) : '';
  }

  _buildCategoryRow() {
    const buckets = new Map();
    for (const floor of this.floors) {
      for (const node of floor.nodes) {
        const cat = pickerCategoryOf(node);
        if (!cat) continue;
        if (!buckets.has(cat.id)) buckets.set(cat.id, cat);
      }
    }
    this.catsEl.innerHTML = '';
    for (const cat of PICKER_CATEGORIES.filter((c) => buckets.has(c.id))) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wf-trip-cat';
      btn.dataset.category = cat.id;
      btn.innerHTML = `<span class="wf-trip-cat-dot" style="--c:${cat.tint}">${icon(cat.icon, { size: 12, stroke: 2.4 })}</span>${cat.label}`;
      btn.addEventListener('click', () => this._setCategory(this._category === cat.id ? null : cat.id));
      this.catsEl.appendChild(btn);
    }
  }

  _setCategory(category) {
    this._category = category;
    this.catsEl.querySelectorAll('.wf-trip-cat').forEach((b) => b.classList.toggle('is-active', b.dataset.category === category));
    this.filterBarEl.classList.toggle('is-visible', !!category);
    if (category) {
      const cat = PICKER_CATEGORIES.find((c) => c.id === category);
      this.filterTextEl.textContent = `Filtering by ${cat.label}`;
    }
    this._renderList();
  }

  // Category filter applies first, then the typed text narrows what's left — per spec.
  // Each floor is collapsible: collapsed by default, forced open while a
  // query/category filter is narrowing the list (so filtered matches are
  // never hidden behind a collapsed header), and otherwise manually
  // toggled — see this._expandedFloors and the click handler below.
  _renderList() {
    const query = labelKey(this._query);
    const isFiltering = !!query || !!this._category;
    // _expandedFloors = the open floors. Closed by default; the moment a search/filter
    // starts, every floor opens; a floor the user then closes stays closed while they keep
    // typing; the moment the search/filter ends, everything collapses and the state resets (with nothing typed, header taps toggle freely).
    if (isFiltering && !this._wasFiltering) for (const f of this.floors) this._expandedFloors.add(f.name);
    if (!isFiltering && this._wasFiltering) this._expandedFloors.clear();
    this._wasFiltering = isFiltering;
    this.listEl.innerHTML = '';
    let any = false;
    // Picking the start hides the chosen destination, and vice versa.
    const picking = this._activeField || 'dest';
    const other = picking === 'start' ? this.destSelection : this.startSelection;
    for (const floor of this.floors) {
      const seen = new Set(); // same-named nodes are one place to a visitor — list each name once per floor
      const items = floor.nodes.filter((n) => {
        if (PICKER_HIDDEN(n)) return false;
        // Unnamed exits ("Exit") and elevators ("Elevator") stand for "the nearest one", so they can't be a starting point.
        if (picking === 'start' && (n.genericExit || n.isElevator)) return false;
        const key = labelKey(nodeName(n));
        if (seen.has(key)) return false;
        seen.add(key);
        if (other && other.floor === floor && labelKey(nodeName(other.node)) === key) return false;
        if (this._category && pickerCategoryOf(n)?.id !== this._category) return false;
        if (query && !labelKey(nodeName(n)).includes(query)) return false;
        return true;
      });
      if (!items.length) continue;
      any = true;
      const expanded = this._expandedFloors.has(floor.name);
      const groupEl = document.createElement('button');
      groupEl.type = 'button';
      groupEl.className = 'wf-trip-group-label';
      groupEl.innerHTML = `<span>${floor.name}</span><span class="wf-trip-group-count">${items.length}</span>${icon('chevron', { size: 14, stroke: 2.4 })}`;
      groupEl.classList.toggle('is-expanded', expanded);
      groupEl.addEventListener('click', () => {
        if (this._expandedFloors.has(floor.name)) this._expandedFloors.delete(floor.name);
        else this._expandedFloors.add(floor.name);
        this._renderList();
      });
      this.listEl.appendChild(groupEl);
      if (!expanded) continue;
      for (const node of items) {
        const style = styleFor(node);
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'wf-trip-item';
        item.innerHTML = `<span class="wf-trip-item-icon" style="--c:${style.color}">${icon(style.icon, { size: 16, stroke: 2.2 })}</span>
          <span class="wf-trip-item-body"><span class="wf-trip-item-name">${nodeName(node)}</span></span>`;
        item.addEventListener('click', () => this._pick(floor, node));
        this.listEl.appendChild(item);
      }
    }
    if (!any) this.listEl.innerHTML = '<div class="wf-trip-empty">No matching places</div>';
  }

  _pick(floor, node) {
    const selection = { floor, node };
    const field = this._activeField || 'dest'; // no field focused yet (fresh open) — a tap picks the destination, the common case
    if (field === 'start') {
      this.startSelection = selection;
      this.startInput.value = nodeName(node);
      if (this.destSelection) {
        // Destination was already picked (the user came back to change the
        // start) — finish right away instead of redirecting them into the
        // destination picker again.
        this._activeField = null;
        this.startInput.blur();
        this._maybeFinish();
      } else {
        this._setActiveField('dest');
        this.destInput.focus();
      }
    } else {
      this.destSelection = selection;
      this.destInput.value = nodeName(node);
      this._activeField = null;
      this.destInput.blur();
      this._maybeFinish();
    }
  }

  _maybeFinish() {
    if (!this.startSelection || !this.destSelection) return;
    this.onPlan?.({
      startFloor: this.startSelection.floor,
      startNode: this.startSelection.node,
      destFloor: this.destSelection.floor,
      destNode: this.destSelection.node,
      preferStairs: this.preferStairsInput.checked,
    });
  }

  /**
   * Clears the destination and any active filter/search, optionally setting
   * a new start (e.g. "you just arrived here, plan the next trip from
   * there"). Used between trips instead of leaving a prior pick's category
   * filter or search text stuck on screen for an unrelated new trip.
   */
  reset({ start = null } = {}) {
    this.startSelection = start;
    this.startInput.value = start ? nodeName(start.node) : '';
    this.destSelection = null;
    this.destInput.value = '';
    this._setCategory(null);
    this._query = '';
    this._activeField = null;
    this.startWrap.classList.remove('is-active');
    this.destWrap.classList.remove('is-active');
    this._renderList();
  }

  show() {
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }

  dispose() {
    if (this._vv) {
      this._vv.removeEventListener('resize', this._onViewport);
      this._vv.removeEventListener('scroll', this._onViewport);
    }
    this.root.remove();
  }
}
