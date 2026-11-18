// Solara Bay — cars: the model builder and arcade driving physics shared by the
// player's car, traffic and the police.
import * as THREE from 'three';
import { CITY } from './config.js';

const WHEEL_R = 0.38;

export function makeCarMesh(color, isPolice = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14181d });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2f42 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.72, 4.4), bodyMat);
  body.position.y = 0.66;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.6, 2.1), glassMat);
  cabin.position.set(0, 1.28, -0.25);
  cabin.castShadow = true;
  group.add(cabin);

  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.28, 0.3), darkMat);
  bumperF.position.set(0, 0.45, 2.2);
  group.add(bumperF);
  const bumperR = bumperF.clone();
  bumperR.position.z = -2.2;
  group.add(bumperR);

  // headlights / taillights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  for (const sx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), headMat);
    h.position.set(sx, 0.72, 2.22);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), tailMat);
    t.position.set(sx, 0.72, -2.22);
    group.add(t);
  }

  // wheels
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.32, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const steerWheels = [];
  for (const [wx, wz, front] of [[-0.98, 1.45, true], [0.98, 1.45, true], [-0.98, -1.45, false], [0.98, -1.45, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, WHEEL_R, wz);
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    pivot.add(wheel);
    group.add(pivot);
    wheels.push(wheel);
    if (front) steerWheels.push(pivot);
  }

  let lightBar = null;
  if (isPolice) {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    red.position.x = -0.35;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.x = 0.35;
    lightBar.add(red, blue);
    lightBar.position.set(0, 1.66, -0.25);
    group.add(lightBar);
    // white doors
    const doorMat = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.5, 1.9), doorMat);
    door.position.set(0, 0.72, 0.1);
    group.add(door);
  }

  return { group, wheels, steerWheels, lightBar };
}

function collideCircleAABB(x, z, r, box) {
  const cx = Math.max(box.minX, Math.min(x, box.maxX));
  const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
  const dx = x - cx, dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, nz: dz / d, depth: r - d };
  }
  // centre inside the box: push out along the smallest penetration axis
  const pl = x - box.minX, pr = box.maxX - x, pt = z - box.minZ, pb = box.maxZ - z;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) return { nx: -1, nz: 0, depth: pl + r };
  if (m === pr) return { nx: 1, nz: 0, depth: pr + r };
  if (m === pt) return { nx: 0, nz: -1, depth: pt + r };
  return { nx: 0, nz: 1, depth: pb + r };
}

// Arcade car: position + heading + speed, no full physics engine.
export class Car {
  constructor(color, isPolice = false) {
    const built = makeCarMesh(color, isPolice);
    this.mesh = built.group;
    this.mesh.userData.car = this; // raycast hits resolve back to this car
    this.wheels = built.wheels;
    this.steerWheels = built.steerWheels;
    this.lightBar = built.lightBar;
    this.isPolice = isPolice;
    this.x = 0; this.z = 0; this.heading = 0;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.maxSpeed = isPolice ? 40 : 38;
    this.crashed = false; // set true on a hard impact this frame
    this.drifting = false;
  }

  get pos() { return { x: this.x, z: this.z }; }

  place(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.syncMesh();
  }

  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    for (const w of this.steerWheels) w.rotation.y = this.steer;
    for (const w of this.wheels) w.rotation.x += this.speed * 0.016 / WHEEL_R;
  }

  // input: { throttle: -1..1, steer: -1..1, handbrake: bool }
  // world: { colliders, cars, dt }
  update(dt, input, world) {
    this.crashed = false;
    const speedAbs = Math.abs(this.speed);
    const dir = this.speed >= 0 ? 1 : -1;
    // steering: less at speed, more with handbrake
    const maxSteer = 0.55 - Math.min(0.37, speedAbs * 0.008);
    const targetSteer = (input.steer || 0) * maxSteer;
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    // throttle / brake / drag
    if (input.throttle > 0) {
      this.speed += 16 * input.throttle * dt;
    } else if (input.throttle < 0) {
      if (this.speed > 0.5) this.speed += 30 * input.throttle * dt; // brake
      else this.speed += 9 * input.throttle * dt; // reverse
    } else {
      this.speed -= this.speed * 0.9 * dt;
    }
    if (input.handbrake) {
      this.speed -= this.speed * 1.6 * dt;
      this.drifting = speedAbs > 8;
    } else {
      this.drifting = false;
    }
    if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    if (this.speed < -10) this.speed = -10;
    if (Math.abs(this.speed) < 0.05 && !input.throttle) this.speed = 0;

    // yaw: bicycle-ish, sharper while drifting
    const yawRate = this.steer * (this.speed / 2.8) * (this.drifting ? 1.7 : 1);
    this.heading += yawRate * dt;

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let nx = this.x + fx * this.speed * dt;
    let nz = this.z + fz * this.speed * dt;

    // world bounds (the bridge corridor lets cars cross the canal at x≈0)
    const inBridge = Math.abs(nx) < 6.5;
    nx = Math.max(-CITY.BOUND_X, Math.min(CITY.BOUND_X, nx));
    nz = Math.max(inBridge ? -232 : CITY.BOUND_Z_MIN, Math.min(CITY.BOUND_Z_MAX, nz));

    // building collisions
    const r = 1.7;
    for (const box of world.colliders) {
      if (nx < box.minX - r || nx > box.maxX + r || nz < box.minZ - r || nz > box.maxZ + r) continue;
      const hit = collideCircleAABB(nx, nz, r, box);
      if (hit) {
        nx += hit.nx * hit.depth;
        nz += hit.nz * hit.depth;
        if (Math.abs(this.speed) > 6) this.crashed = true;
        this.speed *= 0.55;
      }
    }
    // car-car collisions
    for (const other of world.cars) {
      if (other === this) continue;
      const dx = nx - other.x, dz = nz - other.z;
      const d2 = dx * dx + dz * dz;
      const minD = 3.4;
      if (d2 < minD * minD && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (minD - d) / 2;
        nx += (dx / d) * push;
        nz += (dz / d) * push;
        other.x -= (dx / d) * push;
        other.z -= (dz / d) * push;
        const rel = Math.abs(this.speed - other.speed);
        if (rel > 5) this.crashed = true;
        this.speed *= 0.8;
        other.speed *= 0.8;
      }
    }

    this.x = nx; this.z = nz;
    this.syncMesh();
    if (this.lightBar) {
      const on = Math.floor(performance.now() / 180) % 2 === 0;
      this.lightBar.children[0].material.color.setHex(on ? 0xff0000 : 0x550000);
      this.lightBar.children[1].material.color.setHex(on ? 0x112266 : 0x2244ff);
    }
  }
}
