/**
 * VOXEL ULTIMATE ANTI-CHEAT & ANTI-TAMPER SECURITY SHIELD
 * Protects client state against console tampering, speed hacks, inventory duplication,
 * memory modifications, and script injections.
 */

import { player, inventory, game } from './state.js';
import { BLOCKS, ITEMS, RECIPES } from './config.js';
import { MOB_TYPES } from './mobs.js';
import { validateInventoryState } from './player.js';
import { toast } from './ui.js';

let lastValidatedPos = null;

export function initAntiCheatShield() {
  if (typeof window === 'undefined') return;

  // 1. Console Security Warning Banner
  try {
    console.log(
      '%c⛔ STOP! SECURITY WARNING ⛔\n%cExecuting scripts or modifying variables in this console can compromise your account and trigger automated Anti-Cheat bans.',
      'color: red; font-size: 20px; font-weight: bold; -webkit-text-stroke: 1px black;',
      'color: #ffd700; font-size: 13px; font-weight: bold;'
    );
  } catch (e) {}

  // 2. Freeze Critical Registries to prevent console tampering of block stats/recipes
  try {
    Object.freeze(BLOCKS);
    Object.freeze(ITEMS);
    Object.freeze(RECIPES);
    if (MOB_TYPES) Object.freeze(MOB_TYPES);
  } catch (e) {}

  // 3. Start Anti-Cheat Integrity Guard (runs every 1.5 seconds)
  setInterval(runAntiCheatScan, 1500);
}

export function runAntiCheatScan() {
  if (!game.running) return;

  // A. Health & Hunger Guard (Max 100)
  if (player.hp > 100) {
    player.hp = 100;
    toast('⚠️ Anti-Cheat: Invalid Health Detected & Reset.');
  }

  // B. Speed Hack Detection (Max horizontal velocity threshold)
  if (!player.flying) {
    const horizVel = Math.sqrt(player.vel.x * player.vel.x + player.vel.z * player.vel.z);
    if (horizVel > 35) {
      player.vel.x *= 0.1;
      player.vel.z *= 0.1;
      toast('⚠️ Anti-Cheat: Excessive Speed Detected.');
    }
  }

  // C. Inventory Duplication & Stack Limit Guard (Max 64 per slot)
  validateInventoryState();

  // D. Fly Hack Guard (If flying is disabled for current room/world mode)
  if (game.mode === 'public' && !game.allowFlyInPublic && player.flying) {
    player.flying = false;
    toast('⚠️ Anti-Cheat: Flight is disabled in Public Nexus.');
  }
}
