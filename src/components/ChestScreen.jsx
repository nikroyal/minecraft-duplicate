import React, { useEffect, useReducer } from 'react';
import { inventory, world, reactBridge } from '../state.js';
import { addItem, removeItem, invCount } from '../player.js';
import { thingName } from '../config.js';
import { playPlaceSound } from '../audio.js';
import Swatch3D from './Swatch3D.jsx';

export default function ChestScreen({ activeChestCoords, onClose, scheduleSave }) {
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  useEffect(() => {
    world.chests = world.chests || {};
    if (activeChestCoords && !world.chests[activeChestCoords]) {
      world.chests[activeChestCoords] = Array.from({ length: 27 }, () => ({ id: 0, count: 0 }));
    }
  }, [activeChestCoords]);

  const chest = (activeChestCoords && world.chests && world.chests[activeChestCoords]) ? world.chests[activeChestCoords] : [];

  // Get active inventory IDs
  const ids = Object.keys(inventory || {})
    .map(Number)
    .filter(id => invCount(id) > 0);

  const handleStoreItem = (id) => {
    if (typeof id !== 'number' || isNaN(id) || invCount(id) <= 0) return;
    let remaining = invCount(id);
    while (remaining > 0) {
      // Find an existing partial slot for this item type first, then an empty slot
      let slot = chest.find(s => s.id === id && (s.count || 0) < 64);
      if (!slot) slot = chest.find(s => s.id === 0);
      if (!slot) break; // No more chest space
      const space = 64 - (slot.count || 0);
      const toStore = Math.min(space, remaining);
      slot.id = id;
      slot.count = (slot.count || 0) + toStore;
      removeItem(id, toStore);
      remaining -= toStore;
    }
    playPlaceSound(id);
    scheduleSave?.();
    if (reactBridge.updateUI) reactBridge.updateUI();
    forceUpdate();
  };

  const handleRetrieveItem = (idx) => {
    if (typeof idx !== 'number' || idx < 0 || idx >= chest.length) return;
    const slot = chest[idx];
    if (slot && typeof slot.id === 'number' && slot.id > 0 && typeof slot.count === 'number' && slot.count > 0) {
      const id = slot.id;
      addItem(id, 1);
      slot.count = Math.max(0, slot.count - 1);
      if (slot.count <= 0) {
        slot.id = 0;
        slot.count = 0;
      }
      playPlaceSound(id);
      scheduleSave?.();
      if (reactBridge.updateUI) reactBridge.updateUI();
      forceUpdate();
    }
  };

  return (
    <div id="chestScreen" className="modal-chest" style={{ display: 'flex' }}>
      <div className="chest-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2>Chest Storage</h2>
          <button className="chest-close" onClick={onClose}>Close [X]</button>
        </div>

        <div className="chest-grids">
          {/* Player Inventory (left) */}
          <div className="chest-col">
            <h3 style={{ fontSize: '10px', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '10px' }}>Your Inventory (Click to store)</h3>
            <div className="chest-grid">
              {ids.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', gridColumn: 'span 4', textAlign: 'center', padding: '20px' }}>
                  Inventory empty
                </div>
              ) : (
                ids.map(id => (
                  <div 
                    key={id} 
                    className="inv-cell clickable"
                    onClick={() => handleStoreItem(id)}
                  >
                    <Swatch3D id={id} />
                    <span className="count">{invCount(id)}</span>
                    <span className="tip">{thingName(id)} (Click to store)</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chest Inventory (right) */}
          <div className="chest-col">
            <h3 style={{ fontSize: '10px', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '10px' }}>Chest contents (Click to take)</h3>
            <div className="chest-grid chest-grid-9">
              {chest.map((slot, idx) => (
                <div 
                  key={idx} 
                  className="inv-cell clickable"
                  style={{ minHeight: '40px', border: slot.id === 0 ? '1px solid rgba(214,178,120,0.15)' : '', background: slot.id === 0 ? 'rgba(0,0,0,0.2)' : '' }}
                  onClick={() => handleRetrieveItem(idx)}
                >
                  {slot.id > 0 ? (
                    <>
                      <Swatch3D id={slot.id} />
                      <span className="count">{slot.count}</span>
                      <span className="tip">{thingName(slot.id)} (Click to take)</span>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
