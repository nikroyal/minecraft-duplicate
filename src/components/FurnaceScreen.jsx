import React, { useEffect } from 'react';
import { inventory, world, reactBridge } from '../state.js';
import { addItem, removeItem, invCount } from '../player.js';
import { thingName } from '../config.js';
import { playPlaceSound } from '../audio.js';
import Swatch3D from './Swatch3D.jsx';

const FUELS = { 11: 80, 101: 80, 120: 80, 5: 15, 22: 15, 23: 15, 7: 15, 31: 15, 32: 15 };
const SMELT_MAP = { 12: 102, 13: 103, 14: 104, 4: 9, 15: 3, 133: 134, 28: 36, 23: 120, 3: 40 };

export default function FurnaceScreen({ activeFurnaceCoords, onClose, scheduleSave }) {
  world.furnaces = world.furnaces || {};
  if (activeFurnaceCoords && !world.furnaces[activeFurnaceCoords]) {
    world.furnaces[activeFurnaceCoords] = {
      inputId: 0, inputCount: 0,
      fuelId: 0, fuelCount: 0,
      outputId: 0, outputCount: 0,
      burnTime: 0, maxBurnTime: 0,
      smeltProgress: 0
    };
  }

  const furnace = (activeFurnaceCoords && world.furnaces[activeFurnaceCoords]) 
    ? world.furnaces[activeFurnaceCoords]
    : { inputId: 0, inputCount: 0, fuelId: 0, fuelCount: 0, outputId: 0, outputCount: 0, burnTime: 0, maxBurnTime: 0, smeltProgress: 0 };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === "Escape" || e.code === "KeyE") {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const ids = Object.keys(inventory)
    .map(Number)
    .filter(id => invCount(id) > 0);

  const handleInventoryClick = (id) => {
    if (invCount(id) <= 0) return;
    const isFuel = FUELS[id] > 0;
    const isSmeltable = SMELT_MAP[id] !== undefined;

    // Prefer input slot for ores, but if input is full or fuel slot is empty and item is fuel, allow loading fuel slot
    if (isSmeltable && (furnace.inputId === 0 || (furnace.inputId === id && furnace.inputCount < 64))) {
      furnace.inputId = id;
      furnace.inputCount = (furnace.inputCount || 0) + 1;
      removeItem(id, 1);
      playPlaceSound(id);
      scheduleSave();
      if (reactBridge.updateUI) reactBridge.updateUI();
    } else if (isFuel && (furnace.fuelId === 0 || (furnace.fuelId === id && furnace.fuelCount < 64))) {
      furnace.fuelId = id;
      furnace.fuelCount = (furnace.fuelCount || 0) + 1;
      removeItem(id, 1);
      playPlaceSound(id);
      scheduleSave();
      if (reactBridge.updateUI) reactBridge.updateUI();
    }
  };

  const handleTakeInput = () => {
    if (furnace.inputId > 0 && furnace.inputCount > 0) {
      const id = furnace.inputId;
      addItem(id, 1);
      furnace.inputCount--;
      if (furnace.inputCount <= 0) {
        furnace.inputId = 0;
        furnace.inputCount = 0;
      }
      playPlaceSound(id);
      scheduleSave();
      if (reactBridge.updateUI) reactBridge.updateUI();
    }
  };

  const handleTakeFuel = () => {
    if (furnace.fuelId > 0 && furnace.fuelCount > 0) {
      const id = furnace.fuelId;
      addItem(id, 1);
      furnace.fuelCount--;
      if (furnace.fuelCount <= 0) {
        furnace.fuelId = 0;
        furnace.fuelCount = 0;
      }
      playPlaceSound(id);
      scheduleSave();
      if (reactBridge.updateUI) reactBridge.updateUI();
    }
  };

  const handleTakeOutput = () => {
    if (furnace.outputId > 0 && furnace.outputCount > 0) {
      const id = furnace.outputId;
      const cnt = furnace.outputCount;
      addItem(id, cnt);
      furnace.outputId = 0;
      furnace.outputCount = 0;
      playPlaceSound(id);
      scheduleSave();
      if (reactBridge.updateUI) reactBridge.updateUI();
    }
  };

  const flamePercent = furnace.maxBurnTime > 0 ? (furnace.burnTime / furnace.maxBurnTime) * 100 : 0;
  const progressPercent = (furnace.smeltProgress / 8.0) * 100;

  return (
    <div id="furnaceScreen" className="modal-furnace" style={{ display: 'flex' }}>
      <div className="furnace-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2>Furnace Smelting</h2>
          <button className="furnace-close" onClick={onClose}>Close [X]</button>
        </div>

        <div className="furnace-layout">
          {/* Inventory Selection */}
          <div className="furnace-col">
            <h3 style={{ fontSize: '10px', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '8px' }}>Select Ores / Fuels to Load</h3>
            <div className="chest-grid">
              {ids.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', gridColumn: 'span 4', textAlign: 'center', padding: '20px' }}>
                  No items to load
                </div>
              ) : (
                ids.map(id => (
                  <div key={id} className="inv-cell clickable" onClick={() => handleInventoryClick(id)}>
                    <Swatch3D id={id} />
                    <span className="count">{invCount(id)}</span>
                    <span className="tip">{thingName(id)} (Click to load)</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Furnace Slots */}
          <div className="furnace-col furnace-active-area">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '9px', color: '#aaa', textTransform: 'uppercase' }}>Input Ore</span>
              <div className="inv-cell clickable" onClick={handleTakeInput} style={{ width: '56px', height: '56px' }}>
                {furnace.inputId > 0 ? (
                  <>
                    <Swatch3D id={furnace.inputId} />
                    <span className="count">{furnace.inputCount}</span>
                  </>
                ) : <span style={{ opacity: 0.3, fontSize: '10px' }}>Empty</span>}
              </div>

              {/* Flame indicator */}
              <div className="flame-box" style={{ margin: '4px 0' }}>
                <div className="flame-fill" style={{ height: `${flamePercent}%`, background: flamePercent > 0 ? '#ff5500' : 'transparent' }} />
                🔥
              </div>

              <span style={{ fontSize: '9px', color: '#aaa', textTransform: 'uppercase' }}>Fuel</span>
              <div className="inv-cell clickable" onClick={handleTakeFuel} style={{ width: '56px', height: '56px' }}>
                {furnace.fuelId > 0 ? (
                  <>
                    <Swatch3D id={furnace.fuelId} />
                    <span className="count">{furnace.fuelCount}</span>
                  </>
                ) : <span style={{ opacity: 0.3, fontSize: '10px' }}>Empty</span>}
              </div>
            </div>

            {/* Progress Arrow */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div className="furnace-arrow">
                <div className="furnace-arrow-fill" style={{ width: `${progressPercent}%` }} />
                ➔
              </div>
            </div>

            {/* Output */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '9px', color: '#gold', textTransform: 'uppercase', fontWeight: 'bold' }}>Smelt Output</span>
              <div className="inv-cell clickable output-cell" onClick={handleTakeOutput} style={{ width: '64px', height: '64px', border: '2px solid var(--gold)' }}>
                {furnace.outputId > 0 ? (
                  <>
                    <Swatch3D id={furnace.outputId} />
                    <span className="count" style={{ fontSize: '12px', fontWeight: 'bold' }}>{furnace.outputCount}</span>
                  </>
                ) : <span style={{ opacity: 0.3, fontSize: '10px' }}>Empty</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
