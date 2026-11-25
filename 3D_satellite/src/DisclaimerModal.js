const STYLE = `
.wf-disclaimer, .wf-disclaimer * { box-sizing: border-box; }
.wf-disclaimer {
  --text: var(--sat-text, #eef1f5); --muted: var(--sat-muted, #98a2b3); --border: var(--sat-border, rgba(255,255,255,.09));
  font-family: var(--sat-font, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  color: var(--text); position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
  padding: 24px; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;
}
.wf-disclaimer[hidden] { display: none; }
.wf-disclaimer-backdrop { position: absolute; inset: 0; background: rgba(6,7,9,.72); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
.wf-disclaimer-card {
  position: relative; width: min(420px, 100%); padding: 28px 26px 24px; border-radius: 22px; text-align: center;
  background: rgba(19,21,26,.97); border: 1px solid var(--border); box-shadow: 0 24px 60px rgba(0,0,0,.55);
  -webkit-backdrop-filter: blur(20px) saturate(1.4); backdrop-filter: blur(20px) saturate(1.4);
}
.wf-disclaimer-icon {
  width: 52px; height: 52px; margin: 0 auto 16px; border-radius: 50%; display: grid; place-items: center;
  background: rgba(66,133,244,.16); color: #6aa4ff;
}
.wf-disclaimer-card h2 { margin: 0 0 10px; font-size: 18px; font-weight: 650; letter-spacing: -.01em; }
.wf-disclaimer-card p { margin: 0 0 22px; font-size: 13.5px; line-height: 1.5; color: var(--muted); }
.wf-disclaimer-actions { display: flex; flex-direction: column; gap: 10px; }
.wf-disclaimer-btn {
  appearance: none; border: 0; height: 44px; border-radius: 12px; font: 600 14px/1 inherit; font-family: inherit; cursor: pointer;
  transition: background .15s ease, opacity .15s ease;
}
.wf-disclaimer-btn--primary { background: #4285f4; color: #fff; }
.wf-disclaimer-btn--primary:hover { background: #5a95f5; }
.wf-disclaimer-btn--ghost { background: rgba(255,255,255,.06); color: var(--text); border: 1px solid var(--border); }
.wf-disclaimer-btn--ghost:hover { background: rgba(255,255,255,.1); }
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const el = document.createElement('style');
  el.textContent = STYLE;
  document.head.appendChild(el);
  styleInjected = true;
}

/**
 * "We don't do live tracking" notice, shown before the trip planner on
 * every visit (deliberately not a one-time/localStorage-gated thing — the
 * reminder matters every time someone starts a trip, not just the first).
 * `onDismiss` fires once OK is clicked. `onLearnMore` is optional and, if
 * omitted, hides that button entirely — it has no behavior of its own yet.
 */
export class DisclaimerModal {
  constructor(container, { onDismiss, onLearnMore } = {}) {
    ensureStyle();
    this.container = container;
    this.onDismiss = onDismiss;

    this.root = document.createElement('div');
    this.root.className = 'wf-disclaimer';
    this.root.innerHTML = `
      <div class="wf-disclaimer-backdrop"></div>
      <div class="wf-disclaimer-card" role="dialog" aria-label="Before you start">
        <div class="wf-disclaimer-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        </div>
        <h2>This map doesn't track you live</h2>
        <p>There's no indoor GPS here, so the blue dot won't follow you automatically — you'll need to follow the directions yourself.</p>
        <div class="wf-disclaimer-actions">
          <button type="button" class="wf-disclaimer-btn wf-disclaimer-btn--primary" data-role="ok">OK, got it</button>
          <button type="button" class="wf-disclaimer-btn wf-disclaimer-btn--ghost" data-role="learn" hidden>Learn how to use</button>
        </div>
      </div>`;
    container.appendChild(this.root);

    this.root.querySelector('[data-role="ok"]').addEventListener('click', () => this.dismiss());
    const learnBtn = this.root.querySelector('[data-role="learn"]');
    if (onLearnMore) {
      learnBtn.hidden = false;
      learnBtn.addEventListener('click', onLearnMore);
    }
  }

  show() {
    this.root.hidden = false;
  }

  dismiss() {
    this.root.hidden = true;
    this.onDismiss?.();
  }

  dispose() {
    this.root.remove();
  }
}
