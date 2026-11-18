// Solara Bay — the player: an on-foot character, driving, and the third-person
// camera that follows both.
import * as THREE from 'three';
import { CITY } from './config.js';

function box(w, h, d, color) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.castShadow = true;
  return m;
}

export function makePersonMesh(jacket = 0x2e86c1, pants = 0x2c3e50, skin = 0xc98d64) {
  const g = new THREE.Group();
  const torso = box(0.62, 0.72, 0.34, jacket);
  torso.position.y = 1.18;
  g.add(torso);
  const head = box(0.34, 0.36, 0.32, skin);
  head.position.y = 1.78;
  g.add(head);
  const hair = box(0.36, 0.12, 0.34, 0x1a1a1a);
  hair.position.y = 1.98;
  g.add(hair);
  const legL = box(0.24, 0.8, 0.26, pants);
  legL.position.set(-0.17, 0.42, 0);
  g.add(legL);
  const legR = box(0.24, 0.8, 0.26, pants);
  legR.position.set(0.17, 0.42, 0);
  g.add(legR);
  const armL = box(0.18, 0.66, 0.2, jacket);
  armL.position.set(-0.42, 1.2, 0);
  g.add(armL);
  const armR = box(0.18, 0.66, 0.2, jacket);
  armR.position.set(0.42, 1.2, 0);
  g.add(armR);
  return { group: g, legL, legR, armL, armR, torso, head };
}

export class Player {
  constructor(scene) {
    const built = makePersonMesh();
    this.parts = built;
    this.mesh = built.group;
    scene.add(this.mesh);
    this.x = 0; this.z = 30;
    this.heading = 0;
    this.health = 100;
    this.onFoot = true;
    this.car = null;
    this.walkPhase = 0;
    this.camYaw = 0; // orbit yaw around the player
    this.camPitch = 0.32;
    this.camDist = 5.5;
  }

  get speed() { return this.onFoot ? this._footSpeed || 0 : (this.car ? this.car.speed : 0); }

  place(x, z, heading = 0) {
    this.x = x; this.z = z; this.heading = heading;
    this.camYaw = heading + Math.PI; // camera sits behind the player
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
  }

  enterCar(car) {
    this.car = car;
    this.onFoot = false;
    this.mesh.visible = false;
  }

  exitCar() {
    if (!this.car) return;
    const fx = Math.sin(this.car.heading), fz = Math.cos(this.car.heading);
    this.x = this.car.x - fx * 2.6;
    this.z = this.car.z - fz * 2.6;
    this.heading = this.car.heading;
    this.camYaw = this.heading + Math.PI; // camera behind the player
    this.car = null;
    this.onFoot = true;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  // dt seconds, input, world { colliders, cars }, camera: THREE.Camera
  update(dt, input, world, camera) {
    // mouse orbit
    this.camYaw -= input.mouseDX * 0.0028;
    this.camPitch = Math.max(-0.15, Math.min(0.9, this.camPitch + input.mouseDY * 0.0022));

    if (!this.onFoot && this.car) {
      // driving: the player's position is the car's position (police, the
      // minimap and mission checks all read player.x / player.z)
      this.x = this.car.x;
      this.z = this.car.z;
      // camera chases behind the car, mouse adds an orbit offset
      const targetYaw = this.car.heading + Math.PI;
      let diff = targetYaw - this.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.camYaw += diff * Math.min(1, dt * (Math.abs(this.car.speed) > 2 ? 1.6 : 4));
      this.updateCamera(dt, camera, this.car.x, this.car.z, 8.5, 2.9);
      return;
    }

    // on foot
    const axis = input.moveAxis();
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? 8 : 4.5;
    let mx = 0, mz = 0;
    if (axis.x !== 0 || axis.z !== 0) {
      const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
      // camera-relative: W moves away from the camera
      mx = -sin * axis.z + cos * axis.x;
      mz = -cos * axis.z - sin * axis.x;
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      this.heading = Math.atan2(mx, mz);
      this.walkPhase += dt * (sprint ? 13 : 9);
    }
    this._footSpeed = (axis.x !== 0 || axis.z !== 0) ? speed : 0;
    let nx = this.x + mx * speed * dt;
    let nz = this.z + mz * speed * dt;

    // bounds (bridge corridor lets the player cross the canal at x≈0)
    const inBridge = Math.abs(nx) < 6.5;
    nx = Math.max(-CITY.BOUND_X, Math.min(CITY.BOUND_X, nx));
    nz = Math.max(inBridge ? -232 : CITY.BOUND_Z_MIN, Math.min(CITY.BOUND_Z_MAX, nz));

    // building collision (circle r=0.55)
    const r = 0.55;
    for (const b of world.colliders) {
      if (nx < b.minX - r || nx > b.maxX + r || nz < b.minZ - r || nz > b.maxZ + r) continue;
      const cx = Math.max(b.minX, Math.min(nx, b.maxX));
      const cz = Math.max(b.minZ, Math.min(nz, b.maxZ));
      const dx = nx - cx, dz = nz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * r;
        nz = cz + (dz / d) * r;
      }
    }
    // don't walk through cars
    for (const car of world.cars) {
      const dx = nx - car.x, dz = nz - car.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 2.2 * 2.2 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = car.x + (dx / d) * 2.2;
        nz = car.z + (dz / d) * 2.2;
      }
    }

    this.x = nx; this.z = nz;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // walk cycle
    const swing = (axis.x !== 0 || axis.z !== 0) ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.8;
    this.parts.armR.rotation.x = swing * 0.8;

    this.updateCamera(dt, camera, this.x, this.z, this.camDist, 2.4);
  }

  updateCamera(dt, camera, tx, tz, dist, height) {
    const cx = tx + Math.sin(this.camYaw) * dist;
    const cz = tz + Math.cos(this.camYaw) * dist;
    const cy = height + Math.sin(this.camPitch) * dist * 0.55;
    camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 10);
    camera.position.y += (cy - camera.position.y) * Math.min(1, dt * 10);
    camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 10);
    camera.lookAt(tx, 1.6, tz);
  }
}
