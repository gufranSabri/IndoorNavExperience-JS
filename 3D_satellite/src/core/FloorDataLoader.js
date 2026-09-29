async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res.json();
}

// Loads the four editor-produced JSON files for one floor directly from
// static hosting (no API server required) — see docs/MAP_DATA_STORAGE.md.
export async function loadFloorData(baseUrl) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const [boundary, objects, graph, paths] = await Promise.all([
    fetchJson(`${base}boundary.json`),
    fetchJson(`${base}objects.json`).catch(() => ({})),
    fetchJson(`${base}graph.json`).catch(() => null),
    fetchJson(`${base}paths.json`).catch(() => null),
  ]);
  return { boundary, objects, graph, paths };
}

// Builds a friendly, UI-ready list of selectable start/destination nodes by
// cross-referencing graph.json's positional node ids back to room names
// (boundary.json) and object labels (objects.json).
export function buildRouteNodes(floorData) {
  const { graph, boundary, objects } = floorData;
  if (!graph) return [];

  const roomsById = new Map((boundary?.elements?.rooms || []).map((r) => [r.id, r]));
  const objectLabelsByClass = {};
  // graph.json numbers object nodes by their position across ALL classes
  // (exits-0..3, then wayfinding-kiosk-4), so keep a flat list as well.
  const flatObjects = [];
  for (const [className, items] of Object.entries(objects || {})) {
    objectLabelsByClass[className] = items.map((item) => item.label || null);
    for (const item of items) flatObjects.push({ className, label: item.label || null });
  }

  return (graph.nodes || []).map((node) => {
    let label = node.id;
    let category = null;
    if (node.class === 'room') {
      const roomId = node.id.replace(/^room-/, '');
      const room = roomsById.get(roomId);
      label = room?.name || 'Room';
      category = room?.category || null;
    } else {
      const match = node.id.match(/^(.+)-(\d+)$/);
      if (match) {
        const [, className, indexStr] = match;
        const index = Number(indexStr);
        const flat = flatObjects[index];
        const flatLabel = flat && flat.className === className ? flat.label : null;
        label = flatLabel || objectLabelsByClass[className]?.[index] || `${className} ${index + 1}`;
      }
    }
    return {
      id: node.id,
      class: node.class,
      label,
      category,
      centroidPx: node.centroid_px,
      reachable: node.reachable !== false,
    };
  });
}

// Unclassified rooms the editor never got a real name for keep its
// auto-generated placeholder ("Room 7"). Neither showing that on the map nor
// offering it as a searchable destination is useful, so both the label layer
// and the route selector skip anything named like that — regardless of its
// category, since a placeholder name can carry any category or none at all.
export function isGenericRoomLabel(label) {
  return typeof label === 'string' && label.startsWith('Room');
}

// paths.json stores one entry per unordered reachable pair; index both
// directions so route lookups between any two selected nodes are O(1).
export function buildPathIndex(pathsDoc) {
  const map = new Map();
  for (const entry of pathsDoc?.paths || []) {
    map.set(`${entry.a}|${entry.b}`, entry);
  }
  return map;
}

export function findRoute(pathIndex, startId, destinationId) {
  if (!startId || !destinationId) return null;
  if (startId === destinationId) return { points: [], distance: 0, sameNode: true };

  const forward = pathIndex.get(`${startId}|${destinationId}`);
  if (forward) return { points: forward.points, distance: forward.distance, sameNode: false };

  const backward = pathIndex.get(`${destinationId}|${startId}`);
  if (backward) {
    return { points: backward.points.slice().reverse(), distance: backward.distance, sameNode: false };
  }

  return null;
}

// Two nodes with the same name are the same place to a visitor (e.g. several
// "Toilets"), so the UI lists a name once and the router picks the instance.
export function labelKey(label) {
  return String(label ?? '').trim().toLowerCase();
}

// Keeps the first node for each distinct name.
export function dedupeNodesByLabel(nodes) {
  const seen = new Set();
  return nodes.filter((n) => {
    const key = labelKey(n.label);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Of all nodes sharing the target's name, returns the id of the one with the
// shortest route from `fromId` (falls back to the target if none is routable).
export function resolveNearestByLabel(nodes, pathIndex, fromId, targetId) {
  const target = nodes.find((n) => n.id === targetId);
  if (!target || !fromId) return targetId;
  const key = labelKey(target.label);
  let best = targetId;
  let bestDistance = Infinity;
  for (const node of nodes) {
    if (labelKey(node.label) !== key) continue;
    const route = findRoute(pathIndex, fromId, node.id);
    if (route && route.distance < bestDistance) {
      best = node.id;
      bestDistance = route.distance;
    }
  }
  return best;
}
