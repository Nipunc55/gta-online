// Keyboard + mouse state with per-frame edge detection.
// "Just pressed" flags are NOT consumed on read; they are cleared by resetFrame()
// at the end of every frame so multiple systems can query the same edge.
export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.justPressed = {};
    this.mouseButtons = {};
    this.mouseJustPressed = {};
    this.mouseDelta = { x: 0, y: 0 };
    this.wheelDelta = 0;
    this.isPointerLocked = false;
    this.enabled = true;

    this.initEventListeners();
  }

  initEventListeners() {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.justPressed[e.code] = true;
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    window.addEventListener('blur', () => {
      this.keys = {};
      this.mouseButtons = {};
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPointerLocked) {
        this.mouseDelta.x += e.movementX || 0;
        this.mouseDelta.y += e.movementY || 0;
      }
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.isPointerLocked) return;
      if (!this.mouseButtons[e.button]) this.mouseJustPressed[e.button] = true;
      this.mouseButtons[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => {
      this.mouseButtons[e.button] = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      this.wheelDelta += Math.sign(e.deltaY);
    }, { passive: true });
  }

  requestPointerLock() {
    const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }

  exitPointerLock() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  isKeyDown(code) {
    return !!this.keys[code];
  }

  wasKeyJustPressed(code) {
    return !!this.justPressed[code];
  }

  isMouseButtonDown(button) {
    return !!this.mouseButtons[button];
  }

  wasMouseJustPressed(button) {
    return !!this.mouseJustPressed[button];
  }

  consumeMouseDelta() {
    const d = { x: this.mouseDelta.x, y: this.mouseDelta.y };
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return d;
  }

  consumeWheelDelta() {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  resetFrame() {
    this.justPressed = {};
    this.mouseJustPressed = {};
  }
}
