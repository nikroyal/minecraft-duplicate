import React from 'react';
import { inventory, world, reactBridge } from '../state.js';
import { addItem, removeItem, invCount } from '../player.js';
import { thingName } from '../config.js';
import { playPlaceSound } from '../audio.js';
import Swatch3D from './Swatch3D.jsx';

function getFuelBurnTime(id) {
  if (id === 11 || id === 101 || id === 120) return 80;
  if (id === 5 || id === 22 || id === 23) return 15;
  if (id === 7 || id === 31 || id === 32) return 15;
  return 0;
}

function getSmeltResult(id) {
  if (id === 12) return { out: 102, label: "Iron Ingot" };
  if (id === 13) return { out: 103, label: "Gold Ingot" };
  if (id === 14) return { out: 104, label: "Diamond" };
  if (id === 4) return { out: 9, label: "Glass" };
  if (id === 15) return { out: 3, label: "Stone" };
  if (id === 133) return { out: 134, label: "Cooked Meat" };
  if (id === 28) return { out: 36, label: "Terracotta" };
  if (id === 23) return { out: 120, label: "Charcoal" };
  if (id === 3) return { out: 40, label: "Smooth Stone" };
  return null;
}

export default function FurnaceScreen({ activeFurnaceCoords, onClose, scheduleSave }) {
  const f = world.furnaces[activeFurnaceCoords] || {
    inputId: 0, inputCount: 0,
    fuelId: 0, fuelCount: 0,
    outputId: 0, outputCount: 0,
    smeltProgress: 0, burnTime: 0, maxBurnTime: 0
  };

  const ids = Object.keys(inventory)
    .map(Number)
    .filter(id => invCount(id) > 0);

  const handleInventoryClick = (id) => {
    const smeltable = getSmeltResult(id);
    const fuel = getFuelBurnTime(id) > 0;

    if (smeltable) {
      // Add to Input
      if (f.inputId === 0 || (f.inputId === id && f.inputCount < 64)) {
        f.inputId = id;
        f.inputCount = (f.inputCount || 0) + 1;
        removeItem(id, 1);
        playPlaceSound(id);
        scheduleSave();
        if (reactBridge.updateUI) reactBridge.updateUI();
      }
    } else if (fuel) {
      // Add to Fuel
      if (f.fuelId === 0 || (f.fuelId === id && f.fuelCount < 64)) {
        f.fuelId = id;
        f.fuelCount = (f.fuelCount || 0) + 1;
        removeItem(id, 1);
        playPlaceSound(id);
        scheduleSave();
        if (reactBridge.updateUI) reactBridge.updateUI();
      }
    }
  };

  const handleTakeInput = () => {
    if (f.inputId > 0 && f.inputCount > 0) {
      addItem(f.inputId, 1);
      f.inputCount--;
      if (f.inputCount <= 0) {
        f.inputId = 0;
        f.inputCount = 0;
      }
      playPlaceSound(f.inputId);
      scheduleSave();
      if (reactBridge.updateUI) reactBridge.updateUI();
    }
  };

  const handleTakeFuel = () => {
    if (f.fuelId > 0 && f.fuelCount > 0) {
      addItem(f.fuelId, 1);
      f.fuelCount--;
      if (f.fuelCount <= 0) {
        f.fuelId = 0;
        f.fuelCount = 0;
      }
      playPlaceSound(f.fuelId);
      scheduleSave();
      if (reactBridge.updateUI) reactBridge.updateUI();
    }
  };

  const handleTakeOutput = () => {
    if (f.outputId > 0 && f.outputCount > 0) {
      addItem(f.outputId, f.outputCount);
      const prevOut = f.outputId;
      f.outputId = 0;
      f.outputCount = 0;
      playPlaceSound(prevOut);
      scheduleSave();
      if (reactBridge.updateUI) reactBridge.updateUI();
    }
  };

  const progressPercent = Math.min(100, Math.floor((f.smeltProgress / 8.0) * 100));
  const flamePercent = f.maxBurnTime > 0 ? Math.min(100, Math.floor((f.burnTime / f.maxBurnTime) * 100)) : 0;

  return (
    <div id="furnaceScreen" className="modal-chest" style={{ display: 'flex' }}>
      <div className="chest-card" style={{ maxWidth: '640px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2>Furnace Smelting</h2>
          <button className="chest-close" onClick={onClose}>Close [X]</button>
        </div>

        <div className="furnace-body">
          {/* Inventory (left) */}
          <div className="furnace-col" style={{ flex: '1.2' }}>
            <h3 style={{ fontSize: '10px', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '10px' }}>Smeltables &amp; Fuels</h3>
            <div className="chest-grid">
              {ids.map(id => {
                const smeltable = getSmeltResult(id);
                const fuel = getFuelBurnTime(id) > 0;
                return (
                  <div 
                    key={id} 
                    className="inv-cell clickable"
                    style={{ opacity: (smeltable || fuel) ? 1 : 0.4 }}
                    onClick={() => handleInventoryClick(id)}
                  >
                    <Swatch3D id={id} />
                    <span className="count">{invCount(id)}</span>
                    <span className="tip">{thingName(id)} {smeltable ? "(Smeltable)" : (fuel ? "(Fuel)" : "")}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Smelting Core (right) */}
          <div className="furnace-col center-pane" style={{ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--slot-line)', borderRadius: '6px', padding: '15px' }}>
            {/* Input Slot */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '8px', color: 'var(--gold)', textTransform: 'uppercase' }}>Input</span>
              <div 
                className="inv-cell clickable" 
                style={{ width: '44px', height: '44px', border: f.inputId === 0 ? '1px solid rgba(214,178,120,0.2)' : '', background: f.inputId === 0 ? 'rgba(0,0,0,0.3)' : '' }}
                onClick={handleTakeInput}
              >
                {f.inputId > 0 && (
                  <>
                    <Swatch3D id={f.inputId} />
                    <span className="count">{f.inputCount}</span>
                  </>
                )}
              </div>
            </div>

            {/* Fire flame */}
            <div style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div id="furnaceFlame" className={`furnace-flame ${f.burnTime > 0 ? 'active' : ''}`} style={{ height: `${16 * (flamePercent / 100)}px` }} />
              <div style={{ fontSize: '7px', color: f.burnTime > 0 ? '#ff8030' : 'rgba(255,255,255,0.25)', fontWeight: 'bold', marginTop: '2px' }}>
                {f.burnTime > 0 ? `${Math.ceil(f.burnTime)}s` : "OFF"}
              </div>
            </div>

            {/* Fuel Slot */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', marginBottom: '12px' }}>
              <span style={{ fontSize: '8px', color: 'var(--gold)', textTransform: 'uppercase' }}>Fuel</span>
              <div 
                className="inv-cell clickable" 
                style={{ width: '44px', height: '44px', border: f.fuelId === 0 ? '1px solid rgba(214,178,120,0.2)' : '', background: f.fuelId === 0 ? 'rgba(0,0,0,0.3)' : '' }}
                onClick={handleTakeFuel}
              >
                {f.fuelId > 0 && (
                  <>
                    <Swatch3D id={f.fuelId} />
                    <span className="count">{f.fuelCount}</span>
                  </>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ width: '100px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-line)', borderRadius: '3px', height: '10px', overflow: 'hidden', position: 'relative', marginBottom: '12px' }}>
              <div 
                id="furnaceSmeltProgress" 
                style={{ height: '100%', background: 'linear-gradient(90deg, #6fe6e0, #40904a)', width: `${progressPercent}%`, transition: 'width 0.1s linear' }} 
              />
              <span style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', fontSize: '6px', color: '#fff', textAlign: 'center', lineHeight: '10px', fontWeight: 'bold' }}>
                {progressPercent > 0 ? `${progressPercent}%` : ""}
              </span>
            </div>

            {/* Output Slot */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '8px', color: 'var(--gold-bright)', textTransform: 'uppercase', fontWeight: 'bold' }}>Output</span>
              <div 
                className="inv-cell clickable" 
                style={{ width: '52px', height: '52px', border: f.outputId === 0 ? '1px solid rgba(111,230,224,0.3)' : '2px solid var(--gold-bright)', background: f.outputId === 0 ? 'rgba(0,0,0,0.3)' : 'rgba(111,230,224,0.05)' }}
                onClick={handleTakeOutput}
              >
                {f.outputId > 0 && (
                  <>
                    <Swatch3D id={f.outputId} />
                    <span className="count" style={{ fontSize: '10px', bottom: '4px', right: '4px' }}>{f.outputCount}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
