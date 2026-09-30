// Quality tiers, in order of cost. Each step down trades looks for frame rate:
//   high    full pixel ratio, big shadow map, antialiasing
//   low     capped pixel ratio, smaller shadow map
//   minimal pixel ratio 1, no shadows
export const TIERS = ['high', 'low', 'minimal'];

// GPUs that are fine on paper but too slow to fill a phone screen at 60fps
// with this scene, plus software rasterizers (no real GPU at all).
const WEAK_GPU = /swiftshader|llvmpipe|software|mali-4|mali-t|mali-g(31|51|52)\b|adreno \(?tm\)? ?(2|3|4|5)\d\d|adreno \(?tm\)? ?6(0|1)\d\b|powervr|videocore/i;

/**
 * Picks a starting tier from what the browser will tell us, before anything
 * has been drawn. It only has to be roughly right: FrameMonitor corrects it
 * from real frame times. Returns { tier, reasons }.
 */
export function detectStartingTier(gl) {
  const reasons = [];
  const nav = navigator;
  const phone = !!window.matchMedia?.('(pointer: coarse)').matches;
  let score = 0; // 0 = fine, 1 = borderline, 2+ = weak

  if (nav.connection?.saveData) { score += 1; reasons.push('data saver on'); }
  if (nav.deviceMemory && nav.deviceMemory <= 4) { score += 1; reasons.push(`deviceMemory=${nav.deviceMemory}GB`); }
  if (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) { score += 1; reasons.push(`cores=${nav.hardwareConcurrency}`); }

  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (name && WEAK_GPU.test(name)) { score += 2; reasons.push(`gpu=${name}`); }
    if (gl.getParameter(gl.MAX_TEXTURE_SIZE) < 8192) { score += 1; reasons.push('small max texture'); }
  }

  let tier = 'high';
  if (score >= 3) tier = 'minimal';
  else if (score >= 2 || (phone && score >= 1)) tier = 'low';
  return { tier, reasons, phone };
}

/**
 * Watches real frame times and asks for a cheaper tier when the device can't
 * keep up. Measures in windows of N frames, ignores the first moments (shader
 * compiles, the intro fly-in) and any gap from a hidden tab, and only ever
 * steps down, so quality can't flap back and forth.
 */
export class FrameMonitor {
  constructor({ onSlow, windowFrames = 45, slowMs = 34, warmupMs = 1500, strikes = 2 } = {}) {
    this.onSlow = onSlow;
    this.windowFrames = windowFrames;
    this.slowMs = slowMs;
    this.warmupMs = warmupMs;
    this.strikes = strikes;
    this.enabled = true;
    this.fps = 0;
    this._reset();
    this._elapsed = 0;
  }

  _reset() {
    this._frames = [];
    this._bad = 0;
  }

  /** Call after a tier change so the new setting gets a fair measurement. */
  restart() {
    this._reset();
    this._elapsed = 0;
  }

  /** rawDt in seconds, unclamped. */
  tick(rawDt) {
    if (!this.enabled) return;
    if (rawDt > 0.5) { this._frames.length = 0; return; } // tab was hidden / page stalled
    this._elapsed += rawDt * 1000;
    if (this._elapsed < this.warmupMs) return;
    this._frames.push(rawDt * 1000);
    if (this._frames.length < this.windowFrames) return;

    const sorted = [...this._frames].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this._frames.length = 0;
    this.fps = 1000 / median;
    this._bad = median > this.slowMs ? this._bad + 1 : 0;
    if (this._bad >= this.strikes) {
      this._bad = 0;
      this.onSlow?.(this.fps);
    }
  }
}
