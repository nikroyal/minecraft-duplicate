import React, { useEffect } from 'react';
import { inventory, world, reactBridge } from '../state.js';
import { addItem, removeItem, invCount } from '../player.js';
import { thingName } from '../config.js';
import { playPlaceSound } from '../audio.js';
import Swatch3D from './Swatch3D.jsx';

export default function ChestScreen({ activeChestCoords, onClose, scheduleSave }) {
  world.chests = world.chests || {};
  if (activeChestCoords && !world.chests[activeChestCoords]) {
    world.chests[activeChestCoords] = Array.from({ length: 27 }, () => ({ id: 0, count: 0 }));
  }
  
  const chest = (activeChestCoords && world.chests[activeChestCoords]) ? world.chests[activeChestCoords] : [];
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === "Escape" || e.code === "KeyE") {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Get active inventory IDs
  const ids = Object.keys(inventory)
    .map(Number)
    .filter(id => invCount(id) > 0);

  const handleStoreItem = (id) => {
    if (invCount(id) <= 0) return;
    let slot = chest.find(s => s.id === id && s.count < 64);
    if (!slot) slot = chest.find(s => s.id === 0);
    if (slot) {
      slot.id = id;
      slot.count = (slot.count || 0) + 1;
      removeItem(id, 1);
      playPlaceSound(id);
      scheduleSave();
      if (reactBridge.updateUI) reactBridge.updateUI();
    }
  };

  const handleRetrieveItem = (idx) => {
    const slot = chest[idx];
    if (slot && slot.id > 0 && slot.count > 0) {
      const id = slot.id;
      addItem(id, 1);
      slot.count--;
      if (slot.count <= 0) {
        slot.id = 0;
        slot.count = 0;
      }
      playPlaceSound(id);
      scheduleSave();
      if (reactBridge.updateUI) reactBridge.updateUI();
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
