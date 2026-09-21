// Event names shared by the view and the UI components. They live in their
// own module so the components never have to import the view class (and
// never import each other) — the DOM is the only thing connecting them.
export const ROUTE_CHANGE_EVENT = 'wayfinding:route-change';
export const FLOOR_LOADED_EVENT = 'wayfinding:floor-loaded';
export const ROUTE_SET_EVENT = 'wayfinding:route-set';
export const ROUTE_CLEAR_EVENT = 'wayfinding:route-clear';
export const ROUTE_CLEARED_EVENT = 'wayfinding:route-cleared';
export const ROUTE_ERROR_EVENT = 'wayfinding:route-error';
export const PROGRESS_EVENT = 'wayfinding:progress';
export const PLAY_EVENT = 'wayfinding:play';
export const PAUSE_EVENT = 'wayfinding:pause';
export const SEEK_EVENT = 'wayfinding:seek';
export const PLAYBACK_EVENT = 'wayfinding:playback';
export const MOVE_EVENT = 'wayfinding:move';
export const ROOM_SELECT_EVENT = 'wayfinding:room-select';
