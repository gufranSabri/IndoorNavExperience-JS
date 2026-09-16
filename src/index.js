import * as THREE from './vendor/three.module.js';
import { WayfindingView, MOVE_EVENT, ROUTE_CHANGE_EVENT, FLOOR_LOADED_EVENT, ROUTE_SET_EVENT, ROUTE_ERROR_EVENT, PROGRESS_EVENT } from './WayfindingView.js';
import { WayfindingControls } from './WayfindingControls.js';
import { RouteSelector } from './RouteSelector.js';
import { loadFloorData, buildRouteNodes } from './core/FloorDataLoader.js';

// Also grouped onto one object (and exported as default) for a host page
// that prefers `import Wayfinding from './index.js'` over named imports.
// THREE is re-exported too so a host never needs its own <script> tag or
// CDN reference for it — src/vendor/three.module.js is the only copy.
const Wayfinding = {
  THREE,
  WayfindingView,
  WayfindingControls,
  RouteSelector,
  loadFloorData,
  buildRouteNodes,
  events: {
    MOVE: MOVE_EVENT,
    ROUTE_CHANGE: ROUTE_CHANGE_EVENT,
    FLOOR_LOADED: FLOOR_LOADED_EVENT,
    ROUTE_SET: ROUTE_SET_EVENT,
    ROUTE_ERROR: ROUTE_ERROR_EVENT,
    PROGRESS: PROGRESS_EVENT,
  },
};

export default Wayfinding;
export { THREE, WayfindingView, WayfindingControls, RouteSelector, loadFloorData, buildRouteNodes };
