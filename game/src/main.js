// Solara Bay — the game itself: bootstrap, the loop, the state machine
// (menu / playing / paused / busted / wasted), shot modes for screenshots,
// and the wiring between every system.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { buildCity } from './city.js';
import { Player } from './player.js';
import { Car } from './vehicles.js';
import { TrafficManager } from './traffic.js';
import { PoliceManager } from './police.js';
import { Missions } from './missions.js';
import { Combat } from './combat.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { AudioManager } from './audio.js';
import { Input } from './input.js';
import { saveGame, loadGame, clearSave } from './save.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || null;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 200, 700);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1500);
    this.camera.position.set(0, 60, 150);

    this.input = new Input(this.canvas);
    this.hud = new HUD();
    this.audio = new AudioManager();
    this.effects = new Effects(this.scene);

    const city = buildCity(this.scene);
    this.colliders = city.colliders;
    this.buildings = city.buildings;
    this.ocean = city.ocean;
    this.canal = city.canal;
    this.clouds = city.clouds;
    this.sun = city.sun;

    this.player = new Player(this.scene);
    this.traffic = new TrafficManager(this.scene, this.colliders, city.parkedSpots);
    this.police = new PoliceManager(this.scene, this.colliders);
    this.missions = new Missions(this.scene, this.hud, this.police);
    this.combat = new Combat(this.scene, this.camera, this.effects);

    this.state = 'menu';
    this.cash = 250;
    this.saveTimer = 0;
    this.menuAngle = 0;
    this.wasMouseDown = false;
    this.healthRegenTimer = 0;

    this.police.onBusted = () => this.busted();
    this.police.onWantedChange = (n) => this.hud.setWanted(n);
    this.traffic.onPedHit = () => {
      this.police.addWanted(1);
      this.hud.toast('You hit a pedestrian! The police are on you.');
    };
    this.hud.onMissionComplete = (title, pay) => {
      this.cash += pay;
      this.hud.setCash(this.cash);
      this.hud.toast(`Mission complete: ${title} — +$${pay}`);
      this.audio.chime();
      this.save();
    };

    this.trafficCars = [];
    this.bindUI();
    this.applyShotOrSave();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'playing' && !SHOT) this.pause();
    });
    this.clock = new THREE.Clock();
    this.frames = 0; // frames rendered (test harness waits on this)
    this.gameTime = 0; // accumulated in-game seconds
    this.renderer.setAnimationLoop(() => this.frame());
  }

  bindUI() {
    const $ = (id) => document.getElementById(id);
    $('btn-play').addEventListener('click', () => this.startGame(false));
    $('btn-continue').addEventListener('click', () => this.startGame(true));
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-restart').addEventListener('click', () => this.restart());
    $('btn-quit').addEventListener('click', () => this.quitToMenu());
    $('btn-respawn').addEventListener('click', () => this.respawn());
    $('phone').addEventListener('click', () => this.missions.accept());
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && this.player.onFoot && !SHOT) this.input.lockPointer();
    });
  }

  applyShotOrSave() {
    const saved = loadGame();
    const btnContinue = document.getElementById('btn-continue');
    if (saved) {
      btnContinue.style.display = 'inline-block';
      this.savedState = saved;
    }
    if (SHOT) {
      document.getElementById('menu').style.display = 'none';
      this.state = 'playing';
      this.setupShot(SHOT);
      return;
    }
    this.player.place(0, 30, 0);
  }

  setupShot(shot) {
    this.audio.init();
    this.player.health = 100;
    this.cash = 2500;
    this.hud.setCash(this.cash);
    if (shot === 'chase') {
      const car = new Car(0xc0392b);
      car.place(0, 20, 0);
      this.scene.add(car.mesh);
      this.player.enterCar(car);
      this.playerCar = car;
      car.speed = 24;
      this.police.setWanted(3);
      for (const [x, z] of [[-6, 6], [8, -6], [-2, -22]]) {
        const pc = new Car(0x111418, true);
        pc.place(x, z, 0);
        pc.speed = 26;
        this.scene.add(pc.mesh);
        this.police.cars.push(pc);
      }
      this.missions.index = 2;
      this.missions.state = 'active';
      this.missions.step = 0;
      this.missions.timer = 32;
    } else if (shot === 'drive') {
      const car = new Car(0x2980b9);
      car.place(-150, 50, Math.PI / 2);
      this.scene.add(car.mesh);
      this.player.enterCar(car);
      this.playerCar = car;
      car.speed = 24;
      this.missions.index = 0;
      this.missions.state = 'active';
      this.missions.step = 1;
      this.missions.placeBeacon();
    } else if (shot === 'onfoot') {
      // face the beach and ocean so the shot shows the coast, not the city
      this.player.place(60, 196, 0);
      this.player.camYaw = Math.PI;
      this.missions.index = 0;
      this.missions.state = 'active';
      this.missions.step = 0;
      const car = new Car(0xf1c40f);
      car.place(52, 188, Math.PI / 2);
      this.scene.add(car.mesh);
      this.traffic.parked.push(car);
    } else if (shot === 'mission') {
      this.player.place(-146, 182, Math.PI * 0.15);
      this.player.camYaw = Math.PI * 0.15 + Math.PI;
      this.police.setWanted(2);
      // police visible ahead on the beach road, closing in
      for (const [x, z] of [[-128, 196], [-162, 198]]) {
        const pc = new Car(0x111418, true);
        pc.place(x, z, Math.atan2(this.player.x - x, this.player.z - z));
        pc.speed = 18;
        this.scene.add(pc.mesh);
        this.police.cars.push(pc);
      }
      this.missions.index = 1;
      this.missions.state = 'active';
      this.missions.step = 1;
      this.missions.placeBeacon();
    }
    this.hud.setWanted(this.police.wanted);
    this.hud.setHealth(this.player.health);
  }

  startGame(useSave) {
    this.audio.init();
    this.audio.click();
    document.getElementById('menu').style.display = 'none';
    if (useSave && this.savedState) {
      const s = this.savedState;
      this.cash = s.cash;
      this.player.place(s.x, s.z, 0);
      this.player.health = s.health ?? 100;
      this.missions.index = Math.min(s.missionIndex, 3);
      this.missions.ringTimer = -0.5;
      this.hud.toast('Save loaded — welcome back to Solara Bay.');
    } else {
      this.cash = 250;
      this.player.place(0, 30, 0);
      this.player.health = 100;
      this.missions.index = 0;
      this.missions.ringTimer = -2;
    }
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.player.health);
    this.hud.setWanted(0);
    this.state = 'playing';
    if (!SHOT) this.input.lockPointer();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    document.getElementById('pause').style.display = 'flex';
    this.input.unlockPointer();
  }

  resume() {
    document.getElementById('pause').style.display = 'none';
    this.state = 'playing';
    this.audio.click();
    if (!SHOT) this.input.lockPointer();
  }

  restart() {
    clearSave();
    location.reload();
  }

  quitToMenu() {
    this.save();
    location.reload();
  }

  busted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    const penalty = Math.min(200, Math.floor(this.cash * 0.1));
    this.cash = Math.max(0, this.cash - penalty);
    this.hud.setCash(this.cash);
    document.getElementById('end-title').textContent = 'BUSTED';
    document.getElementById('end-text').textContent =
      `The Solara Bay PD got you. Bail and fines cost $${penalty}.`;
    document.getElementById('end').style.display = 'flex';
    this.input.unlockPointer();
    this.save();
  }

  wasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    const penalty = Math.min(200, Math.floor(this.cash * 0.1));
    this.cash = Math.max(0, this.cash - penalty);
    this.hud.setCash(this.cash);
    document.getElementById('end-title').textContent = 'WASTED';
    document.getElementById('end-text').textContent =
      `You didn't make it. The hospital bill is $${penalty}.`;
    document.getElementById('end').style.display = 'flex';
    this.input.unlockPointer();
    this.save();
  }

  respawn() {
    document.getElementById('end').style.display = 'none';
    this.player.health = 100;
    this.police.setWanted(0);
    if (this.player.car) {
      this.player.car = null;
      this.playerCar = null;
    }
    this.player.onFoot = true;
    this.player.mesh.visible = true;
    this.player.place(0, 60, 0);
    this.hud.setHealth(100);
    this.hud.setWanted(0);
    this.state = 'playing';
    this.audio.click();
    if (!SHOT) this.input.lockPointer();
  }

  save() {
    saveGame({
      cash: this.cash,
      missionIndex: this.missions.index,
      x: this.player.x,
      z: this.player.z,
      health: Math.round(this.player.health),
    });
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  allCars() {
    const cars = [...this.traffic.allCars(), ...this.police.cars];
    if (this.playerCar) cars.push(this.playerCar);
    return cars;
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.frames += 1;
    this.gameTime += dt;
    // ambient life always moves (even behind the menu)
    this.ocean.material.map.offset.y += dt * 0.008;
    this.canal.material.map.offset.y += dt * 0.012;
    for (const c of this.clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > 300) c.position.x = -300;
    }
    this.effects.update(dt);

    if (this.state === 'menu') {
      this.menuAngle += dt * 0.05;
      const r = 170;
      this.camera.position.set(Math.sin(this.menuAngle) * r, 85, Math.cos(this.menuAngle) * r);
      this.camera.lookAt(0, 0, 20);
      this.traffic.update(dt, this.player, this.police.cars);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.state !== 'playing') {
      this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
      return;
    }

    const input = this.input;
    const player = this.player;

    // pause
    if (input.pressed('Escape') || input.pressed('KeyP')) { this.pause(); input.endFrame(); return; }
    // mute
    if (input.pressed('KeyM')) {
      this.audio.setMuted(!this.audio.muted);
      this.hud.toast(this.audio.muted ? 'Sound muted (M to unmute)' : 'Sound on');
    }
    // answer the phone, or enter / exit a car (one action per press)
    if (input.pressed('KeyE')) {
      if (this.missions.state === 'ringing') {
        this.missions.accept();
        this.audio.click();
      } else if (player.onFoot) {
        const car = this.traffic.nearestCar(player.x, player.z, 5);
        if (car && car.health > 0) {
          const wasTraffic = this.traffic.cars.some((t) => t.car === car);
          if (wasTraffic) {
            this.traffic.cars = this.traffic.cars.filter((t) => t.car !== car);
            this.police.addWanted(1);
            this.hud.toast('You stole a car! Wanted level up.');
          } else {
            this.traffic.parked = this.traffic.parked.filter((c) => c !== car);
          }
          this.playerCar = car;
          player.enterCar(car);
          this.missions.onEnterCar();
          this.audio.click();
        }
      } else {
        const car = player.car;
        player.exitCar();
        if (car) {
          this.traffic.parked.push(car);
          this.playerCar = null;
        }
      }
    }
    // reload
    if (input.pressed('KeyR') && player.onFoot) {
      if (this.combat.reload()) this.audio.reload();
    }

    // driving input (shot modes auto-drive so the chase stays alive)
    if (!player.onFoot && player.car) {
      const axis = input.moveAxis();
      const throttle = SHOT ? 0.7 : axis.z;
      const steer = SHOT ? 0 : -axis.x; // A turns left: heading decreases
      player.car.update(dt, {
        throttle,
        steer,
        handbrake: input.down('Space'),
      }, { colliders: this.colliders, cars: this.allCars() });
      if (player.car.crashed) {
        player.car.health -= 8;
        this.audio.crash();
        this.effects.addShake(0.3);
        if (player.car.health <= 0) this.hud.toast('Your car is wrecked — get out!');
      }
    }

    player.update(dt, input, { colliders: this.colliders, cars: this.allCars() }, this.camera);

    // shooting (on foot only, rising edge of the mouse button)
    if (player.onFoot && input.mouseDown && !this.wasMouseDown) {
      const targets = [...this.buildings];
      for (const c of this.allCars()) targets.push(c.mesh);
      for (const p of this.traffic.peds) targets.push(p.mesh);
      const result = this.combat.shoot(targets);
      if (result) {
        this.audio.gunshot();
        this.effects.addShake(0.08);
        if (result === 'ped') {
          this.police.addWanted(1);
          this.hud.toast('You shot a pedestrian! Wanted level up.');
        } else if (result === 'police') {
          this.police.addWanted(1);
          this.hud.toast('You shot a police car!');
        }
      }
    }
    this.wasMouseDown = input.mouseDown;
    this.combat.update(dt);

    this.traffic.update(dt, player, this.police.cars);
    this.police.update(dt, player, this.allCars());
    this.missions.update(dt, player);

    // health regen when calm, wasted when empty
    if (this.police.wanted === 0 && player.health < 100) {
      this.healthRegenTimer += dt;
      if (this.healthRegenTimer > 5) player.health = Math.min(100, player.health + 3 * dt);
    } else {
      this.healthRegenTimer = 0;
    }
    if (player.health <= 0) { this.wasted(); input.endFrame(); return; }

    // sun follows the player so shadows stay local
    this.sun.position.set(player.x + 120, 180, player.z + 60);
    this.sun.target.position.set(player.x, 0, player.z);
    this.sun.target.updateMatrixWorld();

    // HUD
    this.hud.gameMinutes += dt * 0.5;
    this.hud.setClock();
    this.hud.setHealth(player.health);
    this.hud.setAmmo(this.combat.ammo, this.combat.magSize, this.combat.reloading);
    this.hud.setSpeed(player.onFoot ? 0 : Math.abs(player.speed) * 3.6, !player.onFoot);
    this.hud.setObjective(this.missions.objectiveText());
    this.hud.setCrosshair(player.onFoot);
    const nearCar = player.onFoot ? this.traffic.nearestCar(player.x, player.z, 5) : null;
    if (nearCar) this.hud.showPrompt('E — Get in the car');
    else if (this.missions.state === 'ringing') this.hud.showPrompt('E — Answer the phone');
    else if (!player.onFoot) this.hud.showPrompt('E — Get out   •   Space — Handbrake');
    else this.hud.hidePrompt();
    this.hud.drawMinimap({
      playerX: player.x,
      playerZ: player.z,
      heading: player.onFoot ? player.heading : (player.car ? player.car.heading : 0),
      traffic: this.traffic.cars.map((t) => t.car),
      police: this.police.cars,
      parked: this.traffic.parked,
      objective: this.missions.objectivePoint(),
    });

    // audio follows the car
    this.audio.update(dt, player.speed, !player.onFoot, this.police.wanted);

    // autosave
    this.saveTimer += dt;
    if (this.saveTimer > 30) { this.saveTimer = 0; this.save(); }

    // camera shake
    const off = this.effects.shakeOffset();
    if (off) {
      this.camera.position.x += off.x;
      this.camera.position.y += off.y;
    }

    this.renderer.render(this.scene, this.camera);
    input.endFrame();
  }
}

const game = new Game();
// debug hook for headless play-testing (read-only state inspection)
window.__solara = game;
