import * as THREE from 'three';

export const SAVE_KEY = "voxel_world_save";

export const world = {
  chunks: new Map(),
  edits: {}, // persistent player edits: "wx,wy,wz" -> blockId
  chests: {},
  furnaces: {},
};

export const player = {
  pos: new THREE.Vector3(8.5, 30, 8.5),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  eye: 1.6,
  flying: false,
  health: 20,
  hunger: 20,
  dead: false,
  invuln: 0,
  swingProgress: 0,
  cameraMode: 0,
  hungerTimer: 0,
  regenTimer: 0,
  starveTimer: 0,
  drownTimer: 0,
  fallPeak: 30,
  minedWoodCount: 0,
  minedOresCount: 0,
  diedTonight: false,
  nightSurvivorAwarded: false,
  distanceWalked: 0,
  xp: 0,
  level: 0,
  sprinting: false,
  spawnPoint: null,
  bowCharge: 0,
  avatar: {
    headType: "steve",
    shirtColor: "#008080",
    pantsColor: "#3c4e8c",
    skinColor: "#dfcfb7"
  }
};

export const inventory = {};
export const hotbar = [15, 16, 7, 9, 5, 20, 3, 45]; // starter hotbar: cobble, stone brick, plank, glass, wood, torch, stone, ladder

// Starter inventory seeding
inventory[3] = 16; // Seed stone count for hotbar slot 7

export const game = {
  running: false,
  paused: false,  // true when pointer lock lost without a menu (Escape, focus loss)
  survival: true,
  timeOfDay: 0.3, // 0..1 (noonish, night is <0.24 or >0.78)
  pointerLocked: false,
  lastTime: performance.now(),
  fps: 60,
  saveTimer: null,
  waterTimer: 0,
  selected: 0,
  mobs: [],
  particles: [],
  xpOrbs: [],
  projectiles: [],
  primedTnt: [],
};

// Global WebGL refs
export const webgl = {
  scene: null,
  camera: null,
  renderer: null,
  highlight: null,
  ambientLight: null,
  dirLight: null,
  moonLight: null,
  atlasTex: null,
  crackTex: null,
  crackMat: null,
  crackMesh: null,
  playerMesh: null,
  waterMat: null,
};

export const keys = {};

// Auto-reset keys and touch controls when window loses focus to prevent stuck movement
if (typeof window !== 'undefined') {
  window.addEventListener('blur', () => {
    for (const k in keys) {
      keys[k] = false;
    }
    touch.move.x = 0;
    touch.move.y = 0;
    touch.jump = false;
  });
}

export const touch = {
  move: { x: 0, y: 0 },
  jump: false,
  isTouch: false,
  reset() {
    this.move.x = 0;
    this.move.y = 0;
    this.jump = false;
  }
};

export const toolDurability = {};
export const crops = {};
export const achievements = {};

export const avatarCallbacks = { update: null };
export const reactBridge = { updateUI: null };

export function resetGameState() {
  world.chunks.clear();
  world.edits = {};
  world.chests = {};
  world.furnaces = {};
  for (const k in inventory) delete inventory[k];
  for (const k in toolDurability) delete toolDurability[k];
  for (const k in crops) delete crops[k];
  for (const k in achievements) delete achievements[k];
  inventory[3] = 16;
  
  // Full player & game entity reset
  player.health = 20;
  player.hunger = 20;
  player.dead = false;
  player.flying = false;
  player.vel.set(0, 0, 0);
  player.pos.set(8.5, 48, 8.5);
  player.fallPeak = 48;
  player.minedWoodCount = 0;
  player.minedOresCount = 0;
  player.diedTonight = false;
  player.nightSurvivorAwarded = false;
  player.distanceWalked = 0;
  player.xp = 0;
  player.level = 0;
  player.sprinting = false;
  player.spawnPoint = null;
  player.bowCharge = 0;
  
  game.mobs.length = 0;
  game.particles.length = 0;
  if (game.xpOrbs) game.xpOrbs.length = 0;
  if (game.projectiles) game.projectiles.length = 0;
  if (game.primedTnt) game.primedTnt.length = 0;
  game.timeOfDay = 0.3;
  game.running = false;
  touch.reset();
}
