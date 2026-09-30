import { ROOM_PROFILES, ROOM_RULES, ROOM_FALLBACK_PROFILE, ROOM_NAME_ACCENTS } from './constants.js';

// Picks the profile key for a boundary.json room from ROOM_RULES.
export function resolveProfileKey(room) {
  const attributes = room?.attributes || [];
  for (const rule of ROOM_RULES) {
    if (rule.category !== room?.category) continue;
    if (rule.has && !rule.has.every((a) => attributes.includes(a))) continue;
    return rule.profile;
  }
  return ROOM_FALLBACK_PROFILE;
}

// The full look for a room: the rule-picked profile, with label / icon / tint
// swapped in from a name accent (see ROOM_NAME_ACCENTS) when one matches.
export function resolveRoomProfile(room) {
  const key = resolveProfileKey(room);
  const base = ROOM_PROFILES[key];
  const accent = ROOM_NAME_ACCENTS.find((a) => a.match.test(room?.name || ''));
  if (!accent) return { key, ...base };
  const { label, icon, tint } = ROOM_PROFILES[accent.profile];
  return { key, ...base, label, icon, tint };
}

// The {label, color, icon} shape the label layer / destination picker consume.
export function profileStyle(profile) {
  return { label: profile.label, color: profile.tint, icon: profile.icon };
}
