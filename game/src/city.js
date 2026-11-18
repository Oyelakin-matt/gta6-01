// Solara Bay — the city itself: ground map, ocean, canal + bridge, buildings,
// palms, streetlights and clouds. Everything is procedural and seeded.
import * as THREE from 'three';
import { CITY, ROADS, BLOCKS, PALETTE, rng, range, rangeInt, chance, pick } from './config.js';
import { makeFacadeTexture, makeGroundTexture, makeOceanTexture } from './textures.js';

// Decide what each block holds. Fixed order, seeded RNG: same city every load.
export function planCity() {
  const type = new Map();
  for (const cz of BLOCKS) {
    for (const cx of BLOCKS) {
      let t = 'build';
      if (cz === 175) t = chance(0.6) ? 'park' : 'build'; // beachfront row stays low
      else if (chance(0.14)) t = 'park';
      else if (chance(0.13)) t = 'lot';
      type.set(`${cx},${cz}`, t);
    }
  }
  return { type };
}

const FACADE_COLORS = ['#b08d6a', '#8a9aa8', '#a87f6d', '#7d8b7a', '#9a8ba8', '#c0a080', '#6f7f8f'];

export function buildCity(scene) {
  const plan = planCity();
  const colliders = [];
  const buildings = [];
  const parkedSpots = [];
  const clouds = [];

  // --- ground ---
  const groundTex = makeGroundTexture(plan);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 436),
    new THREE.MeshLambertMaterial({ map: groundTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 4);
  ground.receiveShadow = true;
  scene.add(ground);

  // --- ocean (south) + canal (north) ---
  const oceanTex = makeOceanTexture();
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 420),
    new THREE.MeshLambertMaterial({ map: oceanTex, transparent: true, opacity: 0.92 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.06, 424);
  scene.add(ocean);

  const canalTex = makeOceanTexture();
  canalTex.repeat.set(16, 1);
  const canal = new THREE.Mesh(
    new THREE.PlaneGeometry(480, 26),
    new THREE.MeshLambertMaterial({ map: canalTex, color: 0x9fc8e8, transparent: true, opacity: 0.95 }),
  );
  canal.rotation.x = -Math.PI / 2;
  canal.position.set(0, -0.5, -227);
  scene.add(canal);

  // --- bridge over the canal on the x=0 road ---
  const bridgeMat = new THREE.MeshLambertMaterial({ color: 0x8a7f70 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(16, 0.9, 26), bridgeMat);
  deck.position.set(0, 0.1, -224);
  deck.receiveShadow = true;
  scene.add(deck);
  const railMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
  for (const sx of [-7.6, 7.6]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 26), railMat);
    rail.position.set(sx, 1, -224);
    scene.add(rail);
  }

  // --- lights ---
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7f6a, 0.95));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35)); // lifts shadowed facades
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -110; sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -110;
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // --- buildings ---
  const facades = FACADE_COLORS.map((col, i) => makeFacadeTexture(col, 1000 + i * 77));
  const roofMat = new THREE.MeshLambertMaterial({ color: PALETTE.buildingRoof });
  const roofDetailMat = new THREE.MeshLambertMaterial({ color: 0x5a5a66 });
  for (const cz of BLOCKS) {
    for (const cx of BLOCKS) {
      const t = plan.type.get(`${cx},${cz}`);
      if (t === 'park') continue;
      if (t === 'lot') {
        // a few parked cars
        const n = rangeInt(2, 4);
        for (let i = 0; i < n; i++) {
          parkedSpots.push({
            x: cx - 12 + i * 9 + range(-2, 2),
            z: cz + (chance(0.5) ? -9 : 9),
            heading: chance(0.5) ? 0 : Math.PI,
            color: pick([0xc0392b, 0x2980b9, 0xf1c40f, 0xecf0f1, 0x2c3e50, 0x16a085]),
          });
        }
        continue;
      }
      const dist = Math.max(Math.abs(cx), Math.abs(cz)) / 175; // 0 centre, 1 edge
      const tall = chance(0.62);
      const spots = tall
        ? [{ dx: 0, dz: 0, w: 24, d: 24, h: 18 + (1 - dist) * 46 + range(0, 14) }]
        : [
            { dx: -8, dz: 0, w: 14, d: 22, h: 9 + range(0, 12) },
            { dx: 9, dz: -2, w: 12, d: 18, h: 8 + range(0, 10) },
          ];
      for (const s of spots) {
        const bx = cx + s.dx, bz = cz + s.dz;
        const facade = new THREE.MeshLambertMaterial({ map: pick(facades) });
        const mats = [facade, facade, roofMat, roofMat, facade, facade];
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), mats);
        mesh.position.set(bx, s.h / 2, bz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        buildings.push(mesh);
        // rooftop box (AC unit / water tank)
        if (s.h > 20 && chance(0.7)) {
          const roof = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 4), roofDetailMat);
          roof.position.set(bx + range(-5, 5), s.h + 1.1, bz + range(-5, 5));
          scene.add(roof);
        }
        colliders.push({
          minX: bx - s.w / 2, maxX: bx + s.w / 2,
          minZ: bz - s.d / 2, maxZ: bz + s.d / 2,
        });
      }
    }
  }

  // --- palms (instanced: trunks + crowns) ---
  const palmSpots = [];
  for (let x = -200; x <= 200; x += 18) palmSpots.push({ x: x + range(-3, 3), z: 206 + range(-2, 2) });
  for (const cz of BLOCKS) {
    for (const cx of BLOCKS) {
      if (plan.type.get(`${cx},${cz}`) === 'park') {
        for (let i = 0; i < 5; i++) palmSpots.push({ x: cx + range(-15, 15), z: cz + range(-15, 15) });
      }
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crownGeo = new THREE.IcosahedronGeometry(2.4, 0);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  palmSpots.forEach((p, i) => {
    const tilt = range(-0.08, 0.08);
    e.set(tilt, range(0, Math.PI * 2), tilt);
    q.setFromEuler(e);
    m.compose(v.set(p.x, 3, p.z), q, s.set(1, 1, 1));
    trunks.setMatrixAt(i, m);
    m.compose(v.set(p.x, 6.4, p.z), q, s.set(1, 0.42, 1));
    crowns.setMatrixAt(i, m);
  });
  trunks.castShadow = true;
  scene.add(trunks);
  scene.add(crowns);

  // --- streetlights (instanced) ---
  const lightSpots = [];
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      if (chance(0.5)) lightSpots.push({ x: rx + 8, z: rz + 8 });
      else lightSpots.push({ x: rx - 8, z: rz - 8 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.5, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lightSpots.length);
  const lampGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lightSpots.length);
  lightSpots.forEach((p, i) => {
    m.compose(v.set(p.x, 3.25, p.z), q.identity(), s.set(1, 1, 1));
    poles.setMatrixAt(i, m);
    m.compose(v.set(p.x, 6.6, p.z), q.identity(), s.set(1, 1, 1));
    lamps.setMatrixAt(i, m);
  });
  scene.add(poles);
  scene.add(lamps);

  // --- clouds ---
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group();
    const puffs = rangeInt(2, 4);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(range(6, 12), 8, 6), cloudMat);
      puff.position.set(j * 10 - puffs * 5, range(-1, 1), range(-3, 3));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(range(-260, 260), range(95, 135), range(-260, 260));
    scene.add(cloud);
    clouds.push(cloud);
  }

  return { colliders, buildings, parkedSpots, ocean, canal, clouds, sun };
}
