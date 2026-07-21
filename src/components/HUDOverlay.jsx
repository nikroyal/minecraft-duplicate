import React from 'react';
import { hotbar, inventory, player, game, toolDurability } from '../state.js';
import { thingName, ITEMS } from '../config.js';
import { invCount } from '../player.js';
import Swatch3D from './Swatch3D.jsx';

export default function HUDOverlay({ selectedSlot, targetBlockName, fps, coordsStr, clockStr }) {
  // Render health hearts (10 hearts total, 20 hp max)
  const renderHearts = () => {
    const hearts = [];
    const hp = player.health;
    for (let i = 0; i < 10; i++) {
      const hVal = hp - i * 2;
      if (hVal >= 2) hearts.push(<span key={i} className="heart full">❤️</span>);
      else if (hVal === 1) hearts.push(<span key={i} className="heart half">💔</span>);
      else hearts.push(<span key={i} className="heart empty" style={{ opacity: 0.25 }}>🖤</span>);
    }
    return hearts;
  };

  // Render hunger chicken legs (10 legs total, 20 units max)
  const renderHunger = () => {
    const legs = [];
    const hunger = player.hunger;
    for (let i = 0; i < 10; i++) {
      const hVal = hunger - i * 2;
      if (hVal >= 2) legs.push(<span key={i} className="hunger full">🍖</span>);
      else if (hVal === 1) legs.push(<span key={i} className="hunger half">🍖</span>); // simplify visual
      else legs.push(<span key={i} className="hunger empty" style={{ opacity: 0.25 }}>🍗</span>);
    }
    return legs;
  };

  return (
    <>
      {/* Target Aim Block Name */}
      <div id="targetBlockName" className={`target-hud ${targetBlockName ? 'visible' : ''}`}>
        {targetBlockName}
      </div>

      {/* Debug HUD Info overlay */}
      <div id="hud">
        FPS: {fps} <br />
        POS: {coordsStr} <br />
        TIME: {clockStr}
      </div>

      {/* Crosshair */}
      <div id="crosshair" />

      {/* Stats bar indicator */}
      {game.survival && (
        <div id="statBars">
          <div id="healthBar" className="stat-row">{renderHearts()}</div>
          <div id="hungerBar" className="stat-row">{renderHunger()}</div>
        </div>
      )}

      {/* Hotbar */}
      <div id="hotbar">
        {hotbar.map((id, index) => {
          const count = invCount(id);
          const hasItem = id > 0 && count > 0;
          const isToolItem = hasItem && ITEMS[id] && ITEMS[id].tool;
          const maxDur = isToolItem ? ([30, 60, 150, 500][ITEMS[id].tier - 1] || 30) : 0;
          const currentDur = isToolItem ? (toolDurability[id] !== undefined ? toolDurability[id] : maxDur) : 0;
          const durPercent = isToolItem ? Math.max(0, Math.min(100, (currentDur / maxDur) * 100)) : 0;

          return (
            <div 
              key={index} 
              className={`slot ${index === selectedSlot ? 'active' : ''}`}
            >
              {hasItem && <Swatch3D id={id} />}
              {hasItem && <span className="count">{count}</span>}
              {isToolItem && (
                <div className="durability-bar-container">
                  <div 
                    className="durability-bar" 
                    style={{ 
                      width: `${durPercent}%`,
                      backgroundColor: durPercent < 20 ? '#ff3b30' : durPercent < 55 ? '#ffcc00' : '#4cd964'
                    }} 
                  />
                </div>
              )}
              <span className="key">{index + 1}</span>
              {hasItem && <span className="name">{thingName(id)}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
