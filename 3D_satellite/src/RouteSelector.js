import { icon } from './ui/icons.js';
import { dedupeNodesByLabel, labelKey } from './core/FloorDataLoader.js';
import { OBJECT_STYLE, PICKER_CATEGORIES } from './core/constants.js';
import {
  FLOOR_LOADED_EVENT,
  ROUTE_CHANGE_EVENT,
  ROUTE_CLEAR_EVENT,
  ROUTE_CLEARED_EVENT,
  ROUTE_SET_EVENT,
  ROUTE_ERROR_EVENT,
  ROOM_SELECT_EVENT,
} from './core/events.js';

const STYLE = `
.sat-route, .sat-route * { box-sizing: border-box; }
.sat-route {
  --text: var(--sat-text, #eef1f5); --muted: var(--sat-muted, #98a2b3); --border: var(--sat-border, rgba(255,255,255,.09));
  font-family: var(--sat-font, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  color: var(--text); width: 100%;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
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
.sat-field-btn {
  appearance: none; -webkit-appearance: none; width: 100%; height: 42px; padding: 0 36px 0 14px; border-radius: 11px;
  border: 1px solid var(--border); background: rgba(255,255,255,.06); color: var(--text); text-align: left;
  font: 500 14px/1 inherit; font-family: inherit; cursor: pointer; display: block;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: background .15s ease, border-color .15s ease;
}
.sat-field-btn:hover:not(:disabled) { background: rgba(255,255,255,.09); }
.sat-field-btn:focus-visible { outline: 2px solid #4285f4; outline-offset: 1px; }
.sat-field-btn:disabled { color: var(--muted); cursor: default; }
.sat-field-btn.is-placeholder { color: var(--muted); }

/* ---- destination picker ---- */
/* Self-contained custom properties: this sheet is appended straight to
   <body> (see the constructor), outside .sat-route's subtree, so it can't
   rely on inheriting --text/--muted/--border or the user-select/touch-action
   reset from it — without these it rendered with default (black) text. */
.sat-dest-picker, .sat-dest-picker * { box-sizing: border-box; }
.sat-dest-picker {
  --text: var(--sat-text, #eef1f5); --muted: var(--sat-muted, #98a2b3); --border: var(--sat-border, rgba(255,255,255,.09));
  font-family: var(--sat-font, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  color: var(--text);
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  position: fixed; inset: 0; z-index: 60; display: none; align-items: center; justify-content: center; padding: 24px;
}
.sat-dest-picker.is-open { display: flex; }
.sat-dest-backdrop { position: absolute; inset: 0; background: rgba(6,7,9,.6); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
.sat-dest-sheet {
  position: relative; width: min(420px, 100%); max-height: min(600px, 100%); display: flex; flex-direction: column;
  background: rgba(19,21,26,.97); border: 1px solid var(--border); border-radius: 22px; box-shadow: 0 24px 60px rgba(0,0,0,.55);
  -webkit-backdrop-filter: blur(20px) saturate(1.4); backdrop-filter: blur(20px) saturate(1.4); overflow: hidden;
}
.sat-dest-header { display: flex; align-items: center; gap: 4px; padding: 14px 10px 8px 16px; flex: none; }
.sat-dest-header-btn {
  appearance: none; border: 0; background: transparent; color: var(--text); width: 32px; height: 32px; border-radius: 50%;
  display: grid; place-items: center; cursor: pointer; flex: none; transition: background .15s ease;
}
.sat-dest-header-btn:hover { background: rgba(255,255,255,.08); }
.sat-dest-header-btn[hidden] { display: none; }
/* Several picker children (.sat-field, .sat-dest-list...) set their own
   display property, which otherwise beats the UA default [hidden] rule and
   leaves a "hidden" element rendered anyway. */
.sat-dest-picker [hidden] { display: none !important; }
.sat-dest-title { flex: 1; font: 650 15px/1 inherit; letter-spacing: -.01em; }
.sat-dest-body { padding: 4px 16px 18px; overflow-y: auto; flex: 1; }
.sat-dest-select { margin-bottom: 18px; }
.sat-dest-select select {
  appearance: none; -webkit-appearance: none; width: 100%; height: 42px; padding: 0 36px 0 14px; border-radius: 11px;
  border: 1px solid var(--border); background: rgba(255,255,255,.06); color: var(--text);
  font: 500 14px/1 inherit; font-family: inherit; color-scheme: dark; cursor: pointer;
}
.sat-dest-search { position: relative; display: block; margin-bottom: 22px; }
.sat-dest-search svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
.sat-dest-search input {
  width: 100%; height: 42px; padding: 0 14px 0 38px; border-radius: 11px; border: 1px solid var(--border);
  background: rgba(255,255,255,.06); color: var(--text); font: 500 14px/1 inherit; font-family: inherit;
  -webkit-user-select: text; user-select: text; outline: none;
}
.sat-dest-search input:focus { border-color: #4285f4; }
.sat-dest-search input::placeholder { color: var(--muted); }
.sat-dest-empty { padding: 18px 8px; text-align: center; font-size: 13px; color: var(--muted); }
.sat-dest-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(74px, 1fr)); gap: 16px 6px; }
.sat-dest-cat { appearance: none; border: 0; background: transparent; color: var(--text); display: flex; flex-direction: column; align-items: center; gap: 7px; cursor: pointer; padding: 2px 0; }
.sat-dest-cat-circle { width: 54px; height: 54px; border-radius: 50%; display: grid; place-items: center; background: var(--c); color: #0d0f13; transition: transform .15s ease; }
.sat-dest-cat:hover .sat-dest-cat-circle { transform: scale(1.06); }
.sat-dest-cat:active .sat-dest-cat-circle { transform: scale(.94); }
.sat-dest-cat-label { font-size: 11.5px; font-weight: 600; text-align: center; color: var(--muted); max-width: 76px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sat-dest-list { display: flex; flex-direction: column; gap: 2px; }
.sat-dest-list-item {
  appearance: none; border: 0; background: transparent; color: var(--text); width: 100%; display: flex; align-items: center;
  gap: 12px; padding: 10px 8px; border-radius: 11px; cursor: pointer; font: 500 14px/1 inherit; text-align: left;
}
.sat-dest-list-item:hover { background: rgba(255,255,255,.07); }
.sat-dest-list-icon { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--c); color: #0d0f13; }
.sat-dest-list-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 560px) {
  .sat-dest-picker { padding: 12px; align-items: flex-end; }
  .sat-dest-sheet { width: 100%; max-height: min(78vh, 100%); border-radius: 20px 20px 0 0; }
  /* iOS Safari zooms the page when focusing an input under 16px, which
     leaves the sheet half off-screen. */
  .sat-dest-search input { font-size: 16px; }
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

// The category grid's catch-all bucket for every searchable node that isn't
// a room (exits, stairs, fire equipment...) — each still keeps its own
// OBJECT_STYLE icon/color once you're inside the list, this is just the
// round button that gets you there.
const OTHER_STYLE = { label: 'Other', color: '#9aa4b2', icon: 'box' };

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
 * options.defaultStartId pre-selects the start; without it, the floor's
 * default (the kiosk nearest a "main exit", SatelliteView.defaultStartNodeId) is used.
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
          <button type="button" class="sat-field sat-field-btn is-placeholder" data-role="start-trigger" aria-label="Start" disabled>
            <span data-role="start-trigger-text">Choose starting point</span>
          </button>
          <button type="button" class="sat-field sat-field-btn is-placeholder" data-role="dest-trigger" aria-label="Destination" disabled>
            <span data-role="dest-trigger-text">Choose destination</span>
          </button>
        </div>
        <button type="button" class="sat-route-swap" title="Swap start and destination" aria-label="Swap start and destination">${icon('swap', { size: 17, stroke: 2.2 })}</button>
      </div>
      <div class="sat-route-summary">
        <div class="sat-route-meta"><strong data-role="time"></strong> <span data-role="distance"></span></div>
        <button type="button" class="sat-route-clear">Clear</button>
      </div>
      <div class="sat-route-error"></div>`;
    container.appendChild(this.root);

    // One shared picker, reused for both fields (see _openPicker(field)).
    // It's appended straight to <body>, not nested under `this.root`: a
    // backdrop-filter anywhere up the tree (the example page's own .panel
    // has one) turns position:fixed descendants into something confined to
    // that ancestor's box instead of the viewport, so it has to live outside it.
    this.picker = document.createElement('div');
    this.picker.className = 'sat-dest-picker';
    this.picker.innerHTML = `
      <div class="sat-dest-backdrop" data-role="backdrop"></div>
      <div class="sat-dest-sheet" role="dialog" aria-label="Choose a place">
        <div class="sat-dest-header">
          <button type="button" class="sat-dest-header-btn" data-role="back" aria-label="Back" hidden>${icon('back', { size: 18, stroke: 2.3 })}</button>
          <div class="sat-dest-title" data-role="picker-title">Choose destination</div>
          <button type="button" class="sat-dest-header-btn" data-role="close" aria-label="Close">${icon('close', { size: 16, stroke: 2.3 })}</button>
        </div>
        <div class="sat-dest-body">
          <label class="sat-dest-search">${icon('search', { size: 16, stroke: 2.2 })}<input type="search" data-role="search" placeholder="Search or scroll all places" autocomplete="off" aria-label="Search places"></label>
          <select data-role="start" aria-label="Start" hidden></select>
          <select data-role="dest" aria-label="Destination" hidden></select>
          <div data-role="grid-wrap">
            <div class="sat-dest-grid" data-role="grid"></div>
          </div>
          <div class="sat-dest-list" data-role="list" hidden></div>
        </div>
      </div>`;
    document.body.appendChild(this.picker);

    this.startSelect = this.picker.querySelector('[data-role="start"]');
    this.destSelect = this.picker.querySelector('[data-role="dest"]');
    this.startTrigger = this.root.querySelector('[data-role="start-trigger"]');
    this.startTriggerText = this.root.querySelector('[data-role="start-trigger-text"]');
    this.destTrigger = this.root.querySelector('[data-role="dest-trigger"]');
    this.destTriggerText = this.root.querySelector('[data-role="dest-trigger-text"]');
    this.errorEl = this.root.querySelector('.sat-route-error');
    this.timeEl = this.root.querySelector('[data-role="time"]');
    this.distanceEl = this.root.querySelector('[data-role="distance"]');

    this.pickerTitle = this.picker.querySelector('[data-role="picker-title"]');
    this.pickerBack = this.picker.querySelector('[data-role="back"]');
    this.pickerGridWrap = this.picker.querySelector('[data-role="grid-wrap"]');
    this.pickerSearch = this.picker.querySelector('[data-role="search"]');
    this.pickerGrid = this.picker.querySelector('[data-role="grid"]');
    this.pickerList = this.picker.querySelector('[data-role="list"]');
    // The picker floats outside `this.root`, so it needs its own guard
    // against leaking gestures to the map underneath.
    this.picker.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.picker.addEventListener('wheel', (e) => e.stopPropagation());

    this._handlers = {
      [FLOOR_LOADED_EVENT]: (e) => this.setNodes(e.detail?.nodes || [], e.detail?.defaultStartId),
      [ROUTE_ERROR_EVENT]: (e) => {
        this.root.classList.remove('has-route');
        this.errorEl.textContent = e.detail?.reason === 'no-path' ? 'No route found between those two places.' : 'Could not set route.';
      },
      [ROUTE_SET_EVENT]: (e) => this._showSummary(e.detail),
      [ROUTE_CLEARED_EVENT]: () => this.root.classList.remove('has-route'),
      [ROOM_SELECT_EVENT]: (e) => this._onRoomSelect(e.detail),
    };
    for (const [type, fn] of Object.entries(this._handlers)) this.eventTarget.addEventListener(type, fn);

    this.startSelect.addEventListener('change', () => this._finishStartPick());
    this.destSelect.addEventListener('change', () => this._finishDestinationPick());
    this.startTrigger.addEventListener('click', () => this._openPicker('start'));
    this.destTrigger.addEventListener('click', () => this._openPicker('dest'));
    this.picker.querySelector('[data-role="close"]').addEventListener('click', () => this._closePicker());
    this.picker.querySelector('[data-role="backdrop"]').addEventListener('click', () => this._closePicker());
    this.pickerBack.addEventListener('click', () => this._showCategoryGrid());
    // Focusing the box opens the full scrollable list; typing filters it.
    this.pickerSearch.addEventListener('focus', () => this._showSearchResults());
    this.pickerSearch.addEventListener('input', () => this._showSearchResults());
    this._onKeydown = (e) => {
      if (e.key === 'Escape' && this.picker.classList.contains('is-open')) this._closePicker();
    };
    document.addEventListener('keydown', this._onKeydown);
    // The on-screen keyboard overlays the page on phones instead of resizing
    // it, so a bottom-anchored sheet ends up behind it. Track the visual
    // viewport and fit the picker into whatever is actually visible.
    this._vv = window.visualViewport;
    this._fitToViewport = () => {
      const vv = this._vv;
      if (!vv) return;
      const s = this.picker.style;
      s.top = `${vv.offsetTop}px`;
      s.height = `${vv.height}px`;
      s.bottom = 'auto';
    };
    this._vv?.addEventListener('resize', this._fitToViewport);
    this._vv?.addEventListener('scroll', this._fitToViewport);
    this.root.querySelector('.sat-route-swap').addEventListener('click', () => {
      const a = this.startSelect.value;
      this.startSelect.value = this.destSelect.value;
      this.destSelect.value = a;
      this._updateStartTrigger();
      this._updateDestTrigger();
      this._emitChange();
    });
    this.root.querySelector('.sat-route-clear').addEventListener('click', () => {
      this.destSelect.value = '';
      this._updateDestTrigger();
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

  setNodes(nodes, floorDefaultStartId = null) {
    // Room nodes are already limited to `navigable` rooms (buildRouteNodes).
    this.nodes = dedupeNodesByLabel(nodes.filter((n) => n.reachable));
    this._allNodes = nodes;
    // A new floor's node ids mean nothing on the old one: drop any selection and route summary.
    this.startSelect.value = '';
    this.destSelect.value = '';
    this.errorEl.textContent = '';
    this.root.classList.remove('has-route');
    this._fill(this.startSelect, 'Choose starting point');
    this._fill(this.destSelect, 'Choose destination');
    this.startTrigger.disabled = this.startSelect.disabled;
    this.destTrigger.disabled = this.destSelect.disabled;
    // An explicit option wins; otherwise the floor's own pick (kiosk nearest a main exit).
    // Nodes sharing a name were deduped out of the list, so fall back to the survivor.
    const wanted = this.defaultStartId || floorDefaultStartId;
    const target = nodes.find((n) => n.id === wanted);
    const startNode = target && this.nodes.find((n) => n.id === target.id || labelKey(n.label) === labelKey(target.label));
    if (!this.startSelect.value && startNode) this.startSelect.value = startNode.id;
    this._updateStartTrigger();
    this._updateDestTrigger();
  }

  // Clicking a box on the map (SatelliteView.selectRoom) picks it as the
  // destination here, same as choosing it from the dropdown. A room excluded
  // from the destination list (still named "Room N") is silently ignored.
  _onRoomSelect(detail) {
    if (!detail?.nodeId) return;
    // A clicked duplicate maps to the single listed entry sharing its name.
    const clicked = (this._allNodes || this.nodes).find((n) => n.id === detail.nodeId);
    const listed = clicked && this.nodes.find((n) => labelKey(n.label) === labelKey(clicked.label));
    if (!listed) return;
    this.destSelect.value = listed.id;
    this._finishDestinationPick();
  }

  // ---- start / destination picker ---------------------------------------
  // One shared modal (see the constructor) serves both fields; `_activeField`
  // ('start' | 'dest') tracks which one is currently open.

  _updateStartTrigger() {
    const node = this.nodes.find((n) => n.id === this.startSelect.value);
    this.startTriggerText.textContent = node ? node.label : 'Choose starting point';
    this.startTrigger.classList.toggle('is-placeholder', !node);
  }

  _updateDestTrigger() {
    const node = this.nodes.find((n) => n.id === this.destSelect.value);
    this.destTriggerText.textContent = node ? node.label : 'Choose destination';
    this.destTrigger.classList.toggle('is-placeholder', !node);
  }

  _finishStartPick() {
    this._updateStartTrigger();
    this._closePicker();
    this._emitChange();
  }

  _finishDestinationPick() {
    this._updateDestTrigger();
    this._closePicker();
    this._emitChange();
  }

  _openPicker(field) {
    const trigger = field === 'start' ? this.startTrigger : this.destTrigger;
    if (trigger.disabled) return;
    this._activeField = field;
    this.pickerSearch.value = '';
    this._buildCategoryGrid();
    this._showCategoryGrid();
    this.picker.classList.add('is-open');
    this._fitToViewport();
  }

  _closePicker() {
    this.picker.classList.remove('is-open');
  }

  _showCategoryGrid() {
    this.pickerTitle.textContent = this._activeField === 'start' ? 'Choose starting point' : 'Choose destination';
    this.pickerBack.hidden = true;
    this.pickerGridWrap.hidden = false;
    this.pickerList.hidden = true;
    this.pickerSearch.value = '';
    this.pickerSearch.blur();
  }

  // Every place, in category order, filtered by the search box (case-insensitive substring).
  _showSearchResults() {
    const query = labelKey(this.pickerSearch.value);
    const items = (this._allItems || []).filter(({ node }) => !query || labelKey(node.label).includes(query));
    this._renderList(query ? 'Search results' : 'All places', items, { keepSearch: true });
  }

  // One round icon button per room category (PICKER_CATEGORIES) that has
  // searchable rooms on this floor, plus a catch-all "Other" bucket, always
  // last, for every non-room node (exits, stairs, fire equipment...) and any
  // room with no category.
  _buildCategoryGrid() {
    const buckets = new Map();
    const other = [];
    for (const node of this.nodes) {
      const group = node.class === 'room' && PICKER_CATEGORIES.find((g) => g.category === node.category);
      if (group) {
        const style = { label: group.label, color: group.tint, icon: group.icon };
        if (!buckets.has(group.category)) buckets.set(group.category, { style, items: [] });
        buckets.get(group.category).items.push({ node, style: node.profile ? { label: node.profile.label, color: node.profile.tint, icon: node.profile.icon } : style });
      } else {
        other.push({ node, style: node.class === 'room' ? { color: '#9aa4b2', icon: 'box' } : OBJECT_STYLE[node.class] || OBJECT_STYLE.default });
      }
    }
    const ordered = new Map(PICKER_CATEGORIES.filter((g) => buckets.has(g.category)).map((g) => [g.label, buckets.get(g.category)]));
    if (other.length) ordered.set(OTHER_STYLE.label, { style: OTHER_STYLE, items: other });

    this._allItems = [...ordered.values()].flatMap((b) => b.items);
    this.pickerGrid.innerHTML = '';
    for (const [label, { style, items }] of ordered) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sat-dest-cat';
      btn.innerHTML = `<span class="sat-dest-cat-circle" style="--c:${style.color}">${icon(style.icon, { size: 22, stroke: 2 })}</span><span class="sat-dest-cat-label">${label}</span>`;
      btn.addEventListener('click', () => this._showCategoryList(label, items));
      this.pickerGrid.appendChild(btn);
    }
  }

  // `items` is [{ node, style }, ...] — each keeps its own icon/color, since
  // the "Other" bucket mixes several different node classes together.
  _showCategoryList(label, items) {
    this._renderList(label, items);
  }

  _renderList(label, items, { keepSearch = false } = {}) {
    if (!keepSearch) this.pickerSearch.value = '';
    this.pickerTitle.textContent = label;
    this.pickerBack.hidden = false;
    this.pickerGridWrap.hidden = true;
    this.pickerList.hidden = false;
    this.pickerList.innerHTML = '';
    if (!items.length) this.pickerList.innerHTML = '<div class="sat-dest-empty">No matching places</div>';
    for (const { node, style } of items) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'sat-dest-list-item';
      item.innerHTML = `<span class="sat-dest-list-icon" style="--c:${style.color}">${icon(style.icon, { size: 16, stroke: 2.2 })}</span><span class="sat-dest-list-label">${node.label}</span>`;
      item.addEventListener('click', () => {
        if (this._activeField === 'start') {
          this.startSelect.value = node.id;
          this._finishStartPick();
        } else {
          this.destSelect.value = node.id;
          this._finishDestinationPick();
        }
      });
      this.pickerList.appendChild(item);
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
    document.removeEventListener('keydown', this._onKeydown);
    this._vv?.removeEventListener('resize', this._fitToViewport);
    this._vv?.removeEventListener('scroll', this._fitToViewport);
    this.root.remove();
    this.picker.remove();
  }
}
