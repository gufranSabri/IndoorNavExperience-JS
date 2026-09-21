# Indoor Wayfinding — Satellite View

A pure-JS, map-style 3D view of a floor, built on Three.js. It reads the
Wayfinding Editor's exported JSON (see [../docs/MAP_DATA_STORAGE.md](../docs/MAP_DATA_STORAGE.md)),
shows the building as a minimalist model on a dark base, lets you pan / zoom /
rotate / tilt it like OpenStreetMap, and draws an animated Google-Maps-style
route with a blue "you are here" dot.

It is the non-first-person sibling of `3D_fps`: same data, same event-driven
component style, a completely different look.

**`src/` is the entire deliverable.** Plain native ES modules — no bundler, no
npm, no build step, no CDN. Three.js is vendored at
[src/vendor/three.module.js](src/vendor/three.module.js), so `src/` has zero
external dependencies. No textures or images are used at all.

## Try it locally

```bash
cd 3D_satellite
python3 -m http.server 8080
```

Open `http://localhost:8080/example/index.html` (`fetch()` needs `http://`, not `file://`).

## What you see

| Element | How it is drawn |
|---|---|
| Background | Dark charcoal with a soft vignette (CSS, behind a transparent canvas) |
| Base | The building outline grown by 1.7 m with rounded corners, extruded as a slab |
| Boundary walls | The outer `Wall External` ring as one continuous, thick, light-gray band with rounded corners, and door gaps cut where external doors exist |
| Rooms | One extruded slate block per room with rounded corners and a chamfered top edge, slightly shorter than the walls. Category adds only a whisper of tint |
| Open offices | **Not built** (`OPEN_CATEGORIES`): they stay open floor but keep a label |
| Internal walls | **Not drawn.** Each room is inset by half of `ROOM_GAP`, so two rooms sharing a wall end up a thin gap apart |
| Open space | Not drawn — the base shows through (`floor_space` rooms are skipped) |
| Exclusion zone | The floor is cut open there: a black stairwell shaft going down |
| Stairs | The floor-scope stair flights and landings, built as real steps descending *below* the floor into the shaft, fading from light stone to black with depth |
| Labels | Category icon + name at each room's visual center, shown only once zoomed in (see below) |
| Route | Thick blue ribbon with a border and glow, drawn on with an animation, white chevrons flowing along it; the walked part greys out |
| You are here | Blue dot, white ring, pulsing halo and a heading beam — a DOM element, so it stays crisp at any zoom |
| Destination | Red pin with the place name |

Rooms the route passes through (and the start / destination rooms) turn into
outlined glass so the line stays visible inside them.

### Stairs

Segments in `floor_scope.segments` are stair flights and landings with a
vertical `order`. A flight's top edge is the one touching an exclusion exit or a
lower-order segment; its steps run away from that edge. Flights of the same
order drop by the same amount, landings are flat. `heightAt(x, z)` reports the
walking surface, so the route ribbon, the "you are here" dot and labels follow
the stairs down instead of floating over the shaft.

### Labels

Labels are hidden while the whole building is in view. Once you zoom in a little
(`LABEL_ZOOM_DISTANCE_FACTOR`) they fade in, per room:

- a full label (icon + name) if the room is big enough on screen,
- an icon-only badge if it is small,
- nothing if it is smaller still, or if a bigger room's label would overlap it,
- nothing for a room hidden behind the tall boundary wall.

## Interaction

| Input | Action |
|---|---|
| Drag | Pan (the point under the cursor stays under it), with inertia |
| Wheel / trackpad pinch | Zoom toward the cursor, eased |
| Right-drag, or Ctrl/Alt/Cmd + drag | Rotate (left/right) and tilt (up/down) |
| Double-click / double-tap | Zoom in (Shift: out) |
| Touch: two fingers | Pinch-zoom + rotate + pan around the fingers; drag both up/down to tilt |
| Arrows, `+` / `-` | Pan, zoom; with Shift the arrows rotate / tilt |
| Hover / click a room | Highlight / select it |

The floating buttons give compass (click = north up), zoom, a 2D ⇄ 3D toggle
and "recenter" (fits the route if there is one).

## Architecture

Components talk only through DOM `CustomEvent`s on a shared element, so any of
them can be replaced or driven from a .NET/Blazor host.

```
src/
├── index.js               re-exports the three components
├── SatelliteView.js       the view: scene, camera, room states, route, picking, render loop
├── RouteSelector.js       "directions" card — start / destination pickers + summary
├── RouteControls.js       play / pause / scrub bar for previewing the route
├── core/
│   ├── constants.js       every tunable: colors, heights, gaps, camera limits
│   ├── BuildingBuilder.js base, boundary walls, room solids, stairwell
│   ├── StairsBuilder.js   stair flights/landings, depth shading, heightAt()
│   ├── shapes.js          footprint -> extruded solid helpers
│   ├── polygon.js         offsetting, corner rounding, self-loop removal, pole-of-inaccessibility
│   ├── MapControls.js     the OSM-style camera and gestures
│   ├── RouteRenderer.js   ribbon geometry + the route shader
│   ├── coords.js          image pixels -> world meters
│   ├── events.js          event names
│   └── FloorDataLoader.js fetches + indexes boundary/objects/graph/paths
├── ui/                    labels, markers, map buttons, icons, styles
└── vendor/three.module.js Three.js r160 (unmodified)
```

### Event contract

| Event | Direction | Detail |
|---|---|---|
| `wayfinding:route-change` | in | `{ startId, destinationId }` |
| `wayfinding:route-clear` | in | `{}` |
| `wayfinding:play` / `wayfinding:pause` | in | `{}` |
| `wayfinding:seek` | in | `{ progress }` (0–1) |
| `wayfinding:move` | in | `{ direction: 'forward' \| 'backward', distance? }` |
| `wayfinding:floor-loaded` | out | `{ nodes: [{ id, label, class, ... }] }` |
| `wayfinding:route-set` | out | `{ startId, destinationId, distanceMeters, durationSeconds }` |
| `wayfinding:route-cleared` | out | `{}` |
| `wayfinding:route-error` | out | `{ startId, destinationId, reason: 'no-path' }` |
| `wayfinding:progress` | out | `{ progress, distance, total, atStart, atEnd }` |
| `wayfinding:playback` | out | `{ playing }` |
| `wayfinding:room-select` | out | `{ id, nodeId, name, category }` or `{ id: null }` |

`startId` / `destinationId` are the node ids from `graph.json` (`"exits-0"`,
`"room-<guid>"`). Routing is a direct lookup into `paths.json`; the view does
no pathfinding of its own.

### Using it

```html
<div id="map" style="height:600px"></div>
<script type="module">
  import { SatelliteView } from './satellite/index.js';
  const view = new SatelliteView(document.getElementById('map'));
  view.loadFloor('/floors/5/').then(() => view.setUserNode('exits-0'));
</script>
```

Useful methods: `loadFloor(url)`, `setRoute(startId, destId)`, `clearRoute()`,
`setUserNode(nodeId)` / `setUserLocation({x, z})` (world meters), `play()`,
`pause()`, `seek(progress)`, `recenter()`, `selectRoom(id)`.

If you float UI over the map, pass `getInsets: () => ({ top, right, bottom, left })`
to the constructor (and call `view.refreshInsets()` when it changes) so the
camera frames things in the free area — see [example/index.html](example/index.html).

## Tuning the look

All in [src/core/constants.js](src/core/constants.js): `COLORS`, `WALL_HEIGHT`,
`ROOM_HEIGHT`, `ROOM_GAP`, `WALL_THICKNESS`, the `*_CORNER_RADIUS` values, `BASE_MARGIN`,
`CATEGORY_TINT`, `STAIR_RISE` / `STAIR_TREAD`, category / object
icons and colors (`CATEGORY_STYLE`, `OBJECT_STYLE`), camera limits, and route
width / corner radius / animation speed. Heights are deliberately a little
taller than real life so the model reads well from above.
