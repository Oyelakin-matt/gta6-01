// Solara Bay — shared constants, city layout and a seeded RNG so the city is
// identical on every load (screenshots, saves and replays all match).
export const CITY = {
  PITCH: 50, // distance between road centrelines
  BLOCK: 36, // building block size
  ROAD: 14, // road width
  HALF: 200, // city spans -200..200 on x and z
  BEACH_Z: 214, // sand strip ends here; ocean beyond
  WATER_Z: 214,
  CANAL_Z: -214, // canal starts here to the north
  BOUND_X: 216, // drivable/walkable bounds
  BOUND_Z_MIN: -210,
  BOUND_Z_MAX: 210,
};

// Road centrelines: -200, -150, ..., 200 (9 each way).
export const ROADS = [];
for (let i = 0; i <= 8; i++) ROADS.push(-200 + i * 50);

// Block centres: -175, -125, ..., 175 (8 x 8 = 64 blocks).
export const BLOCKS = [];
for (let i = 0; i < 8; i++) BLOCKS.push(-175 + i * 50);

// Deterministic RNG (mulberry32) — same city every run.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rng = mulberry32(20261118);

export function pick(arr, r = rng) { return arr[Math.floor(r() * arr.length)]; }
export function range(min, max, r = rng) { return min + r() * (max - min); }
export function rangeInt(min, max, r = rng) { return Math.floor(range(min, max + 1, r)); }
export function chance(p, r = rng) { return r() < p; }

// Palette — sun-soaked modern coastal city.
export const PALETTE = {
  sky: 0x8ec3e8,
  fog: 0xa8c8e0,
  sun: 0xfff2d0,
  asphalt: 0x33343a,
  sidewalk: 0x9d9a8e,
  sand: 0xe8d29a,
  ocean: 0x2e7fb8,
  oceanDeep: 0x1a5a8a,
  grass: 0x5f9e4d,
  buildingRoof: 0x4a4a52,
};

export const CAR_COLORS = [
  0xc0392b, 0x2980b9, 0xf1c40f, 0xecf0f1, 0x2c3e50, 0x7f8c8d,
  0x8e44ad, 0xe67e22, 0x16a085, 0xd35400, 0x95a5a6, 0x1abc9c,
];

export const MISSION_PAY = [500, 900, 1200, 2000];
