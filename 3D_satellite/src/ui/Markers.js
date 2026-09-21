import { projectToScreen, isOccluded } from '../core/screen.js';

/**
 * "You are here": the blue dot with a white ring, a soft pulsing halo and a
 * translucent beam showing which way you are heading — all DOM, so it stays
 * the same crisp size at any zoom, like Google Maps.
 */
export class UserMarker {
  constructor(container) {
    this.el = document.createElement('div');
    this.el.className = 'sat-user';
    this.el.innerHTML =
      '<div class="sat-user-cone"></div><div class="sat-user-halo"></div><div class="sat-user-dot"></div>';
    container.appendChild(this.el);
    this.cone = this.el.querySelector('.sat-user-cone');
    this.position = null; // {x, y, z} world
    this.heading = null; // {x, z} world direction, or null for "no heading"
    this._s = {};
    this._h = {};
  }

  set(position, heading = null) {
    this.position = position;
    this.heading = heading;
    this.el.classList.toggle('is-visible', !!position);
  }

  // `occluder`: when the tall boundary wall hides the user, the dot is dimmed
  // (not hidden) so it can always be found.
  update(camera, width, height, occluder = null) {
    if (!this.position) return;
    const p = this.position;
    const s = projectToScreen(camera, p.x, p.y, p.z, width, height, this._s);
    this.el.classList.toggle('is-hidden', s.behind);
    this.el.classList.toggle('is-occluded', isOccluded(camera, p.x, p.y, p.z, occluder));
    this.el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`;
    if (this.heading) {
      const h = projectToScreen(camera, p.x + this.heading.x * 3, p.y, p.z + this.heading.z * 3, width, height, this._h);
      const angle = (Math.atan2(h.x - s.x, -(h.y - s.y)) * 180) / Math.PI;
      this.cone.style.transform = `rotate(${angle.toFixed(1)}deg)`;
      this.cone.style.opacity = '';
    } else {
      this.cone.style.opacity = '0';
    }
  }
}

/** The destination pin (a red teardrop) with the destination's name beside it. */
export class DestinationPin {
  constructor(container) {
    this.el = document.createElement('div');
    this.el.className = 'sat-pin';
    this.el.innerHTML = `
      <div class="sat-pin-shadow"></div>
      <svg class="sat-pin-shape" viewBox="0 0 36 46" width="36" height="46" aria-hidden="true">
        <path d="M18 45C18 45 3 29.5 3 17.5a15 15 0 0 1 30 0C33 29.5 18 45 18 45z" fill="currentColor" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/>
        <circle cx="18" cy="17.5" r="6" fill="#fff"/>
      </svg>
      <div class="sat-pin-name"></div>`;
    container.appendChild(this.el);
    this.nameEl = this.el.querySelector('.sat-pin-name');
    this.position = null;
    this._s = {};
  }

  set(position, name = '') {
    this.position = position;
    this.nameEl.textContent = name;
    // Restart the drop-in animation each time a new destination is set.
    this.el.classList.remove('is-visible');
    if (position) {
      void this.el.offsetWidth;
      this.el.classList.add('is-visible');
    }
  }

  update(camera, width, height) {
    if (!this.position) return;
    const p = this.position;
    const s = projectToScreen(camera, p.x, p.y, p.z, width, height, this._s);
    this.el.classList.toggle('is-hidden', s.behind);
    // Near the right edge the name flips to the pin's left so it is never clipped.
    this.el.classList.toggle('is-flipped', s.x > width - this.nameEl.offsetWidth - 60);
    this.el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`;
  }
}
