// Solara Bay — the story: four missions from fixer Mara Voss, handed out by
// phone call, tracked by a 3D waypoint beacon and the minimap. Finish one and
// the next rings in; finish all four and the city is yours to roam.
import * as THREE from 'three';
import { MISSION_PAY } from './config.js';

const GARAGE = { x: 150, z: -150 };
const DOCKS = { x: -150, z: 190 };
const HIDEOUT = { x: -150, z: -150 };
const SPOTLIGHT = { x: 175, z: 25 };

export const MISSIONS = [
  {
    title: 'Wheels Up',
    contact: 'Mara Voss',
    intro: 'Leo, welcome to Solara Bay. You need wheels before anything else. Borrow a car — any car — and bring it to my garage on the east side.',
    steps: [
      { type: 'stealCar', label: 'Get in a car' },
      { type: 'goto', x: GARAGE.x, z: GARAGE.z, radius: 8, label: 'Drive to Mara\'s garage' },
    ],
  },
  {
    title: 'The Package',
    contact: 'Mara Voss',
    intro: 'A crate came in at the docks and it has your name on it. Pick it up on foot, then bring it to the hideout up north. The harbour cops are jumpy — expect heat.',
    steps: [
      { type: 'goto', x: DOCKS.x, z: DOCKS.z, radius: 6, label: 'Go to the docks' },
      { type: 'pickup', x: DOCKS.x, z: DOCKS.z, label: 'Pick up the package' },
      { type: 'goto', x: HIDEOUT.x, z: HIDEOUT.z, radius: 8, label: 'Deliver the package to the hideout' },
    ],
    onPickup: 'wanted2',
  },
  {
    title: 'Heat Wave',
    contact: 'Tito',
    intro: 'Leo, it\'s Tito. The Bay PD put your face on every screen in the city. Three stars, brother. Survive the next minute, then slip to the hideout when it cools off.',
    steps: [
      { type: 'survive', seconds: 60, label: 'Survive the chase — stay alive' },
      { type: 'goto', x: HIDEOUT.x, z: HIDEOUT.z, radius: 8, label: 'Reach the hideout' },
    ],
    onStart: 'wanted3',
  },
  {
    title: 'The Long Way Home',
    contact: 'Mara Voss',
    intro: 'Last job, Leo. Get to the spotlight tower on the east side, then run for the docks — 100 seconds, the whole city behind you. Do not get caught.',
    steps: [
      { type: 'goto', x: SPOTLIGHT.x, z: SPOTLIGHT.z, radius: 6, label: 'Reach the spotlight tower' },
      { type: 'timedGoto', x: DOCKS.x, z: DOCKS.z, radius: 8, seconds: 100, label: 'Getaway to the docks — beat the clock' },
    ],
    onStart: 'wanted3',
  },
];

export class Missions {
  constructor(scene, ui, police) {
    this.scene = scene;
    this.ui = ui;
    this.police = police;
    this.index = 0; // next mission to offer
    this.step = 0;
    this.state = 'idle'; // idle | ringing | active | done
    this.timer = 0;
    this.ringTimer = 0;
    this.freeRoam = false;
    // waypoint beacon: light pillar + floating marker
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd23f, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 46, 16, 1, true), mat);
    this.beacon.visible = false;
    scene.add(this.beacon);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }),
    );
    this.marker = diamond;
    diamond.visible = false;
    scene.add(diamond);
  }

  get current() { return MISSIONS[this.index] || null; }
  get active() { return this.state === 'active'; }

  offerNext() {
    if (this.index >= MISSIONS.length) {
      this.freeRoam = true;
      this.state = 'done';
      this.ui.toast('Story complete — Solara Bay is yours. Free roam.');
      this.hideBeacon();
      return;
    }
    this.state = 'ringing';
    this.ringTimer = 0;
    const m = this.current;
    this.ui.showPhone(m.contact, `${m.title} — ${m.intro}`, 'Press E to answer');
  }

  accept() {
    if (this.state !== 'ringing') return;
    const m = this.current;
    this.state = 'active';
    this.step = 0;
    this.timer = 0;
    this.ui.hidePhone();
    this.ui.toast(`Mission started: ${m.title}`);
    if (m.onStart === 'wanted3') this.police.setWanted(3);
    this.placeBeacon();
  }

  placeBeacon() {
    const step = this.currentStep();
    if (!step || step.type === 'stealCar' || step.type === 'survive') {
      this.hideBeacon();
      return;
    }
    if (step.x === undefined) { this.hideBeacon(); return; }
    this.beacon.position.set(step.x, 23, step.z);
    this.marker.position.set(step.x, 9, step.z);
    this.beacon.visible = true;
    this.marker.visible = true;
  }

  hideBeacon() {
    this.beacon.visible = false;
    this.marker.visible = false;
  }

  currentStep() {
    const m = this.current;
    if (!m) return null;
    return m.steps[this.step] || null;
  }

  // where the HUD + minimap should point right now (or null)
  objectivePoint() {
    const step = this.currentStep();
    if (!step || step.x === undefined) return null;
    return { x: step.x, z: step.z, label: step.label };
  }

  advanceStep() {
    this.step += 1;
    const m = this.current;
    if (this.step >= m.steps.length) {
      this.completeMission();
      return;
    }
    this.timer = 0;
    this.placeBeacon();
  }

  completeMission() {
    const m = this.current;
    const pay = MISSION_PAY[this.index];
    this.index += 1;
    this.state = 'idle';
    this.hideBeacon();
    this.ui.onMissionComplete?.(m.title, pay);
    this.ringTimer = -3; // next call rings in 3 seconds
  }

  failMission(reason) {
    this.ui.toast(`${reason} — mission failed, try again.`);
    this.state = 'idle';
    this.hideBeacon();
    this.police.setWanted(Math.min(this.police.wanted, 1));
    this.ringTimer = -4;
  }

  // called when the player enters a car (for the stealCar step)
  onEnterCar() {
    const step = this.currentStep();
    if (this.state === 'active' && step && step.type === 'stealCar') this.advanceStep();
  }

  update(dt, player) {
    if (this.state === 'ringing') {
      this.ringTimer += dt;
      return;
    }
    if (this.state === 'idle' && this.ringTimer < 0) {
      this.ringTimer += dt;
      if (this.ringTimer >= 0) this.offerNext();
      return;
    }
    if (this.state !== 'active') return;
    const step = this.currentStep();
    if (!step) return;
    const px = player.x, pz = player.z;
    if (step.type === 'stealCar') {
      if (!player.onFoot) this.advanceStep();
    } else if (step.type === 'goto' || step.type === 'pickup') {
      const d = Math.hypot(px - step.x, pz - step.z);
      if (d <= (step.type === 'pickup' ? 3.5 : step.radius)) {
        if (step.type === 'pickup' && this.current.onPickup === 'wanted2') {
          this.police.setWanted(2);
          this.ui.toast('Package grabbed — the harbour police are on you!');
        }
        this.advanceStep();
      }
    } else if (step.type === 'survive') {
      this.timer += dt;
      if (this.timer >= step.seconds) this.advanceStep();
    } else if (step.type === 'timedGoto') {
      this.timer += dt;
      const d = Math.hypot(px - step.x, pz - step.z);
      if (d < step.radius) {
        this.police.setWanted(0);
        this.advanceStep();
      } else if (this.timer >= step.seconds) {
        this.failMission('Out of time');
      }
    }
    // beacon bob
    if (this.marker.visible) {
      this.marker.rotation.y += dt * 2;
      this.marker.position.y = 9 + Math.sin(performance.now() * 0.003) * 0.8;
    }
  }

  // for the HUD: objective text + time left for timed steps
  objectiveText() {
    if (this.state === 'ringing') return 'Incoming call — press E to answer';
    if (this.state !== 'active') return this.freeRoam ? 'Free roam — Solara Bay is yours' : '';
    const step = this.currentStep();
    if (!step) return '';
    let text = `${this.current.title}: ${step.label}`;
    if (step.type === 'survive') text += ` — ${Math.max(0, Math.ceil(step.seconds - this.timer))}s`;
    if (step.type === 'timedGoto') text += ` — ${Math.max(0, Math.ceil(step.seconds - this.timer))}s left`;
    return text;
  }
}
