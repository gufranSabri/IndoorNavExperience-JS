import { icon } from './icons.js';
import { projectToScreen, isOccluded } from '../core/screen.js';

const ICON_SIZE = 30; // px, badge-only label
const ROW_HEIGHT = 30;
const PAD = 6; // px kept clear between labels

/**
 * Room / object labels: a dark glass chip with a colored category badge and
 * the name. They are DOM elements projected from the room centers every
 * time the camera moves, which keeps the text razor sharp at every zoom.
 *
 * What is shown depends on zoom and on how big each room currently is on
 * screen: nothing while zoomed out, then icon-only badges for small rooms,
 * then full labels for rooms with space for them — with overlapping labels
 * dropped in favour of the bigger room.
 */
export class LabelLayer {
  constructor(container) {
    this.root = document.createElement('div');
    this.root.className = 'sat-labels';
    container.appendChild(this.root);
    this.items = [];
    this._byId = new Map();
    this._screen = { x: 0, y: 0, behind: false };
    this.emphasized = new Set();
    this.hiddenIds = new Set();
    this.selectedId = null;
  }

  // items: [{ id, name, style: {color, icon}, x, y, z, radius, priority, kind }]
  setItems(items) {
    this.root.innerHTML = '';
    this._byId.clear();
    this.items = items
      .map((item) => {
        const el = document.createElement('div');
        el.className = `sat-label sat-label-${item.kind}`;
        el.style.setProperty('--c', item.style.color);
        el.dataset.id = item.id;
        el.innerHTML = `<div class="sat-chip"><span class="sat-label-badge">${icon(item.style.icon, { size: 14, stroke: 2.2 })}</span><span class="sat-label-text"></span></div>`;
        el.querySelector('.sat-label-text').textContent = item.name;
        this.root.appendChild(el);
        const entry = { ...item, el, fullWidth: 0, mode: 'hidden', lastX: -1e9, lastY: -1e9 };
        this._byId.set(item.id, entry);
        return entry;
      })
      .sort((a, b) => b.priority - a.priority);
    // Measure once, while the labels are laid out but invisible.
    for (const entry of this.items) entry.fullWidth = Math.ceil(entry.el.firstChild.getBoundingClientRect().width) || 120;
  }

  setSelected(id) {
    this.selectedId = id;
    for (const entry of this.items) entry.el.classList.toggle('is-selected', entry.id === id);
  }

  setEmphasized(ids) {
    this.emphasized = new Set(ids);
  }

  setHidden(ids) {
    this.hiddenIds = new Set(ids);
  }

  hideAll() {
    for (const entry of this.items) this._setMode(entry, 'hidden');
  }

  _setMode(entry, mode) {
    if (entry.mode === mode) return;
    entry.mode = mode;
    entry.el.classList.toggle('is-visible', mode !== 'hidden');
    entry.el.classList.toggle('is-icon', mode === 'icon');
  }

  // width/height: css-pixel size of the view. pixelsPerMeter: scale at the
  // point the camera looks at (used to judge how big a room is on screen).
  update(camera, width, height, pixelsPerMeter, occluder = null) {
    const placed = [];
    const overlaps = (r) => placed.some((p) => r.l < p.r + PAD && r.r > p.l - PAD && r.t < p.b + PAD && r.b > p.t - PAD);

    for (const entry of this.items) {
      const s = projectToScreen(camera, entry.x, entry.y, entry.z, width, height, this._screen);
      const forced = entry.kind === 'object' || this.emphasized.has(entry.id) || entry.id === this.selectedId;
      if (s.behind || this.hiddenIds.has(entry.id) || s.x < -60 || s.x > width + 60 || s.y < -40 || s.y > height + 40) {
        this._setMode(entry, 'hidden');
        continue;
      }

      if (isOccluded(camera, entry.x, entry.y, entry.z, occluder)) {
        this._setMode(entry, 'hidden');
        continue;
      }

      const roomPx = entry.radius * 2 * pixelsPerMeter;
      let want = 'hidden';
      if (forced || roomPx >= entry.fullWidth * 0.6) want = 'full';
      else if (roomPx >= 20) want = 'icon';

      let mode = 'hidden';
      const tryMode = (m) => {
        const w = m === 'full' ? entry.fullWidth : ICON_SIZE;
        const rect = { l: s.x - w / 2, r: s.x + w / 2, t: s.y - ROW_HEIGHT / 2, b: s.y + ROW_HEIGHT / 2 };
        if (forced || !overlaps(rect)) {
          placed.push(rect);
          mode = m;
          return true;
        }
        return false;
      };
      if (want === 'full') {
        if (!tryMode('full')) tryMode('icon');
      } else if (want === 'icon') {
        tryMode('icon');
      }

      this._setMode(entry, mode);
      if (mode !== 'hidden' && (Math.abs(s.x - entry.lastX) > 0.2 || Math.abs(s.y - entry.lastY) > 0.2)) {
        entry.lastX = s.x;
        entry.lastY = s.y;
        entry.el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      }
    }
  }
}
