// Keyboard + mouse, and touch controls: a floating move stick on the left, one big Fire
// button on the right (the game aims it at the nearest enemy in range), and Dash.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: innerWidth / 2 + 100, y: innerHeight / 2, down: false };
    this.dashQueued = false;
    this.onBluff = null;
    this.onBuy = null; // guns + lasers: 1 medkit, 2 turret, 3 laser mine
    this.onMute = null;
    this.onAnyInput = null;
    this.touchOn = false;
    this.tMove = { x: 0, y: 0 };
    this.tAim = null; // {x, y} unit-ish vector while right stick held (legacy twin-stick)
    this.tFire = false; // the Fire button is held
    this.lastAim = 0;

    const typing = (e) => e.target instanceof HTMLInputElement;
    addEventListener('keydown', (e) => {
      if (typing(e)) return;
      this.onAnyInput?.();
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.dashQueued = true;
      if (e.code === 'KeyQ') this.onBluff?.();
      const buy = { Digit1: 'medkit', Digit2: 'turret', Digit3: 'mine', Numpad1: 'medkit', Numpad2: 'turret', Numpad3: 'mine' }[e.code];
      if (buy) this.onBuy?.(buy);
      if (e.code === 'KeyM') this.onMute?.();
      if (e.code === 'KeyN') this.onMusic?.();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.down = true;
      this.onAnyInput?.();
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  enableTouch(root) {
    if (this.touchOn) return;
    this.touchOn = true;
    document.body.classList.add('touch-on');
    root.hidden = false;
    const R = 56;
    const bindStick = (zone, onMove, onEnd) => {
      const base = zone.querySelector('.stick');
      const knob = zone.querySelector('.knob');
      let id = null;
      let ox = 0;
      let oy = 0;
      const update = (e) => {
        let dx = e.clientX - ox;
        let dy = e.clientY - oy;
        const len = Math.hypot(dx, dy);
        if (len > R) {
          dx = (dx / len) * R;
          dy = (dy / len) * R;
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        onMove(dx / R, dy / R);
      };
      zone.addEventListener('pointerdown', (e) => {
        if (id !== null) return;
        this.onAnyInput?.();
        id = e.pointerId;
        zone.setPointerCapture(id);
        const r = zone.getBoundingClientRect();
        ox = e.clientX;
        oy = e.clientY;
        base.style.left = `${ox - r.left}px`;
        base.style.top = `${oy - r.top}px`;
        base.classList.add('on');
        update(e);
      });
      zone.addEventListener('pointermove', (e) => e.pointerId === id && update(e));
      const end = (e) => {
        if (e.pointerId !== id) return;
        id = null;
        base.classList.remove('on');
        knob.style.transform = '';
        onEnd();
      };
      zone.addEventListener('pointerup', end);
      zone.addEventListener('pointercancel', end);
    };
    bindStick(
      root.querySelector('#tz-left'),
      (x, y) => (this.tMove = { x, y }),
      () => (this.tMove = { x: 0, y: 0 }),
    );
    // Fire: hold to shoot; the game turns you toward the nearest enemy in range
    const fire = root.querySelector('#t-fire');
    let fid = null;
    fire.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onAnyInput?.();
      fid = e.pointerId;
      fire.setPointerCapture(fid);
      this.tFire = true;
      fire.classList.add('on');
    });
    const release = (e) => {
      if (e.pointerId !== fid) return;
      fid = null;
      this.tFire = false;
      fire.classList.remove('on');
    };
    fire.addEventListener('pointerup', release);
    fire.addEventListener('pointercancel', release);
    root.querySelector('#t-dash').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.dashQueued = true;
    });
    root.querySelector('#t-bag').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onBluff?.();
    });
  }

  moveVector() {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (!x && !y && this.touchOn) {
      x = this.tMove.x;
      y = this.tMove.y;
      const len = Math.hypot(x, y);
      if (len < 0.15) return { x: 0, y: 0 };
      return { x, y };
    }
    const len = Math.hypot(x, y);
    return len ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  // sx, sy: where the runner is drawn on screen
  aimAngle(sx, sy) {
    if (this.touchOn) {
      if (this.tAim && Math.hypot(this.tAim.x, this.tAim.y) > 0.2) this.lastAim = Math.atan2(this.tAim.y, this.tAim.x);
      else {
        const m = this.tMove;
        if (Math.hypot(m.x, m.y) > 0.3) this.lastAim = Math.atan2(m.y, m.x);
      }
      return this.lastAim;
    }
    this.lastAim = Math.atan2(this.mouse.y - sy, this.mouse.x - sx);
    return this.lastAim;
  }

  firing() {
    if (this.touchOn) return this.tFire || (!!this.tAim && Math.hypot(this.tAim.x, this.tAim.y) > 0.55);
    return this.mouse.down;
  }

  takeDash() {
    const d = this.dashQueued;
    this.dashQueued = false;
    return d;
  }
}
