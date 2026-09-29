# Indoor Wayfinding — Viewers

Two pure-JS, Three.js-based viewers for the same indoor floor data, exported
by the Wayfinding Editor (see [docs/MAP_DATA_STORAGE.md](docs/MAP_DATA_STORAGE.md)).
Each folder is a self-contained deliverable: plain native ES modules, **no
bundler, no npm, no build step, no CDN**, with Three.js vendored inside
`src/vendor/`. Copy a folder's `src/` into a `wwwroot` and it works as-is.

| | [`3D_fps/`](3D_fps/) | [`3D_satellite/`](3D_satellite/) |
|---|---|---|
| **What it is** | First-person walk-through | Map-style "satellite" view |
| **Camera** | Locked to the route; you walk it forward / backward | Free, OpenStreetMap-style: pan, zoom, rotate, tilt |
| **Look** | Textured interior: walls with doors, ceilings, lights, sliding glass doors | Minimalist dark model: thick light boundary wall, slate room blocks, stairs up or down depending on the floor, no textures |
| **Route** | Glowing tube; you can only move along it | Thick blue Google-Maps-style line with animation, plus a blue "you are here" dot |
| **Other UI** | Forward / backward hold buttons and a progress bar | Room labels with category icons (shown on zoom), compass, zoom, 2D/3D, recenter, route preview player |
| **Components** | `WayfindingView`, `WayfindingControls`, `RouteSelector` | `SatelliteView`, `RouteSelector`, `RouteControls` |
| **Best for** | "Show me what the walk looks like" | Orientation, overview, browsing places, previewing a route |
| **Detailed docs** | [3D_fps/README.md](3D_fps/README.md) | [3D_satellite/README.md](3D_satellite/README.md) |

They don't depend on each other. They read the same four files per floor and
speak the same style of DOM `CustomEvent`s, so a host can use either one, or
both side by side.

## Repository layout

```
.
├── 3D_fps/                 first-person viewer
│   ├── src/                the deliverable (ES modules + vendored three.js)
│   └── example/            demo page + a floor-5 sample data snapshot
├── 3D_satellite/           map-style viewer
│   ├── src/                the deliverable (ES modules + vendored three.js)
│   └── example/            demo page + a floors/{buildingId}/{floorId}/ sample data snapshot
└── docs/                   data contract and the Editor's sample data
    ├── MAP_DATA_STORAGE.md   on-disk JSON contract both viewers consume
    ├── building_data/        sample buildings / floors exported by the Editor
    └── building-app/         separate React app (not used by the viewers)
```

## Running the examples

Any static file server works — `fetch()` needs `http://`, not `file://`. Serve
the folder you want to try:

```bash
# first-person viewer
cd 3D_fps && python3 -m http.server 8080
# → http://localhost:8080/example/index.html

# satellite viewer
cd 3D_satellite && python3 -m http.server 8081
# → http://localhost:8081/example/index.html
```

### Trying it on a phone

Bind the server to all interfaces and open your Mac's LAN address from a phone
on the same Wi-Fi:

```bash
cd 3D_satellite
python3 -m http.server 8080 --bind 0.0.0.0
ipconfig getifaddr en0        # or en1 — prints the address, e.g. 192.168.1.20
# → http://<that address>:8080/example/index.html
```

Corporate and campus networks often block device-to-device traffic; if the page
doesn't load, use a personal hotspot or a tunnel (`npx localtunnel --port 8080`).
Both example pages have a mobile layout — the satellite demo's selector becomes a
full-width top bar on phones.

## Data both viewers use

One floor is a folder of four JSON files, exactly as the Editor exports them:

| File | Contents |
|---|---|
| `boundary.json` | image size, scale (meters per pixel), outer boundary polygon, walls, doors (each with a `type`, `"normal"` or `"elevator"`), rooms (category includes `elevator`), floor scope (exclusion zones scoped stair/landing segments, and `is_lowest_floor`) |
| `objects.json` | point objects — exits, stairs, fire equipment (elevators are a room *category*, not an object class — see below) |
| `graph.json` | routing nodes (rooms and objects) and the distance matrix |
| `paths.json` | precomputed route polylines between every pair of nodes |

Neither viewer runs its own pathfinding: a route is a lookup into `paths.json`.
Node ids look like `exits-0` and `room-<guid>`. A door's `type` is server-derived
from whichever room is classified `category: "elevator"` — it's the room, not
the door, that a PWA should treat as authoritative for "where are the
elevators." Full field-by-field reference:
[docs/MAP_DATA_STORAGE.md](docs/MAP_DATA_STORAGE.md).

`docs/building_data/` is the Editor's own live `App_Data` (per §2 of that doc,
floors live at `floors/{buildingId}/{floorId}/`), so it can change while the
Editor is open — treat it as a moving snapshot, not a frozen fixture. Each
example ships a copy taken at some point in time: `3D_fps/example/data/floor5/`
predates the `door.type` / `elevator` category / `is_lowest_floor` fields above
(it still works — those viewers just don't read those fields yet), while
`3D_satellite/example/data/floors/2/1/` was copied after they landed and
exercises all of them (an elevator door, three independent stair zones). Re-copy
from `docs/building_data/` if you want either example on fresher data.

## How each viewer uses it

### `3D_fps` — first-person

Builds the floor as a real interior (walls with door gaps, category-coloured
rooms, ceilings and light fixtures, sliding glass doors that open as you
approach). Once a route is set the camera is locked to it and you press and hold
the forward / backward buttons to walk. Use it when the goal is to *show what
the walk looks like*. See [3D_fps/README.md](3D_fps/README.md).

### `3D_satellite` — map view

Shows the building from above as a clean model on a dark base: boundary walls as
a thick light ring, rooms as slate blocks separated by thin gaps (internal walls
are not drawn), open floor left empty, and stairs built as real steps —
descending into a stairwell on any floor with one below it, or climbing up out
of solid ground on the lowest floor (`is_lowest_floor`). The camera behaves like
OpenStreetMap (drag to pan, wheel to zoom at the cursor, right-drag to rotate
and tilt, pinch on touch). Room labels with category icons appear as you zoom
in, skipping any room still named with its auto-generated `"Room N"`
placeholder. Choosing a start and destination draws an animated blue route and
drops a destination pin; a play bar walks the blue "you are here" dot along it.
Use it for orientation, browsing places and previewing routes. See
[3D_satellite/README.md](3D_satellite/README.md) for the full look, interaction
table and tuning constants.

## Shared architecture

Both are built from decoupled components that only talk through
`CustomEvent`s on one shared DOM element, so any component can be swapped or
driven from a .NET/Blazor host with nothing more than
`element.dispatchEvent(new CustomEvent(...))`.

| Event | Direction | Used by | Detail |
|---|---|---|---|
| `wayfinding:route-change` | in | both | `{ startId, destinationId }` |
| `wayfinding:floor-loaded` | out | both | `{ nodes }` |
| `wayfinding:route-set` | out | both | `{ startId, destinationId, distanceMeters }` (satellite adds `durationSeconds`) |
| `wayfinding:route-error` | out | both | `{ startId, destinationId, reason }` |
| `wayfinding:progress` | out | both | `{ progress, distance, atStart, atEnd }` (satellite adds `total`) |
| `wayfinding:move` | in | both | `{ direction: 'forward' \| 'backward', distance? }` |
| `wayfinding:move-start` / `move-stop` | in | 3D_fps | press-and-hold walking |
| `wayfinding:play` / `pause` / `seek` | in | 3D_satellite | route preview playback |
| `wayfinding:route-clear` / `route-cleared` | in / out | 3D_satellite | clear the route |
| `wayfinding:playback` | out | 3D_satellite | `{ playing }` |
| `wayfinding:room-select` | out | 3D_satellite | `{ id, nodeId, name, category }` |

## Using either in a .NET app

1. Copy the viewer's `src/` into `wwwroot/` (e.g. `wwwroot/wayfinding/`). Nothing
   needs building.
2. Copy the floor's four JSON files under `wwwroot/` too, mirroring the Editor's
   own `{buildingId}/{floorId}/` layout if you like (e.g. `wwwroot/floors/2/1/`).
3. Import and mount it:
   ```html
   <div id="map" style="height:600px"></div>
   <script type="module">
     // 3D_fps:        import { WayfindingView } from './wayfinding/index.js';
     // 3D_satellite:  import { SatelliteView }  from './wayfinding/index.js';
     import { SatelliteView } from './wayfinding/index.js';
     const view = new SatelliteView(document.getElementById('map'));
     view.loadFloor('/floors/2/1/');
   </script>
   ```
4. Drive it by dispatching the events above on the container element, or call
   methods on the instance (`setRoute(startId, destinationId)` on both;
   `moveForward()` / `moveBackward()` on 3D_fps; `clearRoute()`, `play()`,
   `setUserNode(id)`, `recenter()` on 3D_satellite).

If you put your own UI on top of the satellite map (a panel, a bottom bar), pass
`getInsets` to `new SatelliteView(...)` so the camera frames the building in the
uncovered area — see [3D_satellite/example/index.html](3D_satellite/example/index.html).
