export const WALL_THICKNESS = 0.12; // meters
export const WALL_HEIGHT_EXTERNAL = 3.6; // meters
export const WALL_HEIGHT_INTERNAL = 3.3; // meters
export const DOOR_HEADER_HEIGHT = 0.4; // meters, lintel above a door gap
export const EYE_HEIGHT = 1.65; // meters, first-person camera height

export const BASEBOARD_HEIGHT = 0.1; // meters
export const WALL_CAP_HEIGHT = 0.05; // meters, shadow-line reveal at ceiling

export const CEILING_HEIGHT = WALL_HEIGHT_EXTERNAL; // one flat ceiling plane for the whole floor
export const CEILING_TILE_METERS = 0.6;
export const CEILING_COLOR = 0xf5f4f0;

// Interior "room light" fixtures — needed because the ceiling blocks the
// sun/hemisphere lighting that lit the interior back when the floor was
// open-top, so first-person walking still needs to read as a lit room.
export const INTERIOR_LIGHT_SPACING = 4.4; // meters between ceiling fixtures on the placement grid
export const INTERIOR_LIGHT_HEIGHT_OFFSET = 0.2; // meters below the ceiling
export const INTERIOR_LIGHT_COLOR = 0xfff2da;
export const INTERIOR_LIGHT_INTENSITY = 2.4;
export const INTERIOR_LIGHT_DISTANCE = 6.5;
export const INTERIOR_LIGHT_MAX_COUNT = 90;
export const INTERIOR_LIGHT_ACTIVE_RADIUS = 7; // meters — only fixtures this close to the walker are ever lit at once

// Sliding glass doors: two leaves that retract into the flanking wall as
// the walker approaches and slide shut again once they move away.
export const DOOR_OPEN_DISTANCE = 2; // meters — proximity that triggers opening
export const DOOR_CLOSE_DISTANCE = 2.6; // meters — proximity below which they stay open (hysteresis)
export const DOOR_SLIDE_SPEED = 2.6; // open-fraction per second
export const DOOR_LEAF_MARGIN = 0.03; // meters, gap left between the two leaves when fully closed
export const GLASS_DOOR_COLOR = 0xa8c4d8; // echoes docs/building-app's GlassPanel tone

// Palette tuned to echo docs/building-app's material language (soft cool
// structural grays + a metal accent), just applied to plan-view partitions
// instead of a glass curtain wall.
export const WALL_COLOR_EXTERNAL = 0xc7ccd6; // concrete-ish mass, docs/building-app FloorSlab tone
export const WALL_COLOR_INTERNAL = 0xe4e6ea; // painted partition
export const BASEBOARD_COLOR = 0x5b6472;
export const WALL_CAP_COLOR = 0x9aa4b2;
export const DOOR_FRAME_COLOR = 0x77879c;

export const EXCLUSION_COLOR = 0x232a35;
export const EXCLUSION_OPACITY = 0.92;

export const OBJECT_COLORS = {
  exits: 0x2ecc71,
  elevator: 0x3498db,
  stairs: 0xe0a458,
  'fire-extinguisher': 0xe74c3c,
  'fire-alarm': 0xe74c3c,
  default: 0x9b59b6,
};

export const PATH_COLOR = 0x2f6fed;
export const PATH_RADIUS = 0.045; // meters, tube radius
export const PATH_DRAW_DURATION_MS = 1400;

export const DEFAULT_STEP_METERS = 1.2; // per forward/backward control press
export const WALK_SPEED_MPS = 1.6; // camera travel speed while tweening between positions

export const FLOOR_TILE_METERS = 0.6; // real-world tile size for the procedural floor texture

export const SKY_TOP_COLOR = '#a9cdf0';
export const SKY_HORIZON_COLOR = '#dfeaf5';
export const SKY_GROUND_COLOR = '#eef1f5';
