# Indoor Wayfinding — First-Person Viewer

A pure-JS, first-person indoor wayfinding library built on Three.js. It renders a
floor from the Wayfinding Editor's exported JSON (see
[docs/MAP_DATA_STORAGE.md](docs/MAP_DATA_STORAGE.md)), draws an animated route
between two selected points, and lets the user walk forward/backward **only
along that route line**.

**`src/` is the entire deliverable.** It is plain, native ES modules — no
bundler, no npm, no build step, no CDN, no internet access at runtime.
Three.js itself is vendored as a single file at
[src/vendor/three.module.js](src/vendor/three.module.js) and imported by
relative path, so `src/` has zero external dependencies of any kind. Copy the
whole folder into a `wwwroot` and it works as-is.

## Try it locally

Any static file server works — `fetch()` just needs `http://`, not
`file://`. No npm install is required for this either:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/example/index.html`.

## Architecture

Three decoupled components, wired together only through DOM `CustomEvent`s
so any of them can be swapped out (or replaced by a .NET/Blazor host) without
touching the others:

1. **`WayfindingView`** (`src/WayfindingView.js`) — owns the Three.js scene,
   camera and render loop. Renders the full 3D floor (walls with door gaps,
   rooms colored by category, stairs/exclusion zones, point objects), then
   an animated glowing path once a route is set, then a first-person camera
   locked to that path.
2. **`WayfindingControls`** (`src/WayfindingControls.js`) — forward/backward
   buttons and a progress bar. Only dispatches `wayfinding:move`.
3. **`RouteSelector`** (`src/RouteSelector.js`) — start/destination dropdowns.
   Only dispatches `wayfinding:route-change`, and listens for
   `wayfinding:floor-loaded` to populate its options.

```
src/
├── index.js              entry point — re-exports the three classes below
├── WayfindingView.js      component 1: the 3D view
├── WayfindingControls.js  component 2: forward/backward controls
├── RouteSelector.js       component 3: start/destination selector
├── core/                  geometry building, coordinate projection, path
│                          animation, walk/camera logic, data loading
└── vendor/
    └── three.module.js    vendored Three.js r160 (unmodified upstream build)
```

### Event contract

All events are standard `CustomEvent`s on a shared target element (the
view's container, by default), so a .NET host can drive the view with
`IJSRuntime.InvokeVoidAsync` calling nothing more than
`element.dispatchEvent(new CustomEvent(...))` — no reference to any JS class
required:

| Event | Direction | Detail |
|---|---|---|
| `wayfinding:move` | in | `{ direction: 'forward' \| 'backward', distance?: number }` |
| `wayfinding:route-change` | in | `{ startId: string, destinationId: string }` |
| `wayfinding:floor-loaded` | out | `{ nodes: Array<{id, label, class}> }` |
| `wayfinding:route-set` | out | `{ startId, destinationId, distanceMeters }` |
| `wayfinding:route-error` | out | `{ startId, destinationId, reason: 'no-path' }` |
| `wayfinding:progress` | out | `{ progress, distance, atStart, atEnd }` |

`startId`/`destinationId` are the positional node ids from the floor's
`graph.json` (e.g. `"exits-0"`, `"room-<guid>"`); `WayfindingView.getNodes()`
or the `wayfinding:floor-loaded` event gives you the full list with friendly
labels. Routing itself is a direct lookup into the editor's precomputed
`paths.json` (a dense pairwise table) — this library does not run its own
pathfinding.

## Example

[example/index.html](example/index.html) wires up all three components as
native ES modules, imported straight from `../src/index.js` (see the
`<script type="module">` block at the bottom of the file) — exactly what
copying `src/` into a real app and importing it looks like. It points at the
bundled floor-5 sample data in `example/data/floor5/` (copied from
`docs/building_data/floors/5`).

## Using it in a .NET app

1. Copy the whole `src/` folder into `wwwroot/` (e.g. `wwwroot/wayfinding/`).
   Nothing needs to be built or transformed first.
2. Copy your floor's JSON files (`boundary.json`, `objects.json`,
   `graph.json`, `paths.json`) somewhere under `wwwroot/` too, e.g.
   `wwwroot/floors/5/`.
3. In your Razor/Blazor page:
   ```html
   <div id="wf-view" style="height:600px"></div>
   <script type="module">
     import { WayfindingView } from './wayfinding/index.js';
     const view = new WayfindingView(document.getElementById('wf-view'));
     view.loadFloor('/floors/5/');
   </script>
   ```
4. Drive it from C# by dispatching the `CustomEvent`s from the table above on
   the view's container element (e.g. via a tiny JS interop function, or
   `IJSRuntime.InvokeVoidAsync("eval", ...)`), or call `view.setRoute(...)`,
   `view.moveForward(...)`, `view.moveBackward(...)` directly if you keep a
   JS-side reference to the view instance.

## Data model reference

See [docs/MAP_DATA_STORAGE.md](docs/MAP_DATA_STORAGE.md) for the full
on-disk JSON contract this library consumes (`boundary.json`,
`objects.json`, `graph.json`, `paths.json`).
