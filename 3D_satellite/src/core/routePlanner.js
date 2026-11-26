import { findRoute, labelKey } from './FloorDataLoader.js';

// Plans a trip that may cross floors by routing through a same-named
// transporter (an elevator-category room, or a "stairs" object) that exists
// on BOTH the start floor and the destination floor — see
// Wayfinding-Editor's CrossFloorNameLookup, which is what makes "same name"
// a meaningful cross-floor link in the first place. This module does no
// pathfinding of its own: every leg is a direct lookup into one floor's own
// paths.json, exactly like the single-floor case.
//
// Each floor's data must already be loaded (see loadAllFloors in the demo
// page) and look like:
//   { url, name, nodes, pathIndex }
// where `nodes` is buildRouteNodes()'s output and `pathIndex` is
// buildPathIndex()'s output for that same floor.

function transporterPool(nodes, { preferStairs }) {
  const stairs = nodes.filter((n) => n.class === 'stairs');
  if (preferStairs && stairs.length) return stairs;
  const elevators = nodes.filter((n) => n.class === 'room' && n.category === 'elevator');
  if (elevators.length) return elevators;
  return stairs; // no elevator on this floor at all — stairs are the only option either way
}

/**
 * startFloor / destFloor: { nodes, pathIndex } for the node's own floor.
 * startNode / destNode: entries from that floor's buildRouteNodes() output.
 * Returns:
 *   { sameFloor: true, route }                                   — same floor, direct route
 *   { sameFloor: false, legA, transporterName, legB }             — crosses floors via a transporter
 *   null                                                          — no usable transporter links the two floors
 */
// A generic ("Exit") destination means "the nearest exit": swap in whichever
// unnamed exit on the destination floor is closest to where the walk there begins.
// A named exit is a specific place and is routed to as picked.
function nearestExit(floor, fromId, picked) {
  if (!picked.genericExit) return picked;
  let best = picked;
  let bestDistance = Infinity;
  for (const node of floor.nodes) {
    if (!node.genericExit) continue;
    const route = findRoute(floor.pathIndex, fromId, node.id);
    if (route && route.distance < bestDistance) {
      best = node;
      bestDistance = route.distance;
    }
  }
  return best;
}

export function planTrip(startFloor, startNode, destFloor, destNode, { preferStairs = false } = {}) {
  if (!startNode || !destNode) return null;

  if (startFloor === destFloor || startFloor.url === destFloor.url) {
    destNode = nearestExit(destFloor, startNode.id, destNode);
    const route = findRoute(startFloor.pathIndex, startNode.id, destNode.id);
    return route ? { sameFloor: true, route, destNode } : null;
  }

  const destNames = new Set(
    transporterPool(destFloor.nodes, { preferStairs: false })
      .concat(transporterPool(destFloor.nodes, { preferStairs: true }))
      .map((n) => labelKey(n.label)),
  );

  const pool = transporterPool(startFloor.nodes, { preferStairs })
    .filter((n) => destNames.has(labelKey(n.label)));

  let best = null;
  let bestRoute = null;
  for (const candidate of pool) {
    const route = findRoute(startFloor.pathIndex, startNode.id, candidate.id);
    if (route && (!bestRoute || route.distance < bestRoute.distance)) {
      best = candidate;
      bestRoute = route;
    }
  }
  if (!best) return null;

  const destTransporter = destFloor.nodes.find(
    (n) => (n.class === best.class) && labelKey(n.label) === labelKey(best.label),
  );
  if (!destTransporter) return null;

  destNode = nearestExit(destFloor, destTransporter.id, destNode);
  const legB = findRoute(destFloor.pathIndex, destTransporter.id, destNode.id);
  if (!legB) return null;

  return {
    sameFloor: false,
    legA: { route: bestRoute, transporter: best },
    transporterName: best.label,
    legB: { route: legB, transporter: destTransporter },
    destNode,
  };
}

/**
 * Flattens planTrip()'s result into the walking order the in-map nav bar
 * steps through one at a time: [{ floor, fromNode, toNode, route, kind }].
 * `kind` is 'transporter' when the leg ends at the elevator/stairs node
 * itself (the nav bar's arrival prompt then also covers riding/climbing it
 * to the next floor — see ArrivalModal), or 'destination' for the final leg.
 * Returns [] for a same-node start/destination pick (nothing to walk) and
 * null if there is no plan at all (mirrors planTrip's own null for "no route").
 */
export function planToLegs(plan, { startNode, destNode, startFloor, destFloor }) {
  if (!plan) return null;
  destNode = plan.destNode || destNode; // planTrip may have swapped a picked exit for the nearest one
  if (plan.sameFloor) {
    if (plan.route.sameNode) return [];
    return [{ floor: startFloor, fromNode: startNode, toNode: destNode, route: plan.route, kind: 'destination' }];
  }
  return [
    { floor: startFloor, fromNode: startNode, toNode: plan.legA.transporter, route: plan.legA.route, kind: 'transporter', nextFloor: destFloor },
    { floor: destFloor, fromNode: plan.legB.transporter, toNode: destNode, route: plan.legB.route, kind: 'destination' },
  ];
}
