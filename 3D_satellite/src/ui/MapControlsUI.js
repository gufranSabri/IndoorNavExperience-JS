import { icon } from './icons.js';

/**
 * The floating map buttons: compass (click = north up), zoom in / out,
 * a 2D <-> 3D tilt toggle and "fit the route / building".
 */
export class MapControlsUI {
  constructor(container, handlers) {
    this.root = document.createElement('div');
    this.root.className = 'sat-controls';
    this.root.innerHTML = `
      <div class="sat-btn-group">
        <button type="button" class="sat-btn sat-compass" aria-label="Reset bearing to north" title="Reset north">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <g class="sat-compass-needle">
              <path d="M12 3.2 15.6 12H8.4z" fill="#ea4335"/>
              <path d="M12 20.8 8.4 12h7.2z" fill="#c7ccd4"/>
            </g>
          </svg>
        </button>
      </div>
      <div class="sat-btn-group">
        <button type="button" class="sat-btn" data-act="in" aria-label="Zoom in" title="Zoom in">${icon('plus', { size: 18, stroke: 2.2 })}</button>
        <button type="button" class="sat-btn" data-act="out" aria-label="Zoom out" title="Zoom out">${icon('minus', { size: 18, stroke: 2.2 })}</button>
      </div>
      <div class="sat-btn-group">
        <button type="button" class="sat-btn sat-tilt" data-act="tilt" aria-label="Toggle 2D / 3D" title="Toggle 2D / 3D">3D</button>
        <button type="button" class="sat-btn" data-act="fit" aria-label="Recenter" title="Recenter">${icon('locate', { size: 18, stroke: 2 })}</button>
      </div>`;
    container.appendChild(this.root);
    this.needle = this.root.querySelector('.sat-compass-needle');
    this.tiltBtn = this.root.querySelector('.sat-tilt');
    this._bearing = Infinity; // forces the first update to draw
    this._tilted = null;

    this.root.querySelector('.sat-compass').addEventListener('click', handlers.onResetNorth);
    this.root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'in') handlers.onZoomIn();
      else if (act === 'out') handlers.onZoomOut();
      else if (act === 'tilt') handlers.onToggleTilt();
      else if (act === 'fit') handlers.onFit();
    });
    // Keep map gestures from starting underneath the buttons.
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('wheel', (e) => e.stopPropagation());
  }

  update(bearingRad, pitchRad) {
    if (Math.abs(bearingRad - this._bearing) > 1e-3) {
      this._bearing = bearingRad;
      this.needle.style.transformOrigin = '12px 12px';
      this.needle.style.transform = `rotate(${((bearingRad * 180) / Math.PI).toFixed(1)}deg)`;
      this.root.classList.toggle('is-rotated', Math.abs(bearingRad) > 0.02);
    }
    const tilted = pitchRad > (12 * Math.PI) / 180;
    if (tilted !== this._tilted) {
      this._tilted = tilted;
      this.tiltBtn.textContent = tilted ? '2D' : '3D';
    }
  }
}
