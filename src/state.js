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
  avatar: {
    headType: "steve",
    shirtColor: "#008080",
    pantsColor: "#3c4e8c",
    skinColor: "#dfcfb7"
  }
};

export const inventory = {};
export const hotbar = [15, 16, 7, 9, 5, 20, 3, 45]; // starter hotbar: cobble, stone brick, plank, glass, wood, torch, stone, ladder

export const game = {
  running: false,
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
};

export const keys = {};

// Auto-reset keys when window loses focus to prevent stuck keys
if (typeof window !== 'undefined') {
  window.addEventListener('blur', () => {
    for (const k in keys) {
      keys[k] = false;
    }
  });
}

export const touch = {
  move: { x: 0, y: 0 },
  jump: false,
  isTouch: false
};

export const toolDurability = {};
export const crops = {};
export const achievements = {};

export const avatarCallbacks = { update: null };
export const reactBridge = { updateUI: null };
