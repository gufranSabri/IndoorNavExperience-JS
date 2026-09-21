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
  for (const [className, items] of Object.entries(objects || {})) {
    objectLabelsByClass[className] = items.map((item) => item.label || null);
  }

  return (graph.nodes || []).map((node) => {
    let label = node.id;
    if (node.class === 'room') {
      const roomId = node.id.replace(/^room-/, '');
      const room = roomsById.get(roomId);
      label = room?.name || 'Room';
    } else {
      const match = node.id.match(/^(.+)-(\d+)$/);
      if (match) {
        const [, className, indexStr] = match;
        const index = Number(indexStr);
        label = objectLabelsByClass[className]?.[index] || `${className} ${index + 1}`;
      }
    }
    return {
      id: node.id,
      class: node.class,
      label,
      centroidPx: node.centroid_px,
      reachable: node.reachable !== false,
    };
  });
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
