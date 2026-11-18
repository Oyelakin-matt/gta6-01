// Solara Bay — traffic: AI cars driving the road grid and pedestrians walking
// the sidewalks. Both flee/react when the player causes trouble.
import * as THREE from 'three';
import { ROADS, CITY, CAR_COLORS, rng, pick, range, rangeInt, chance } from './config.js';
import { Car } from './vehicles.js';
import { makePersonMesh } from './player.js';

const TRAFFIC_COUNT = 14;
const PED_COUNT = 22;

// right-hand offset from a road centreline for a given axis + direction
function laneOffset(axis, dir) {
  if (axis === 'x') return dir > 0 ? 3.5 : -3.5; // moving +x: right is +z
  return dir > 0 ? -3.5 : 3.5; // moving +z: right is -x
}
function axisHeading(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}
function nextRoad(coord, dir) {
  const sorted = ROADS;
  if (dir > 0) {
    for (const r of sorted) if (r > coord + 1) return r;
    return null;
  }
  for (let i = sorted.length - 1; i >= 0; i--) if (sorted[i] < coord - 1) return sorted[i];
  return null;
}
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

class TrafficCar {
  constructor(scene, colliders) {
    this.car = new Car(pick(CAR_COLORS));
    scene.add(this.car.mesh);
    this.colliders = colliders;
    this.cruise = range(8, 13);
    this.spawnFarFrom(0, 0);
  }

  spawnFarFrom(px, pz) {
    for (let tries = 0; tries < 20; tries++) {
      const axis = chance(0.5) ? 'x' : 'z';
      const line = pick(ROADS);
      const dir = chance(0.5) ? 1 : -1;
      const along = pick(ROADS) + range(-20, 20);
      const x = axis === 'x' ? along : line + laneOffset(axis, dir);
      const z = axis === 'x' ? line + laneOffset(axis, dir) : along;
      if (Math.hypot(x - px, z - pz) < 70) continue;
      const target = nextRoad(along, dir);
      if (target === null) continue;
      this.axis = axis; this.dir = dir; this.line = line; this.target = target;
      this.car.place(x, z, axisHeading(axis, dir));
      this.car.speed = this.cruise;
      return;
    }
  }

  alongPos() { return this.axis === 'x' ? this.car.x : this.car.z; }

  update(dt, playerX, playerZ, allCars) {
    // reached the next intersection?
    const pos = this.alongPos();
    if ((this.dir > 0 && pos >= this.target) || (this.dir < 0 && pos <= this.target)) {
      const ix = this.axis === 'x' ? this.target : this.line;
      const iz = this.axis === 'x' ? this.line : this.target;
      this.chooseTurn(ix, iz);
    }
    // desired heading along the lane
    const desired = axisHeading(this.axis, this.dir);
    const diff = wrapAngle(desired - this.car.heading);
    let steer = Math.max(-1, Math.min(1, diff * 2.2));
    // stop for a car ahead
    let throttle = 0.75;
    const fx = Math.sin(this.car.heading), fz = Math.cos(this.car.heading);
    for (const other of allCars) {
      if (other === this.car) continue;
      const dx = other.x - this.car.x, dz = other.z - this.car.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < 10 && side < 2.6) { throttle = 0; break; }
    }
    this.car.update(dt, { throttle, steer, handbrake: false }, { colliders: this.colliders, cars: allCars });
    // keep the car glued to its lane (physics drifts a little on turns)
    const off = laneOffset(this.axis, this.dir);
    if (this.axis === 'x') this.car.z += ((this.line + off) - this.car.z) * Math.min(1, dt * 1.2);
    else this.car.x += ((this.line + off) - this.car.x) * Math.min(1, dt * 1.2);
    // respawn far away if the player left it behind
    if (Math.hypot(this.car.x - playerX, this.car.z - playerZ) > 200) {
      this.spawnFarFrom(playerX, playerZ);
    }
  }

  chooseTurn(ix, iz) {
    // options: straight, left, right (never a U-turn); at the edge, only turns
    const straightTarget = nextRoad(this.axis === 'x' ? ix : iz, this.dir);
    const moves = [];
    if (straightTarget !== null) moves.push({ kind: 'straight', target: straightTarget });
    // turning onto the crossing road
    const cross = this.axis === 'x' ? 'z' : 'x';
    const crossLine = this.axis === 'x' ? ix : iz;
    const crossPos = this.axis === 'x' ? iz : ix;
    for (const turnDir of [1, -1]) {
      const t = nextRoad(crossPos, turnDir);
      if (t !== null) moves.push({ kind: 'turn', axis: cross, dir: turnDir, line: crossLine, target: t });
    }
    const m = pick(moves);
    if (m.kind === 'straight') {
      this.target = m.target;
    } else {
      this.axis = m.axis; this.dir = m.dir; this.line = m.line; this.target = m.target;
    }
  }
}

const PED_COLORS = [
  [0xe74c3c, 0x2c3e50], [0x3498db, 0x34495e], [0x2ecc71, 0x7f8c8d],
  [0xf39c12, 0x2c3e50], [0x9b59b6, 0x34495e], [0x1abc9c, 0x2c3e50],
  [0xe67e22, 0x7f8c8d], [0xecf0f1, 0x2c3e50],
];

class Ped {
  constructor(scene) {
    const [jacket, pants] = pick(PED_COLORS);
    const built = makePersonMesh(jacket, pants, pick([0xc98d64, 0x8a5a3b, 0xe8b98a, 0x5a3a22]));
    this.parts = built;
    this.mesh = built.group;
    this.mesh.userData.ped = this;
    scene.add(this.mesh);
    this.state = 'walk'; // walk | flee | down
    this.timer = 0;
    this.speed = range(1.1, 1.8);
    this.axis = chance(0.5) ? 'x' : 'z';
    this.dir = chance(0.5) ? 1 : -1;
    this.line = pick(ROADS);
    this.side = chance(0.5) ? 10 : -10; // sidewalk side of the road
    this.along = pick(ROADS) + range(-20, 20);
    this.target = nextRoad(this.along, this.dir) ?? this.along;
    this.x = this.axis === 'x' ? this.along : this.line + this.side;
    this.z = this.axis === 'x' ? this.line + this.side : this.along;
    this.heading = axisHeading(this.axis, this.dir);
    this.mesh.position.set(this.x, 0, this.z);
    this.walkPhase = range(0, 6);
  }

  fall() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.timer = 5;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.3;
  }

  fleeFrom(tx, tz) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.timer = 3;
    this.fleeX = tx; this.fleeZ = tz;
  }

  update(dt, threats) {
    // threats: [{x, z, radius}] — cars moving fast, gunshots
    if (this.state === 'down') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'walk';
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
        this.fleeFrom(this.x + range(-10, 10), this.z + range(-10, 10));
      }
      return;
    }
    if (this.state === 'walk') {
      for (const t of threats) {
        if (Math.hypot(this.x - t.x, this.z - t.z) < t.radius) {
          this.fleeFrom(t.x, t.z);
          break;
        }
      }
    }
    if (this.state === 'flee') {
      this.timer -= dt;
      const dx = this.x - this.fleeX, dz = this.z - this.fleeZ;
      const d = Math.hypot(dx, dz) || 1;
      this.heading = Math.atan2(dx / d, dz / d);
      this.x += (dx / d) * 4.2 * dt;
      this.z += (dz / d) * 4.2 * dt;
      this.x = Math.max(-CITY.BOUND_X, Math.min(CITY.BOUND_X, this.x));
      this.z = Math.max(CITY.BOUND_Z_MIN, Math.min(CITY.BOUND_Z_MAX, this.z));
      this.walkPhase += dt * 13;
      if (this.timer <= 0) {
        this.state = 'walk';
        // rejoin the nearest road as a walker
        this.axis = Math.abs(dx) > Math.abs(dz) ? 'z' : 'x';
        this.dir = chance(0.5) ? 1 : -1;
        this.line = ROADS.reduce((a, b) => Math.abs(b - (this.axis === 'x' ? this.z : this.x)) < Math.abs(a - (this.axis === 'x' ? this.z : this.x)) ? b : a);
        this.side = 10;
        this.along = this.axis === 'x' ? this.x : this.z;
        this.target = nextRoad(this.along, this.dir) ?? this.along;
      }
    } else {
      // walk along the sidewalk
      const pos = this.axis === 'x' ? this.x : this.z;
      if ((this.dir > 0 && pos >= this.target) || (this.dir < 0 && pos <= this.target)) {
        // at an intersection: keep going or turn
        if (chance(0.4)) {
          const cross = this.axis === 'x' ? 'z' : 'x';
          const crossPos = this.axis === 'x' ? this.z : this.x;
          const nd = chance(0.5) ? 1 : -1;
          const t = nextRoad(crossPos, nd);
          if (t !== null) {
            this.axis = cross; this.dir = nd;
            this.line = this.axis === 'x' ? this.z : this.x;
            this.along = crossPos;
            this.target = t;
          }
        } else {
          const t = nextRoad(this.target, this.dir);
          if (t !== null) this.target = t;
          else { this.dir *= -1; this.target = nextRoad(this.along, this.dir) ?? this.along; }
        }
      }
      this.heading = axisHeading(this.axis, this.dir);
      const step = this.speed * dt;
      if (this.axis === 'x') this.x += step * this.dir;
      else this.z += step * this.dir;
      this.walkPhase += dt * 9;
    }
    // sync mesh
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const swing = Math.sin(this.walkPhase) * 0.5;
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.8;
    this.parts.armR.rotation.x = swing * 0.8;
  }
}

export class TrafficManager {
  constructor(scene, colliders, parkedSpots) {
    this.scene = scene;
    this.colliders = colliders;
    this.cars = [];
    this.peds = [];
    this.parked = [];
    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      this.cars.push(new TrafficCar(scene, colliders));
    }
    for (const spot of parkedSpots) {
      const car = new Car(spot.color);
      car.place(spot.x, spot.z, spot.heading);
      car.mesh.userData.car = car;
      scene.add(car.mesh);
      this.parked.push(car);
    }
    for (let i = 0; i < PED_COUNT; i++) this.peds.push(new Ped(scene));
  }

  allCars() {
    return [...this.cars.map((t) => t.car), ...this.parked];
  }

  // nearest drivable car (traffic or parked) to a point — for the E key
  nearestCar(x, z, maxDist = 5) {
    let best = null, bestD = maxDist;
    for (const car of this.allCars()) {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) { best = car; bestD = d; }
    }
    return best;
  }

  update(dt, player, policeCars) {
    const allCars = [...this.allCars(), ...policeCars, ...(player.car ? [player.car] : [])];
    for (const t of this.cars) t.update(dt, player.x, player.z, allCars);
    const threats = [];
    if (player.car && Math.abs(player.car.speed) > 6) {
      threats.push({ x: player.car.x, z: player.car.z, radius: 8 });
    }
    if (!player.onFoot && player.car) {
      // peds also dodge the player's car at any speed when close
      threats.push({ x: player.car.x, z: player.car.z, radius: 4 });
    }
    for (const p of this.peds) p.update(dt, threats);
    // peds hit by cars fall
    for (const p of this.peds) {
      if (p.state === 'down') continue;
      for (const car of allCars) {
        if (Math.abs(car.speed) < 2) continue;
        if (Math.hypot(p.x - car.x, p.z - car.z) < 2.3) {
          p.fall();
          if (car === player.car) this.onPedHit?.();
          break;
        }
      }
    }
  }
}
