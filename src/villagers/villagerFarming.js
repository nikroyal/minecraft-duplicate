// ---- Farmer Villager AI Engine ---------------------------------------------
import { getBlock, setBlock } from '../world.js';

export function tickFarmerAI(mob, dt) {
  if (!mob || mob.dead || mob.profession !== 'farmer' || mob.state !== 'work') return;

  if (!mob.farmTimer) mob.farmTimer = 0;
  mob.farmTimer += dt;

  if (mob.farmTimer < 3.0) return; // Check every 3s
  mob.farmTimer = 0;

  const mx = Math.floor(mob.pos.x);
  const my = Math.floor(mob.pos.y);
  const mz = Math.floor(mob.pos.z);

  // Scan 8-block radius for Ripe Crops (ID 92)
  for (let dx = -8; dx <= 8; dx += 2) {
    for (let dz = -8; dz <= 8; dz += 2) {
      for (let dy = -1; dy <= 2; dy++) {
        const vx = mx + dx, vy = my + dy, vz = mz + dz;
        const bid = getBlock(vx, vy, vz);
        if (bid === 92) { // Ripe Wheat
          // Harvest ripe crop and replant seeds (ID 90)
          setBlock(vx, vy, vz, 90, false);
          mob.workplacePos.set(vx + 0.5, vy, vz + 0.5);

          // Add harvested wheat to farmer inventory
          if (Array.isArray(mob.inventory)) {
            const wheatItem = mob.inventory.find(i => i.id === 136);
            if (wheatItem) wheatItem.count += 2;
            else mob.inventory.push({ id: 136, count: 2 });
          }
          return;
        }
      }
    }
  }
}
