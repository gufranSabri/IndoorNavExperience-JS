// Everything tunable about the look lives here. Heights are deliberately a
// little taller than real life (a 3.6 m wall on a 70 m footprint would read
// as a hairline from above), so the model has the chunky, readable depth of
// a satellite/isometric map.

export const BASE_HEIGHT = 0.6; // meters, the plinth the building sits on
export const BASE_MARGIN = 1.7; // meters the plinth extends past the outer wall
export const WALL_HEIGHT = 5.2; // meters, boundary walls
export const WALL_THICKNESS = 0.62;
export const WALL_CORNER_RADIUS = 1.7; // meters, rounding of the boundary wall's corners
export const ROOM_CORNER_RADIUS = 0.55; // meters, rounding of every room's corners
export const VOID_CORNER_RADIUS = 0.7; // meters, rounding of the stairwell opening
export const ROOM_HEIGHT = 4.1; // meters, "slightly shorter" than the walls
export const ROOM_GAP = 0.26; // meters of empty space between neighbouring rooms
export const BEVEL = 0.07; // meters, chamfer that catches the light on every top edge

export const COLORS = {
  base: 0x22252b,
  wall: 0xe9ecf0,
  room: 0x50565f,
  exclusion: 0x000000,
  accent: 0x4285f4, // google-maps blue — the route line itself
  hover: 0x8ab4f8,
  destination: 0xea4335,
};

export const GLASS_OPACITY = 0.32; // a block room mid-route turns this translucent

// ---- room rendering -----------------------------------------------------
// How a room looks is decided in two steps, both editable right here:
//   1. ROOM_RULES   — boundary.json's `category` + `attributes` pick a profile key.
//   2. ROOM_PROFILES — that key says how the room is drawn, and how it is
//      labelled / grouped in the destination picker.
// Whether a room is a searchable, labelled place is NOT decided here: that is
// simply `room.navigable` in boundary.json.

export const RENDER_MODE = Object.freeze({
  NONE: 'none', // nothing is built — the base shows through
  BLOCK: 'block', // solid extruded box: hoverable, clickable, goes glass when on a route
  GLASS: 'glass', // permanent translucent box (+ edge outline): never picked or animated
});

export const ROOM_PROFILE = Object.freeze({
  FLOOR_HIDDEN: 'floor_hidden', // floor_space without "render"
  FLOOR_PUBLIC: 'floor_public', // floor_space, render, not private
  FLOOR_PRIVATE: 'floor_private', // floor_space, render, private
  WORK_OPEN: 'work_open', // plain open work area
  WORK_CLOSED: 'work_closed',
  WORK_PRIVATE: 'work_private',
  WORK_MEETING: 'work_meeting',
  TOILET: 'toilet',
  FOOD_BEVERAGE: 'food_beverage',
  AMENITY: 'amenity', // amenities / other (shops, services...)
  ELEVATOR: 'elevator',
  UNCLASSIFIED: 'unclassified', // category == null
  LOBBY: 'lobby', // name accent only — see ROOM_NAME_ACCENTS
});

// Profile fields:
//   label   group name in the destination picker (profiles sharing a label share a bucket)
//   icon    key in ui/icons.js        tint  CSS color of the label badge / picker button
//   mode    a RENDER_MODE
//   fill    box color                 edge  outline color, or null for none
//   opacity (GLASS) fill opacity      height box height in meters
//   metalness / roughness (BLOCK) optional material overrides
//   roof    (BLOCK) optional glowing cap { color, inset, thickness } with an arrows plate on top
//   door    (BLOCK) optional elevator door { heightFactor, panel, frame, light } at each door opening
//   padding (GLASS) extra inward inset in meters, on top of ROOM_GAP — makes the box
//           read as floating inside the room instead of filling it edge to edge
const P = ROOM_PROFILE;
const M = RENDER_MODE;
const BLOCK_HEIGHT = ROOM_HEIGHT;
export const ROOM_PROFILES = {
  [P.FLOOR_HIDDEN]: { label: 'Area', icon: 'pin', tint: '#9aa4b2', mode: M.NONE },
  [P.FLOOR_PUBLIC]: {
    label: 'Area', icon: 'pin', tint: '#5fcf8a',
    mode: M.GLASS, fill: 0xe3f7e9, edge: 0x34a853, opacity: 0.3, height: 2.4, padding: 0.4,
  },
  [P.FLOOR_PRIVATE]: {
    label: 'Private area', icon: 'lock', tint: '#9aa4b2',
    mode: M.GLASS, fill: 0x9aa0a6, edge: 0xffffff, opacity: 0.32, height: 2.4, padding: 0.4,
  },
  [P.WORK_OPEN]: {
    label: 'Open office', icon: 'users', tint: '#6ea8fe',
    mode: M.GLASS, fill: 0x4a7fd6, edge: 0x4285f4, opacity: 0.32, height: BLOCK_HEIGHT, padding: 0.6,
  },
  [P.WORK_CLOSED]: {
    label: 'Office', icon: 'briefcase', tint: '#6ea8fe',
    mode: M.BLOCK, fill: 0x535d6e, edge: null, height: BLOCK_HEIGHT,
  },
  [P.WORK_PRIVATE]: {
    label: 'Private office', icon: 'lock', tint: '#8b94a3',
    mode: M.BLOCK, fill: 0x464b54, edge: null, height: BLOCK_HEIGHT,
  },
  [P.WORK_MEETING]: {
    label: 'Meeting room', icon: 'presentation', tint: '#b391ff',
    mode: M.BLOCK, fill: 0x57476b, edge: null, height: BLOCK_HEIGHT,
  },
  [P.TOILET]: {
    label: 'Restroom', icon: 'toilet', tint: '#ffb454',
    mode: M.BLOCK, fill: 0x744e5c, edge: null, height: BLOCK_HEIGHT,
  },
  [P.FOOD_BEVERAGE]: {
    label: 'Food & Beverage', icon: 'utensils', tint: '#fb923c',
    mode: M.BLOCK, fill: 0x6b5332, edge: null, height: BLOCK_HEIGHT,
  },
  [P.AMENITY]: {
    label: 'Shops & Services', icon: 'store', tint: '#f472b6',
    mode: M.BLOCK, fill: 0x6b5a3a, edge: null, height: BLOCK_HEIGHT,
  },
  [P.ELEVATOR]: {
    label: 'Elevator', icon: 'elevator', tint: '#8fb4ff',
    // A polished steel-blue body with a permanent glowing outline and a glowing
    // cap on the roof carrying an up/down-arrow plate (see `roof`).
    mode: M.BLOCK, fill: 0x8796ad, edge: 0x8fb4ff, height: BLOCK_HEIGHT,
    metalness: 0.45, roughness: 0.32,
    roof: { color: 0x3b82f6, inset: 0.45, thickness: 0.28 },
    // Sliding double door on each of the room's doors: `heightFactor` x the block height.
    door: { heightFactor: 0.75, panel: 0xd9dee7, frame: 0x1c2029, light: 0x3b82f6 },
  },
  [P.UNCLASSIFIED]: {
    label: 'Room', icon: 'box', tint: '#8b94a3',
    mode: M.BLOCK, fill: 0x50565f, edge: null, height: BLOCK_HEIGHT,
  },
  // Only ever applied on top of another profile (icon / tint / label group).
  [P.LOBBY]: { label: 'Lobby', icon: 'sofa', tint: '#4fd1a5' },
};

// First rule whose `category` matches and whose `has` attributes are ALL present wins.
// Order matters within a category: put the most specific rule first.
export const ROOM_RULES = [
  { category: 'floor_space', has: ['render', 'private'], profile: P.FLOOR_PRIVATE },
  { category: 'floor_space', has: ['render'], profile: P.FLOOR_PUBLIC },
  { category: 'floor_space', profile: P.FLOOR_HIDDEN },
  { category: 'work_space', has: ['private'], profile: P.WORK_PRIVATE },
  { category: 'work_space', has: ['meeting_room'], profile: P.WORK_MEETING },
  { category: 'work_space', has: ['closed'], profile: P.WORK_CLOSED },
  { category: 'work_space', profile: P.WORK_OPEN },
  { category: 'amenities', has: ['toilet'], profile: P.TOILET },
  { category: 'amenities', has: ['food_beverage'], profile: P.FOOD_BEVERAGE },
  { category: 'amenities', profile: P.AMENITY },
  { category: 'elevator', profile: P.ELEVATOR },
];
export const ROOM_FALLBACK_PROFILE = P.UNCLASSIFIED;

// A room whose name matches keeps its rule-picked look (mode, colors) but takes
// the accent profile's label / icon / tint — for places the data has no
// attribute for, e.g. a lobby (a plain floor_space).
export const ROOM_NAME_ACCENTS = [{ match: /^lobby\b/i, profile: P.LOBBY }];

// Destination picker: one button per room `category`, in this order, then a
// final "Other" button for every non-room node (see OBJECT_STYLE).
export const PICKER_CATEGORIES = [
  { category: 'floor_space', label: 'Floor space', icon: 'pin', tint: '#5fcf8a' },
  { category: 'work_space', label: 'Workspace', icon: 'briefcase', tint: '#6ea8fe' },
  { category: 'amenities', label: 'Amenities', icon: 'store', tint: '#f472b6' },
  { category: 'elevator', label: 'Elevator', icon: 'elevator', tint: '#8fb4ff' },
];

// Rooms with these ids are never built (the editor's whole-floor "Floor" room
// would otherwise be one giant box covering everything).
export const SKIP_ROOM_IDS = ['floor-space'];

// ---- stairs ---------------------------------------------------------
export const STAIR_RISE = 0.2; // meters per step (a little tall, like the rest of the model)
export const STAIR_TREAD = 0.34; // meters of run per step
export const STAIR_LIGHT = 0xa9b0bc; // top-of-stairs color; vertex colors fade it to black with depth (descending stairs only)
export const STAIR_DARK = 0x08090b;
export const VOID_COLOR = 0x040405;
export const DEFAULT_VOID_DEPTH = -3; // meters below the floor, used for an exclusion zone with no stairs of its own

export const OBJECT_STYLE = {
  exits: { label: 'Exit', color: '#4ade80', icon: 'exit' },
  stairs: { label: 'Stairs', color: '#fbbf24', icon: 'stairs' },
  'fire-extinguisher': { label: 'Fire extinguisher', color: '#f87171', icon: 'flame' },
  'fire-alarm': { label: 'Fire alarm', color: '#f87171', icon: 'bell' },
  default: { label: 'Point', color: '#c084fc', icon: 'pin' },
};

// ---- default start ----------------------------------------------------
// The start pre-selected on a floor (and where the "you are here" dot begins):
// the kiosk node closest to an exit node whose label matches.
export const DEFAULT_START = {
  nodeClass: /kiosk/i, // matched against a node's `class` (objects.json key)
  exitLabel: /^main exit/i, // matched against the exit's label
};

// ---- kiosk -------------------------------------------------------------
// The 3D kiosk placed at every kiosk object (DEFAULT_START.nodeClass), its
// screen turned toward the nearest exit matching DEFAULT_START.exitLabel.
export const KIOSK = {
  width: 1.7, // meters, screen housing width
  depth: 1.0, // plinth depth
  headDepth: 0.16,
  plinthHeight: 0.32,
  screenY: 1.95, // height of the screen's center
  screenHeight: 1.25,
  tilt: 0.2, // radians the screen leans back
  bodyColor: 0xe9ecf0,
  baseColor: 0x2a2d34,
  accentColor: 0x4285f4,
  height: 2.75, // total, used to lift the map label above it
};

// ---- camera ---------------------------------------------------------
export const CAMERA_FOV = 32;
export const CAMERA_MAX_PITCH = 68; // degrees from straight down
export const CAMERA_DEFAULT_PITCH = 50;
export const CAMERA_MIN_DISTANCE = 7; // meters
export const CAMERA_MAX_DISTANCE_FACTOR = 1.6; // x the "fit whole building" distance
export const LABEL_ZOOM_DISTANCE_FACTOR = 0.93; // labels appear once closer than this x the fit distance
export const INTRO_ZOOM_DISTANCE_FACTOR = 0.8; // where the intro flight settles — inside LABEL_ZOOM_DISTANCE_FACTOR so labels are already on by the time it ends

// ---- route ----------------------------------------------------------
export const ROUTE_WORLD_WIDTH = 1.5; // meters, line width at a comfortable zoom
export const ROUTE_MIN_PX = 10; // ...but never thinner / thicker than this on screen
export const ROUTE_MAX_PX = 22;
export const ROUTE_CORNER_RADIUS = 3.4; // meters, fillet on every turn
export const ROUTE_DRAW_MPS = 38; // draw-on animation speed
export const PLAYBACK_MPS = 4.5; // preview walking speed
export const WALK_MPS = 1.3; // real walking speed used for the time estimate
