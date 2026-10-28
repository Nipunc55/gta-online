// Small math helpers shared across the game.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Frame-rate independent exponential smoothing factor. */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Wrap an angle to [-PI, PI]. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Shortest-path angle interpolation. */
export function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

/** Deterministic seeded RNG (mulberry32). */
export function makeRng(seed = 1337) {
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (a, b) => a + (b - a) * rng();
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * rng());
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  return rng;
}

export const rand = (a, b) => a + (b - a) * Math.random();
export const randInt = (a, b) => Math.floor(a + (b - a + 1) * Math.random());
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Forward vector on XZ plane for a yaw where yaw = 0 faces -Z. */
export function yawForward(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Yaw that faces direction (dx, dz). */
export function yawFromDir(dx, dz) {
  return Math.atan2(-dx, -dz);
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
