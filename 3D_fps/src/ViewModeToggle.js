import { VIEW_MODE_EVENT } from './WayfindingView.js';

const STYLE = `
.wf-view-toggle {
  display: inline-flex; padding: 3px; border-radius: 10px; background: rgba(255,255,255,0.12);
  font-family: system-ui, sans-serif; gap: 2px;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
}
.wf-view-toggle button {
  appearance: none; border: none; cursor: pointer; padding: 7px 14px; border-radius: 8px;
  font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.75); background: transparent;
  -webkit-tap-highlight-color: transparent;
}
.wf-view-toggle button.wf-active { background: #fff; color: #1c2430; }
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
 * A small "3D / 2D" segmented toggle for the top bar. Only dispatches
 * 'wayfinding:view-mode' on the shared event target — it holds no
 * reference to the view itself, so it works the same whether the view
 * lives on this page or is driven remotely (e.g. a .NET host dispatching
 * the same event).
 */
export class ViewModeToggle {
  constructor(container, options = {}) {
    this.container = container;
    this.eventTarget = options.eventTarget || container;
    this.viewMode = options.initialViewMode || '3d';

    ensureStyle();

    this.root = document.createElement('div');
    this.root.className = 'wf-view-toggle';

    this.btn3D = document.createElement('button');
    this.btn3D.type = 'button';
    this.btn3D.textContent = '3D';

    this.btn2D = document.createElement('button');
    this.btn2D.type = 'button';
    this.btn2D.textContent = '2D';

    this.root.appendChild(this.btn3D);
    this.root.appendChild(this.btn2D);
    this.container.appendChild(this.root);

    this._onClick3D = () => this._setViewMode('3d');
    this._onClick2D = () => this._setViewMode('2d');
    this.btn3D.addEventListener('click', this._onClick3D);
    this.btn2D.addEventListener('click', this._onClick2D);

    this._render();
  }

  _setViewMode(viewMode) {
    if (viewMode === this.viewMode) return;
    this.viewMode = viewMode;
    this._render();
    this.eventTarget.dispatchEvent(new CustomEvent(VIEW_MODE_EVENT, { detail: { viewMode }, bubbles: true }));
  }

  _render() {
    this.btn3D.classList.toggle('wf-active', this.viewMode === '3d');
    this.btn2D.classList.toggle('wf-active', this.viewMode === '2d');
  }

  dispose() {
    this.btn3D.removeEventListener('click', this._onClick3D);
    this.btn2D.removeEventListener('click', this._onClick2D);
    this.root.remove();
  }
}
