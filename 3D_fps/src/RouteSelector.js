import { FLOOR_LOADED_EVENT, ROUTE_CHANGE_EVENT, ROUTE_ERROR_EVENT } from './WayfindingView.js';

const STYLE = `
.wf-selector, .wf-selector * { box-sizing: border-box; }
.wf-selector {
  display: flex; flex-wrap: wrap; gap: 12px; font-family: system-ui, sans-serif; align-items: end;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
}
.wf-selector .wf-field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 150px; min-width: 130px; }
.wf-selector label { font-size: 12px; font-weight: 600; color: #4a5568; text-transform: uppercase; letter-spacing: 0.04em; }
.wf-selector select {
  padding: 10px 12px; border-radius: 10px; border: 1px solid #cbd5e1;
  background: #fff; font-size: 16px; color: #1c2430; width: 100%;
  -webkit-tap-highlight-color: transparent;
}
.wf-selector select:disabled { background: #f1f3f6; color: #94a3b8; }
.wf-selector .wf-swap {
  width: 44px; height: 44px; border-radius: 10px; border: 1px solid #cbd5e1;
  background: #fff; cursor: pointer; font-size: 16px; flex: none;
  -webkit-tap-highlight-color: transparent;
}
.wf-selector .wf-error { color: #d64545; font-size: 12px; margin-left: 4px; }

@media (max-width: 480px) {
  .wf-selector { gap: 8px; }
  .wf-selector .wf-field { flex-basis: 110px; min-width: 0; }
  .wf-selector label { font-size: 10px; }
  .wf-selector select { padding: 9px 8px; }
  .wf-selector .wf-swap { width: 38px; height: 38px; font-size: 14px; }
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

function groupLabel(node) {
  if (node.class === 'room') return 'Rooms';
  return node.class.charAt(0).toUpperCase() + node.class.slice(1);
}

/**
 * Component 3: start / destination selector.
 *
 * Populates itself from the view's 'wayfinding:floor-loaded' event (so it
 * never touches the view's internals directly) and, whenever both fields
 * have a value, dispatches 'wayfinding:route-change' — which is exactly
 * what the view listens for to rebuild the path and reset the walk.
 */
export class RouteSelector {
  constructor(container, options = {}) {
    this.container = container;
    this.eventTarget = options.eventTarget || container;
    this.nodes = [];

    ensureStyle();

    this.root = document.createElement('div');
    this.root.className = 'wf-selector';

    this.startField = this._buildField('Start');
    this.destField = this._buildField('Destination');

    this.swapBtn = document.createElement('button');
    this.swapBtn.type = 'button';
    this.swapBtn.className = 'wf-swap';
    this.swapBtn.textContent = '⇄';
    this.swapBtn.title = 'Swap start and destination';

    this.errorEl = document.createElement('span');
    this.errorEl.className = 'wf-error';

    this.root.appendChild(this.startField.wrapper);
    this.root.appendChild(this.swapBtn);
    this.root.appendChild(this.destField.wrapper);
    this.root.appendChild(this.errorEl);
    this.container.appendChild(this.root);

    this._onChange = this._onChange.bind(this);
    this._onSwap = this._onSwap.bind(this);
    this._onFloorLoaded = this._onFloorLoaded.bind(this);
    this._onRouteError = this._onRouteError.bind(this);

    this.startField.select.addEventListener('change', this._onChange);
    this.destField.select.addEventListener('change', this._onChange);
    this.swapBtn.addEventListener('click', this._onSwap);
    this.eventTarget.addEventListener(FLOOR_LOADED_EVENT, this._onFloorLoaded);
    this.eventTarget.addEventListener(ROUTE_ERROR_EVENT, this._onRouteError);
  }

  _buildField(labelText) {
    const wrapper = document.createElement('div');
    wrapper.className = 'wf-field';
    const label = document.createElement('label');
    label.textContent = labelText;
    const select = document.createElement('select');
    select.disabled = true;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Loading floor...';
    select.appendChild(placeholder);
    wrapper.appendChild(label);
    wrapper.appendChild(select);
    return { wrapper, select };
  }

  setNodes(nodes) {
    this.nodes = nodes.filter((n) => n.reachable);
    for (const field of [this.startField, this.destField]) {
      const previous = field.select.value;
      field.select.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choose a location...';
      field.select.appendChild(placeholder);

      const groups = new Map();
      for (const node of this.nodes) {
        const g = groupLabel(node);
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(node);
      }
      for (const [groupName, groupNodes] of groups) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;
        for (const node of groupNodes) {
          const option = document.createElement('option');
          option.value = node.id;
          option.textContent = node.label;
          optgroup.appendChild(option);
        }
        field.select.appendChild(optgroup);
      }
      field.select.disabled = false;
      if (this.nodes.some((n) => n.id === previous)) field.select.value = previous;
    }
  }

  _onFloorLoaded(event) {
    this.setNodes(event.detail?.nodes || []);
  }

  _onChange() {
    this.errorEl.textContent = '';
    const startId = this.startField.select.value;
    const destinationId = this.destField.select.value;
    if (!startId || !destinationId) return;
    this.eventTarget.dispatchEvent(
      new CustomEvent(ROUTE_CHANGE_EVENT, { detail: { startId, destinationId }, bubbles: true })
    );
  }

  _onSwap() {
    const a = this.startField.select.value;
    const b = this.destField.select.value;
    this.startField.select.value = b;
    this.destField.select.value = a;
    this._onChange();
  }

  _onRouteError(event) {
    const { reason } = event.detail || {};
    this.errorEl.textContent = reason === 'no-path' ? 'No route found between those two points.' : 'Could not set route.';
  }

  dispose() {
    this.startField.select.removeEventListener('change', this._onChange);
    this.destField.select.removeEventListener('change', this._onChange);
    this.swapBtn.removeEventListener('click', this._onSwap);
    this.eventTarget.removeEventListener(FLOOR_LOADED_EVENT, this._onFloorLoaded);
    this.eventTarget.removeEventListener(ROUTE_ERROR_EVENT, this._onRouteError);
    this.root.remove();
  }
}
