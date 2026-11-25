import * as THREE from './vendor/three.module.js';
import { SatelliteView } from './SatelliteView.js';
import { RouteSelector } from './RouteSelector.js';
import { RouteControls } from './RouteControls.js';
import { DisclaimerModal } from './DisclaimerModal.js';
import { TripPlanner } from './TripPlanner.js';
import { ItineraryView } from './ItineraryView.js';
import { TripProgress } from './TripProgress.js';
import { loadFloorData, buildRouteNodes, buildPathIndex } from './core/FloorDataLoader.js';
import { planTrip, planToLegs } from './core/routePlanner.js';
import * as events from './core/events.js';

// Also grouped onto one object (and exported as default) for a host page that
// prefers `import Satellite from './index.js'`. THREE is re-exported so a host
// never needs its own <script> tag or CDN — src/vendor/three.module.js is the
// only copy.
const Satellite = {
  THREE,
  SatelliteView,
  RouteSelector,
  RouteControls,
  DisclaimerModal,
  TripPlanner,
  ItineraryView,
  TripProgress,
  loadFloorData,
  buildRouteNodes,
  buildPathIndex,
  planTrip,
  planToLegs,
  events,
};

export default Satellite;
export {
  THREE, SatelliteView, RouteSelector, RouteControls,
  DisclaimerModal, TripPlanner, ItineraryView, TripProgress,
  loadFloorData, buildRouteNodes, buildPathIndex, planTrip, planToLegs, events,
};
