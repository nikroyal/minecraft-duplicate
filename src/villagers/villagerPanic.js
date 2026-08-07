// ---- Villager Zombie Panic & Door Mechanics Engine -------------------------
import * as THREE from 'three';

export function tickVillagerPanic(mob, dt, allMobs = []) {
  if (!mob || mob.dead) return;

  // 1. Detect nearby hostile Zombies within 12 blocks
  let threatZombie = null;
  let minThreatDist = 12.0;

  if (Array.isArray(allMobs)) {
    for (const m of allMobs) {
      if (!m || m.dead || m.type !== 'zombie' || !m.pos || !mob.pos) continue;
      const d = mob.pos.distanceTo(m.pos);
      if (d < minThreatDist) {
        minThreatDist = d;
        threatZombie = m;
      }
    }
  }

  // Trigger Panic
  if (threatZombie) {
    mob.panicTimer = 4.0;
    mob.state = 'panic';
    mob.isSleeping = false;
  }

  // Execute Panic Evasion
  if (mob.panicTimer > 0) {
    mob.panicTimer -= dt;
    if (threatZombie) {
      // Sprint away from zombie towards home shelter
      const fleeAngle = Math.atan2(mob.pos.x - threatZombie.pos.x, mob.pos.z - threatZombie.pos.z);
      mob.yaw = fleeAngle;
      mob.vel.x = Math.sin(fleeAngle) * 3.2; // Sprint speed 3.2 m/s
      mob.vel.z = Math.cos(fleeAngle) * 3.2;
    } else if (mob.homePos) {
      // Sprint to house shelter
      const dx = mob.homePos.x - mob.pos.x;
      const dz = mob.homePos.z - mob.pos.z;
      mob.yaw = Math.atan2(dx, dz);
      mob.vel.x = Math.sin(mob.yaw) * 3.0;
      mob.vel.z = Math.cos(mob.yaw) * 3.0;
    }
  }
}
