import React from 'react';
import { inventory, hotbar } from '../state.js';
import { GREEN_COIN_ITEM_ID } from '../villagers/villagerTradeCatalog.js';

export default function EmeraldHUDOverlay() {
  // Count Green Coins (Emerald Item ID = 152) across inventory & hotbar
  const getGreenCoinCount = () => {
    let count = 0;
    if (inventory) {
      for (const slot in inventory) {
        if (inventory[slot]?.id === GREEN_COIN_ITEM_ID) {
          count += inventory[slot].count || 0;
        }
      }
    }
    if (hotbar) {
      for (let i = 0; i < hotbar.length; i++) {
        if (hotbar[i] === GREEN_COIN_ITEM_ID) {
          count += 1;
        }
      }
    }
    return count;
  };

  const coinCount = getGreenCoinCount();

  return (
    <div style={{
      position: 'fixed',
      top: '18px',
      right: '240px',
      background: 'rgba(12, 32, 18, 0.88)',
      border: '2px solid #39ff14',
      boxShadow: '0 0 18px rgba(57,255,20,0.35)',
      borderRadius: '20px',
      padding: '8px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      zIndex: 99,
      color: '#ffffff',
      fontFamily: "'Inter', system-ui, sans-serif",
      fontWeight: '700',
      fontSize: '15px',
      backdropFilter: 'blur(6px)',
      userSelect: 'none',
      pointerEvents: 'none'
    }}>
      <span style={{ fontSize: '20px', filter: 'drop-shadow(0 0 6px rgba(57,255,20,0.8))' }}>🪙</span>
      <span style={{ color: '#88ff88', letterSpacing: '0.5px' }}>{coinCount} Green Coins</span>
    </div>
  );
}
