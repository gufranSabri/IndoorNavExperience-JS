export const SATELLITE_STYLE = `
.sat-root {
  --sat-font: Inter, ui-sans-serif, system-ui, -apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
  --sat-glass: rgba(21, 23, 28, 0.8);
  --sat-border: rgba(255, 255, 255, 0.09);
  --sat-text: #eef1f5;
  --sat-muted: #98a2b3;
  --sat-accent: #4285f4;
  position: relative; overflow: hidden;
  background: radial-gradient(120% 90% at 50% 42%, #17191e 0%, #0e0f13 55%, #08090b 100%);
  font-family: var(--sat-font);
  -webkit-font-smoothing: antialiased;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
}
.sat-root canvas { display: block; width: 100%; height: 100%; }
.sat-overlay { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.sat-labels, .sat-markers { position: absolute; inset: 0; }

/* ---- labels ---- */
.sat-label { position: absolute; left: 0; top: 0; pointer-events: none; will-change: transform; }
.sat-chip {
  display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 13px 0 3px; border-radius: 15px;
  background: rgba(17, 19, 24, 0.8); border: 1px solid var(--sat-border);
  -webkit-backdrop-filter: blur(10px) saturate(1.5); backdrop-filter: blur(10px) saturate(1.5);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  color: var(--sat-text); font: 600 12px/1 var(--sat-font); letter-spacing: 0.01em; white-space: nowrap;
  opacity: 0; transform: translateY(5px) scale(0.86); transform-origin: 50% 50%;
  transition: opacity 0.28s ease, transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.2), background 0.2s ease, border-color 0.2s ease;
  box-sizing: border-box;
}
.sat-label.is-visible .sat-chip { opacity: 1; transform: none; }
.sat-label-badge {
  flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center;
  background: var(--c); color: #0d0f13;
}
.sat-label-text { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.sat-label.is-icon .sat-chip { width: 30px; padding: 0; justify-content: center; gap: 0; }
.sat-label.is-icon .sat-label-text { display: none; }
.sat-label.is-selected .sat-chip { background: rgba(66, 133, 244, 0.92); border-color: rgba(255, 255, 255, 0.35); }
.sat-label.is-selected .sat-label-badge { background: #fff; color: #1a56c4; }

/* ---- you are here ---- */
.sat-user, .sat-pin { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0; transition: opacity 0.3s ease; will-change: transform; }
.sat-user.is-visible, .sat-pin.is-visible { opacity: 1; }
.sat-user.is-hidden, .sat-pin.is-hidden { opacity: 0 !important; }
.sat-user.is-visible.is-occluded { opacity: 0.4; }
.sat-user-dot {
  position: absolute; left: -11px; top: -11px; width: 22px; height: 22px; box-sizing: border-box; border-radius: 50%;
  background: #4285f4; border: 3.5px solid #fff;
  box-shadow: 0 2px 9px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.12);
}
.sat-user-halo {
  position: absolute; left: -28px; top: -28px; width: 56px; height: 56px; border-radius: 50%;
  background: rgba(66, 133, 244, 0.32); animation: sat-pulse 2.4s cubic-bezier(0.2, 0.6, 0.3, 1) infinite;
}
@keyframes sat-pulse { 0% { transform: scale(0.4); opacity: 0.95; } 100% { transform: scale(1.3); opacity: 0; } }
.sat-user-cone {
  position: absolute; left: -50px; top: -50px; width: 100px; height: 100px; border-radius: 50%; transition: opacity 0.3s ease;
  background: conic-gradient(from -33deg at 50% 50%, rgba(66, 133, 244, 0.85) 0deg, rgba(66, 133, 244, 0.85) 66deg, transparent 66deg);
  -webkit-mask: radial-gradient(circle at 50% 50%, transparent 9px, rgba(0, 0, 0, 0.95) 16px, transparent 49px);
  mask: radial-gradient(circle at 50% 50%, transparent 9px, rgba(0, 0, 0, 0.95) 16px, transparent 49px);
}
.sat-pin { color: #ea4335; }
.sat-pin-shape { position: absolute; left: -18px; top: -46px; transform-origin: 50% 100%; filter: drop-shadow(0 4px 5px rgba(0, 0, 0, 0.5)); }
.sat-pin.is-visible .sat-pin-shape { animation: sat-drop 0.6s cubic-bezier(0.2, 1.3, 0.4, 1) both; }
.sat-pin-shadow { position: absolute; left: -9px; top: -3px; width: 18px; height: 6px; border-radius: 50%; background: rgba(0, 0, 0, 0.55); filter: blur(2px); }
@keyframes sat-drop { 0% { transform: translateY(-30px) scale(0.5); opacity: 0; } 55% { opacity: 1; } 100% { transform: none; opacity: 1; } }
.sat-pin-name {
  position: absolute; left: 24px; top: -38px; padding: 6px 11px; border-radius: 9px; white-space: nowrap;
  background: rgba(17, 19, 24, 0.86); border: 1px solid var(--sat-border); color: var(--sat-text);
  font: 600 12px/1 var(--sat-font); box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
}
.sat-pin-name:empty { display: none; }
.sat-pin.is-flipped .sat-pin-name { left: auto; right: 24px; }

/* ---- map buttons ---- */
.sat-controls {
  position: absolute; right: calc(16px + env(safe-area-inset-right)); bottom: calc(24px + env(safe-area-inset-bottom));
  display: flex; flex-direction: column; gap: 10px; pointer-events: auto;
}
.sat-btn-group {
  display: flex; flex-direction: column; border-radius: 13px; overflow: hidden;
  background: var(--sat-glass); border: 1px solid var(--sat-border);
  -webkit-backdrop-filter: blur(14px) saturate(1.4); backdrop-filter: blur(14px) saturate(1.4);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
}
.sat-btn {
  appearance: none; border: 0; background: transparent; color: var(--sat-text); cursor: pointer;
  width: 42px; height: 42px; display: grid; place-items: center; padding: 0;
  font: 700 12px/1 var(--sat-font); letter-spacing: 0.02em;
  transition: background 0.15s ease, color 0.15s ease;
}
.sat-btn + .sat-btn { border-top: 1px solid var(--sat-border); }
.sat-btn:hover { background: rgba(255, 255, 255, 0.08); }
.sat-btn:active { background: rgba(255, 255, 255, 0.14); }
.sat-btn:focus-visible { outline: 2px solid var(--sat-accent); outline-offset: -2px; }
.sat-compass svg { transition: opacity 0.2s ease; opacity: 0.75; }
.sat-controls.is-rotated .sat-compass svg { opacity: 1; }

@media (max-width: 560px) {
  .sat-btn { width: 40px; height: 40px; }
  .sat-controls { right: 12px; bottom: calc(96px + env(safe-area-inset-bottom)); }
}
`;

let injected = false;
export function ensureSatelliteStyle() {
  if (injected) return;
  const el = document.createElement('style');
  el.textContent = SATELLITE_STYLE;
  document.head.appendChild(el);
  injected = true;
}
