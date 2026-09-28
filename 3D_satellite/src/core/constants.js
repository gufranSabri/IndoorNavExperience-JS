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
  accent: 0x4285f4, // google-maps blue — the route line itself, and open-office boxes
  hover: 0x8ab4f8,
  destination: 0xea4335,
};

// Room roofs are a neutral slate with a whisper of the category color (used
// for label icon badges — see ROOM_CATEGORY_COLOR below for the box fill itself).
export const CATEGORY_STYLE = {
  closed_office: { label: 'Office', color: '#6ea8fe', icon: 'briefcase' },
  open_office: { label: 'Open office', color: '#4fd1a5', icon: 'users' },
  sub_open_office: { label: 'Open office', color: '#4fd1a5', icon: 'users' },
  meeting_room: { label: 'Meeting room', color: '#b391ff', icon: 'presentation' },
  toilet: { label: 'Restroom', color: '#ffb454', icon: 'toilet' },
  elevator: { label: 'Elevator', color: '#8fb4ff', icon: 'elevator' },
  other: { label: 'Room', color: '#9aa4b2', icon: 'box' },
  non_traversable: { label: 'Restricted', color: '#6b7280', icon: 'ban' },
  default: { label: 'Room', color: '#8b94a3', icon: 'door' },
};
// Fill color of the room box itself, by category (distinct from the label icon
// tint above). Categories not listed here (elevator, other, non_traversable,
// a closed office still named "Room N", ...) fall back to the plain gray box.
export const ROOM_CATEGORY_COLOR = {
  toilet: 0x744e5c, // dusty, faded rose — not neon pink
  meeting_room: 0x57476b, // dusty, faded plum — not neon purple
};
// A named closed office is blended this far toward COLORS.accent (the same
// blue used to look "selected"), and carries a permanent edge outline.
export const CLOSED_OFFICE_TINT = 0.26;
// Room categories that are open floor: no interactive solid is built, just a
// static translucent box (see BuildingBuilder) and a label.
export const OPEN_CATEGORIES = ['open_office', 'sub_open_office'];
export const GLASS_OPACITY = 0.32; // "translucent" — open-office boxes, and a room mid-route
// Extra inward padding for an open-office box, on top of the normal ROOM_GAP
// every room gets — makes it read as visibly smaller than its real boundary,
// floating inside it, rather than filling it edge-to-edge.
export const OPEN_AREA_PADDING = 0.6; // meters
// Whether an open-office box also gets a permanent blue edge outline, the
// same outline a room gets while selected as part of a route.
export const OPEN_AREA_SHOW_OUTLINE = true;

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
export const WALK_MPS = 1.35; // real walking speed used for the time estimate
