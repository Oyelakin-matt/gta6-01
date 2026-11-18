// Solara Bay — keyboard + mouse state, pointer lock for the orbit camera.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.locked = false;
    this._pressed = new Set();

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this._pressed.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code) { return this.keys.has(code); }
  // true only on the frame the key went down (consumed by endFrame)
  pressed(code) { return this._pressed.has(code); }

  lockPointer() {
    if (!this.locked) this.canvas.requestPointerLock();
  }
  unlockPointer() {
    if (this.locked) document.exitPointerLock();
  }

  // call once per frame after the game has read the input
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this._pressed.clear();
  }

  // WASD / arrows as a -1..1 pair, relative to the camera
  moveAxis() {
    let x = 0, z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, z };
  }
}
