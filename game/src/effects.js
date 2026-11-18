// Solara Bay — juice: particle bursts, tracers, muzzle flash and camera shake.
// Small pools, no allocations in the hot loop.
import * as THREE from 'three';
import { makeGlowTexture } from './textures.js';

const POOL = 48;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    const geo = new THREE.TetrahedronGeometry(0.14);
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      this.particles.push({ mesh: m, vel: new THREE.Vector3(), life: 0, maxLife: 1 });
    }
    this.flashLight = new THREE.PointLight(0xffc266, 0, 14);
    scene.add(this.flashLight);
    this.shake = 0;
    // tracer lines (two, ping-ponged)
    this.tracers = [];
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    for (let i = 0; i < 2; i++) {
      const line = new THREE.Line(tGeo.clone(), new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerIndex = 0;
  }

  burst(pos, color, n = 10, speed = 6) {
    let placed = 0;
    for (const p of this.particles) {
      if (placed >= n) break;
      if (p.life > 0) continue;
      p.life = p.maxLife = 0.35 + Math.random() * 0.25;
      p.mesh.visible = true;
      p.mesh.position.copy(pos);
      p.mesh.material.color.setHex(color);
      p.mesh.material.opacity = 1;
      p.vel.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.8 + 1, (Math.random() - 0.5) * speed);
      placed++;
    }
  }

  tracer(from, to) {
    const t = this.tracers[this.tracerIndex++ % this.tracers.length];
    const attr = t.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    t.line.material.opacity = 0.9;
    t.life = 0.07;
  }

  flash(pos) {
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 60;
  }

  addShake(amount) {
    this.shake = Math.min(0.6, this.shake + amount);
  }

  update(dt) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.material.opacity = p.life / p.maxLife;
      p.mesh.rotation.x += dt * 9;
      p.mesh.rotation.y += dt * 7;
    }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 900);
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      }
    }
    this.shake = Math.max(0, this.shake - dt * 1.4);
  }

  // offset to add to the camera each frame
  shakeOffset() {
    if (this.shake <= 0.001) return null;
    const s = this.shake;
    return {
      x: (Math.random() - 0.5) * s * 0.5,
      y: (Math.random() - 0.5) * s * 0.5,
    };
  }
}
