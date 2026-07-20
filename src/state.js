import * as THREE from 'three';

export const SAVE_KEY = "voxel_world_save";

export const world = {
  chunks: new Map(),
  edits: {}, // persistent player edits: "wx,wy,wz" -> blockId
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
  avatar: {
    headType: "steve",
    shirtColor: "#008080",
    pantsColor: "#3c4e8c",
    skinColor: "#dfcfb7"
  }
};

export const inventory = {};
export const hotbar = [15, 16, 7, 9, 5, 20, 8, 45]; // starter hotbar: cobble, stone brick, plank, glass, wood, torch, water, ladder

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
};

export const keys = {};

export const touch = {
  move: { x: 0, y: 0 },
  jump: false,
  isTouch: false
};

export const avatarCallbacks = { update: null };

export const reactBridge = { updateUI: null };
