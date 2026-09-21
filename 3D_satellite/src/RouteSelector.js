import { icon } from './ui/icons.js';
import {
  FLOOR_LOADED_EVENT,
  ROUTE_CHANGE_EVENT,
  ROUTE_CLEAR_EVENT,
  ROUTE_CLEARED_EVENT,
  ROUTE_SET_EVENT,
  ROUTE_ERROR_EVENT,
} from './core/events.js';

const STYLE = `
.sat-route, .sat-route * { box-sizing: border-box; }
.sat-route {
  --text: var(--sat-text, #eef1f5); --muted: var(--sat-muted, #98a2b3); --border: var(--sat-border, rgba(255,255,255,.09));
  font-family: var(--sat-font, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  color: var(--text); width: 100%;
}
.sat-route-fields { display: flex; align-items: stretch; gap: 10px; }
.sat-route-rail { display: flex; flex-direction: column; align-items: center; padding: 19px 0 17px; width: 16px; flex: none; }
.sat-route-from { width: 12px; height: 12px; border-radius: 50%; border: 3px solid #4285f4; background: transparent; }
.sat-route-line { flex: 1; width: 0; margin: 4px 0; border-left: 2px dotted rgba(255,255,255,.28); }
.sat-route-to { color: #ea4335; display: grid; place-items: center; }
.sat-route-selects { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.sat-field { position: relative; display: block; }
.sat-field select {
  appearance: none; -webkit-appearance: none; width: 100%; height: 42px; padding: 0 36px 0 14px; border-radius: 11px;
  border: 1px solid var(--border); background: rgba(255,255,255,.06); color: var(--text);
  font: 500 14px/1 inherit; font-family: inherit; color-scheme: dark; cursor: pointer; text-overflow: ellipsis;
  transition: background .15s ease, border-color .15s ease;
}
.sat-field select:hover:not(:disabled) { background: rgba(255,255,255,.09); }
.sat-field select:focus-visible { outline: 2px solid #4285f4; outline-offset: 1px; }
.sat-field select:disabled { color: var(--muted); cursor: default; }
.sat-field::after {
  content: ''; position: absolute; right: 15px; top: 50%; width: 7px; height: 7px; margin-top: -6px; pointer-events: none;
  border-right: 2px solid var(--muted); border-bottom: 2px solid var(--muted); transform: rotate(45deg);
}
.sat-route-swap {
  appearance: none; align-self: center; flex: none; width: 36px; height: 36px; border-radius: 50%; padding: 0; cursor: pointer;
  border: 1px solid var(--border); background: rgba(255,255,255,.06); color: var(--text); display: grid; place-items: center;
  transition: background .15s ease, transform .3s ease;
}
.sat-route-swap:hover { background: rgba(255,255,255,.12); }
.sat-route-swap:active { transform: rotate(180deg); }
.sat-route-swap:focus-visible { outline: 2px solid #4285f4; }
.sat-route-summary {
  display: none; align-items: center; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);
  font-size: 13px; color: var(--muted);
}
.sat-route.has-route .sat-route-summary { display: flex; }
.sat-route-summary strong { font-size: 20px; font-weight: 650; color: var(--text); letter-spacing: -.01em; }
.sat-route-summary .sat-route-meta { flex: 1; min-width: 0; }
.sat-route-clear {
  appearance: none; border: 1px solid var(--border); background: rgba(255,255,255,.06); color: var(--text); border-radius: 9px;
  height: 32px; padding: 0 12px; font: 600 12px/1 inherit; font-family: inherit; cursor: pointer; transition: background .15s ease;
}
.sat-route-clear:hover { background: rgba(255,255,255,.12); }
.sat-route-error { margin-top: 8px; font-size: 12px; color: #ff8a80; }
.sat-route-error:empty { display: none; }
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const el = document.createElement('style');
  el.textContent = STYLE;
  document.head.appendChild(el);
  styleInjected = true;
}

function groupLabel(node) {
  if (node.class === 'room') return 'Rooms';
  if (node.class === 'exits') return 'Entrances & exits';
  return node.class.charAt(0).toUpperCase() + node.class.slice(1);
}

export function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

export function formatDistance(meters) {
  return `${Math.round(meters)} m`;
}

/**
 * Start / destination picker, styled as a "directions" card.
 *
 * Fills itself from the view's 'wayfinding:floor-loaded' event and, whenever
 * both fields have a value, dispatches 'wayfinding:route-change'. It also
 * shows the distance / walking time from 'wayfinding:route-set'.
 *
 * options.defaultStartId pre-selects the start (e.g. the entrance "you" are at).
 */
export class RouteSelector {
  constructor(container, options = {}) {
    this.container = container;
    this.eventTarget = options.eventTarget || container;
    this.defaultStartId = options.defaultStartId || null;
    this.nodes = [];

    ensureStyle();

    this.root = document.createElement('div');
    this.root.className = 'sat-route';
    this.root.innerHTML = `
      <div class="sat-route-fields">
        <div class="sat-route-rail"><span class="sat-route-from"></span><span class="sat-route-line"></span><span class="sat-route-to">${icon('pin', { size: 18, stroke: 2.2 })}</span></div>
        <div class="sat-route-selects">
          <label class="sat-field"><select data-role="start" aria-label="Start" disabled></select></label>
          <label class="sat-field"><select data-role="dest" aria-label="Destination" disabled></select></label>
        </div>
        <button type="button" class="sat-route-swap" title="Swap start and destination" aria-label="Swap start and destination">${icon('swap', { size: 17, stroke: 2.2 })}</button>
      </div>
      <div class="sat-route-summary">
        <div class="sat-route-meta"><strong data-role="time"></strong> <span data-role="distance"></span></div>
        <button type="button" class="sat-route-clear">Clear</button>
      </div>
      <div class="sat-route-error"></div>`;
    container.appendChild(this.root);

    this.startSelect = this.root.querySelector('[data-role="start"]');
    this.destSelect = this.root.querySelector('[data-role="dest"]');
    this.errorEl = this.root.querySelector('.sat-route-error');
    this.timeEl = this.root.querySelector('[data-role="time"]');
    this.distanceEl = this.root.querySelector('[data-role="distance"]');

    this._handlers = {
      [FLOOR_LOADED_EVENT]: (e) => this.setNodes(e.detail?.nodes || []),
      [ROUTE_ERROR_EVENT]: (e) => {
        this.root.classList.remove('has-route');
        this.errorEl.textContent = e.detail?.reason === 'no-path' ? 'No route found between those two places.' : 'Could not set route.';
      },
      [ROUTE_SET_EVENT]: (e) => this._showSummary(e.detail),
      [ROUTE_CLEARED_EVENT]: () => this.root.classList.remove('has-route'),
    };
    for (const [type, fn] of Object.entries(this._handlers)) this.eventTarget.addEventListener(type, fn);

    this._onChange = () => this._emitChange();
    this.startSelect.addEventListener('change', this._onChange);
    this.destSelect.addEventListener('change', this._onChange);
    this.root.querySelector('.sat-route-swap').addEventListener('click', () => {
      const a = this.startSelect.value;
      this.startSelect.value = this.destSelect.value;
      this.destSelect.value = a;
      this._emitChange();
    });
    this.root.querySelector('.sat-route-clear').addEventListener('click', () => {
      this.destSelect.value = '';
      this.errorEl.textContent = '';
      this.eventTarget.dispatchEvent(new CustomEvent(ROUTE_CLEAR_EVENT, { bubbles: true }));
    });
    // Keep the map from receiving gestures that start on the card.
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('wheel', (e) => e.stopPropagation());
  }

  _fill(select, placeholder, { skip } = {}) {
    const previous = select.value;
    select.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder;
    select.appendChild(ph);
    const groups = new Map();
    for (const node of this.nodes) {
      const g = groupLabel(node);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(node);
    }
    for (const [name, list] of groups) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = name;
      for (const node of list) {
        const option = document.createElement('option');
        option.value = node.id;
        option.textContent = node.label;
        optgroup.appendChild(option);
      }
      select.appendChild(optgroup);
    }
    select.disabled = false;
    if (this.nodes.some((n) => n.id === previous)) select.value = previous;
  }

  setNodes(nodes) {
    this.nodes = nodes.filter((n) => n.reachable);
    this._fill(this.startSelect, 'Choose starting point');
    this._fill(this.destSelect, 'Choose destination');
    if (!this.startSelect.value && this.defaultStartId && this.nodes.some((n) => n.id === this.defaultStartId)) {
      this.startSelect.value = this.defaultStartId;
    }
  }

  _emitChange() {
    this.errorEl.textContent = '';
    const startId = this.startSelect.value;
    const destinationId = this.destSelect.value;
    if (!startId || !destinationId) return;
    this.eventTarget.dispatchEvent(new CustomEvent(ROUTE_CHANGE_EVENT, { detail: { startId, destinationId }, bubbles: true }));
  }

  _showSummary({ distanceMeters, durationSeconds }) {
    this.errorEl.textContent = '';
    if (!distanceMeters) {
      this.timeEl.textContent = 'You are here';
      this.distanceEl.textContent = '';
    } else {
      this.timeEl.textContent = formatDuration(durationSeconds);
      this.distanceEl.textContent = `walk · ${formatDistance(distanceMeters)}`;
    }
    this.root.classList.add('has-route');
  }

  dispose() {
    for (const [type, fn] of Object.entries(this._handlers)) this.eventTarget.removeEventListener(type, fn);
    this.root.remove();
  }
}
