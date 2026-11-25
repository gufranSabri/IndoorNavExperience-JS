import { OBJECT_STYLE, PICKER_CATEGORIES } from '../core/constants.js';

// Shared {color, icon} lookup for a route node — used everywhere a step /
// leg needs its marker color and glyph: the pre-trip ItineraryView, the
// in-map TripProgress nav bar, and its full-path modal.
export function styleForNode(node) {
  if (!node) return OBJECT_STYLE.default;
  if (node.class === 'room') {
    if (node.profile) return { color: node.profile.tint, icon: node.profile.icon };
    const cat = PICKER_CATEGORIES.find((c) => c.category === node.category);
    return cat ? { color: cat.tint, icon: cat.icon } : { color: '#9aa4b2', icon: 'box' };
  }
  return OBJECT_STYLE[node.class] || OBJECT_STYLE.default;
}
