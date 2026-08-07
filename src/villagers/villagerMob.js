// ---- Villager Mob 3D Mesh Builder & State Registry ------------------------
import * as THREE from 'three';

export const VILLAGER_PROFESSIONS = {
  farmer:     { name: "Farmer",     robeColor: 0x8a6a3a, hatColor: 0xd8c060 }, // Straw Hat
  blacksmith: { name: "Blacksmith", robeColor: 0x3a3a3a, hatColor: 0x5a5a5a }, // Apron
  librarian:  { name: "Librarian",  robeColor: 0xf0f0f0, hatColor: 0xe0e0e0 }, // White Robe
  cleric:     { name: "Cleric",     robeColor: 0x8a3a8a, hatColor: 0xaa4aaa }, // Purple Robe
  unemployed: { name: "Villager",   robeColor: 0x6a4f34, hatColor: 0x5a4f34 }  // Brown Robe
};

/**
 * Constructs authentic 3D Three.js Villager Mesh with iconic long nose, crossed arms, and robes.
 */
export function createVillagerMesh(profession = 'farmer') {
  const pDef = VILLAGER_PROFESSIONS[profession] || VILLAGER_PROFESSIONS.unemployed;
  const group = new THREE.Group();

  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc89d7c });
  const robeMat = new THREE.MeshLambertMaterial({ color: pDef.robeColor });
  const hatMat  = new THREE.MeshLambertMaterial({ color: pDef.hatColor });
  const eyeMat  = new THREE.MeshBasicMaterial({ color: 0x336633 });

  // 1. Head & Iconic Long Nose
  const headGeo = new THREE.BoxGeometry(0.5, 0.65, 0.5);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.position.y = 1.35;
  group.add(headMesh);

  // Large Nose (protrudes forward +z)
  const noseGeo = new THREE.BoxGeometry(0.15, 0.28, 0.22);
  const noseMesh = new THREE.Mesh(noseGeo, skinMat);
  noseMesh.position.set(0, -0.05, 0.32);
  headMesh.add(noseMesh);

  // Eyes (Green Villager eyes)
  const eyeGeo = new THREE.BoxGeometry(0.1, 0.08, 0.02);
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.14, 0.08, 0.26);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.14, 0.08, 0.26);
  headMesh.add(leftEye);
  headMesh.add(rightEye);

  // Farmer Straw Hat
  if (profession === 'farmer') {
    const hatRimGeo = new THREE.BoxGeometry(0.85, 0.06, 0.85);
    const hatRim = new THREE.Mesh(hatRimGeo, hatMat);
    hatRim.position.y = 0.35;
    const hatTopGeo = new THREE.BoxGeometry(0.52, 0.2, 0.52);
    const hatTop = new THREE.Mesh(hatTopGeo, hatMat);
    hatTop.position.y = 0.45;
    headMesh.add(hatRim);
    headMesh.add(hatTop);
  }

  // 2. Robe Torso
  const torsoGeo = new THREE.BoxGeometry(0.6, 0.85, 0.45);
  const torsoMesh = new THREE.Mesh(torsoGeo, robeMat);
  torsoMesh.position.y = 0.65;
  group.add(torsoMesh);

  // 3. Iconic Folded Crossed Arms across Chest
  const armGroup = new THREE.Group();
  armGroup.position.set(0, 0.65, 0.18);
  const armCrossGeo = new THREE.BoxGeometry(0.72, 0.26, 0.28);
  const armCrossMesh = new THREE.Mesh(armCrossGeo, robeMat);
  armGroup.add(armCrossMesh);

  // Hands tucked under sleeve
  const handGeo = new THREE.BoxGeometry(0.24, 0.2, 0.22);
  const handMesh = new THREE.Mesh(handGeo, skinMat);
  handMesh.position.set(0, 0, 0.04);
  armGroup.add(handMesh);
  group.add(armGroup);

  // 4. Robe Skirt Legs
  const legGeo = new THREE.BoxGeometry(0.5, 0.6, 0.4);
  const legMesh = new THREE.Mesh(legGeo, robeMat);
  legMesh.position.y = 0.25;
  group.add(legMesh);

  group.head = headMesh;
  group.arms = armGroup;
  group.legs = legMesh;

  return group;
}

/**
 * Initializes a new Villager mob state object
 */
export function createVillagerState(x, y, z, profession = 'farmer') {
  return {
    type: 'villager',
    profession,
    hp: 20,
    maxHp: 20,
    dead: false,
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(0, 0, 0),
    yaw: Math.random() * Math.PI * 2,
    pitch: 0,
    homePos: new THREE.Vector3(x, y, z),
    workplacePos: new THREE.Vector3(x + 4, y, z + 4),
    wellPos: new THREE.Vector3(x, y, z),
    state: 'work', // 'work', 'gather', 'sleep', 'panic'
    panicTimer: 0,
    isSleeping: false,
    inventory: [{ id: 135, count: 4 }] // 4 Bread
  };
}
