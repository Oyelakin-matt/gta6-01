// Solara Bay — combat: the pistol. Raycast from the camera, tracers, muzzle
// flash, ammo and reload. No hitscan magic: what the crosshair covers is hit.
import * as THREE from 'three';

export class Combat {
  constructor(scene, camera, effects) {
    this.scene = scene;
    this.camera = camera;
    this.effects = effects;
    this.ammo = 12;
    this.magSize = 12;
    this.reloading = false;
    this.reloadTimer = 0;
    this.cooldown = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 120;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.ammo = this.magSize;
      }
    }
  }

  reload() {
    if (this.reloading || this.ammo === this.magSize) return false;
    this.reloading = true;
    this.reloadTimer = 1.4;
    return true;
  }

  // returns: 'ped' | 'car' | 'police' | 'world' | 'empty' | null (no shot fired)
  shoot(targets) {
    if (this.cooldown > 0 || this.reloading || this.ammo <= 0) return null;
    this.cooldown = 0.18;
    this.ammo -= 1;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = this.raycaster.intersectObjects(targets, true);
    const muzzle = new THREE.Vector3();
    this.camera.getWorldPosition(muzzle);
    muzzle.add(new THREE.Vector3(0, -0.3, 0));
    this.effects.flash(muzzle);
    if (hits.length === 0) {
      this.effects.tracer(muzzle, muzzle.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(80)));
      return 'empty';
    }
    const hit = hits[0];
    const point = hit.point.clone();
    this.effects.tracer(muzzle, point);
    this.effects.burst(point, 0xffcc66, 8);
    // walk up to find what was hit
    let obj = hit.object;
    while (obj) {
      if (obj.userData.ped) {
        obj.userData.ped.fall();
        return 'ped';
      }
      if (obj.userData.car) {
        const car = obj.userData.car;
        car.health -= 30;
        if (car.health <= 0) car.maxSpeed = 0;
        return car.isPolice ? 'police' : 'car';
      }
      obj = obj.parent;
    }
    return 'world';
  }
}
