export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.justPressed = {};
    this.mouseButtons = {};
    this.mouseDelta = { x: 0, y: 0 };
    this.isPointerLocked = false;

    this.initEventListeners();
  }

  initEventListeners() {
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (!this.keys[code]) {
        this.justPressed[code] = true;
      }
      this.keys[code] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
    });

    this.canvas.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        this.requestPointerLock();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPointerLocked) {
        this.mouseDelta.x += e.movementX || 0;
        this.mouseDelta.y += e.movementY || 0;
      }
    });

    window.addEventListener('mousedown', (e) => {
      this.mouseButtons[e.button] = true;
    });

    window.addEventListener('mouseup', (e) => {
      this.mouseButtons[e.button] = false;
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('wheel', (e) => {
      if (e.deltaY > 0) {
        this.wheelDelta = 1;
      } else if (e.deltaY < 0) {
        this.wheelDelta = -1;
      }
    });
  }

  requestPointerLock() {
    this.canvas.requestPointerLock().catch(() => {});
  }

  exitPointerLock() {
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  isKeyDown(code) {
    return !!this.keys[code];
  }

  wasKeyJustPressed(code) {
    const pressed = !!this.justPressed[code];
    this.justPressed[code] = false;
    return pressed;
  }

  isMouseButtonDown(button) {
    return !!this.mouseButtons[button];
  }

  consumeMouseDelta() {
    const delta = { x: this.mouseDelta.x, y: this.mouseDelta.y };
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return delta;
  }

  consumeWheelDelta() {
    const w = this.wheelDelta || 0;
    this.wheelDelta = 0;
    return w;
  }

  resetFrame() {
    this.justPressed = {};
  }
}
