// ---- Villager Daily Schedule Engine ---------------------------------------
import * as THREE from 'three';

/**
 * Updates Villager state machine based on timeOfDay (0.0 to 1.0)
 * Dawn: 0.25 - 0.35 | Midday: 0.35 - 0.65 | Afternoon: 0.65 - 0.75 | Night: 0.75 - 0.25
 */
export function updateVillagerSchedule(mob, dt, timeOfDay = 0.5) {
  if (!mob || mob.dead || !mob.pos) return;

  if (!mob.homePos) mob.homePos = mob.pos.clone();
  if (!mob.wellPos) mob.wellPos = mob.homePos.clone();
  if (!mob.workplacePos) mob.workplacePos = mob.homePos.clone().add(new THREE.Vector3(4, 0, 4));

  // Panic overrides schedule
  if (mob.panicTimer > 0) {
    mob.state = 'panic';
    mob.isSleeping = false;
    return;
  }

  const isNight = (timeOfDay >= 0.75 || timeOfDay < 0.25);
  const isAfternoon = (timeOfDay >= 0.65 && timeOfDay < 0.75);

  if (isNight) {
    // 🌙 Sleep Phase
    mob.state = 'sleep';
    const target = mob.homePos || mob.pos;
    if (mob.pos && target && target.x !== undefined && mob.pos.distanceTo(target) > 1.2) {
      // Walk home
      steerTowardTarget(mob, target, dt, 1.8);
      mob.isSleeping = false;
    } else {
      // Arrived home, enter sleep state
      mob.isSleeping = true;
      mob.vel.set(0, 0, 0);
    }
  } else if (isAfternoon) {
    // 🌇 Afternoon Gathering at Village Well
    mob.state = 'gather';
    mob.isSleeping = false;
    const target = mob.wellPos || mob.homePos || mob.pos;
    if (mob.pos && target && target.x !== undefined && mob.pos.distanceTo(target) > 2.5) {
      steerTowardTarget(mob, target, dt, 1.6);
    } else {
      // Idle at well and socialize
      mob.vel.set(0, 0, 0);
      if (Math.random() < 0.02) {
        mob.yaw += (Math.random() - 0.5) * 1.5; // Turn head to chat with neighboring villagers
      }
    }
  } else {
    // ☀️ Work Phase (Dawn & Midday)
    mob.state = 'work';
    mob.isSleeping = false;
    const target = mob.workplacePos || mob.homePos || mob.pos;
    if (mob.pos && target && target.x !== undefined && mob.pos.distanceTo(target) > 2.0) {
      steerTowardTarget(mob, target, dt, 1.8);
    }
  }
}

function steerTowardTarget(mob, targetPos, dt, moveSpeed) {
  const dx = targetPos.x - mob.pos.x;
  const dz = targetPos.z - mob.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 0.3) {
    mob.yaw = Math.atan2(dx, dz);
    mob.vel.x = Math.sin(mob.yaw) * moveSpeed;
    mob.vel.z = Math.cos(mob.yaw) * moveSpeed;
  } else {
    mob.vel.x = 0;
    mob.vel.z = 0;
  }
}
