// Solara Bay — the wanted system and the police who respond to it.
// Stars 0–5; police cars spawn, chase and ram; get busted on foot at close
// range, or lose them by staying out of sight until the heat dies down.
import { ROADS, rng, pick, range } from './config.js';
import { Car } from './vehicles.js';

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class PoliceManager {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.wanted = 0;
    this.cars = [];
    this.clearTimer = 0; // time since any police car was near the player
    this.decayTimer = 0;
    this.bustProgress = 0;
    this.onBusted = null;
    this.onWantedChange = null;
  }

  setWanted(n) {
    const v = Math.max(0, Math.min(5, n));
    if (v !== this.wanted) {
      this.wanted = v;
      this.clearTimer = 0;
      this.decayTimer = 0;
      this.onWantedChange?.(v);
    }
  }

  addWanted(n) { this.setWanted(this.wanted + n); }

  desiredCount() {
    if (this.wanted === 0) return 0;
    return Math.min(this.wanted + 1, 5);
  }

  spawnCar(px, pz) {
    const car = new Car(0x111418, true);
    // pick a road point 70–110m from the player
    for (let tries = 0; tries < 25; tries++) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const line = pick(ROADS);
      const along = pick(ROADS) + range(-25, 25);
      const x = axis === 'x' ? along : line;
      const z = axis === 'x' ? line : along;
      const d = Math.hypot(x - px, z - pz);
      if (d > 70 && d < 120) {
        car.place(x, z, Math.atan2(px - x, pz - z));
        car.speed = 10;
        this.scene.add(car.mesh);
        this.cars.push(car);
        return;
      }
    }
    // fallback: behind the player
    car.place(px - 80, pz, 0);
    this.scene.add(car.mesh);
    this.cars.push(car);
  }

  removeCar(car) {
    this.scene.remove(car.mesh);
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  update(dt, player, allCars) {
    // keep the fleet at the desired size
    const want = this.desiredCount();
    while (this.cars.length < want) this.spawnCar(player.x, player.z);
    while (this.cars.length > want) this.removeCar(this.cars[this.cars.length - 1]);

    let nearest = Infinity;
    for (const car of [...this.cars]) {
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      nearest = Math.min(nearest, d);
      if (d > 240) { this.removeCar(car); continue; }
      // chase steering: aim at the player
      const desired = Math.atan2(player.x - car.x, player.z - car.z);
      const diff = wrapAngle(desired - car.heading);
      const steer = Math.max(-1, Math.min(1, diff * 2.5));
      car.update(dt, { throttle: 1, steer, handbrake: false }, { colliders: this.colliders, cars: allCars });
      // stuck against a building? teleport back into the chase
      if (Math.abs(car.speed) < 1) {
        car._stuck = (car._stuck || 0) + dt;
        if (car._stuck > 4) {
          this.removeCar(car);
          this.spawnCar(player.x, player.z);
        }
      } else {
        car._stuck = 0;
      }
      // ramming the player on foot hurts (chunk damage, throttled)
      if (player.onFoot && d < 2.4 && Math.abs(car.speed) > 3) {
        car._ramCooldown = (car._ramCooldown || 0) - dt;
        if (car._ramCooldown <= 0) {
          car._ramCooldown = 0.8;
          player.health -= 12;
          car.speed *= 0.5;
        }
      } else {
        car._ramCooldown = 0;
      }
    }

    // busted: a cop sits on top of you while you're on foot
    if (this.wanted >= 1 && player.onFoot && nearest < 4.5) {
      this.bustProgress += dt;
      if (this.bustProgress > 2.5) {
        this.bustProgress = 0;
        this.onBusted?.();
      }
    } else {
      this.bustProgress = Math.max(0, this.bustProgress - dt * 2);
    }

    // wanted decay: no police near for a while, heat drops a star
    if (this.wanted > 0) {
      if (nearest > 45) {
        this.clearTimer += dt;
        if (this.clearTimer > 8) {
          this.decayTimer += dt;
          if (this.decayTimer > 4) {
            this.decayTimer = 0;
            this.setWanted(this.wanted - 1);
          }
        }
      } else {
        this.clearTimer = 0;
        this.decayTimer = 0;
      }
    }
  }
}
