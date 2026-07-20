import React from 'react';
import { hotbar, inventory, player, game } from '../state.js';
import { thingName } from '../config.js';
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

  // Render hunger pips (10 pips total, 20 hunger max)
  const renderHunger = () => {
    const pips = [];
    const hg = player.hunger;
    for (let i = 0; i < 10; i++) {
      const pVal = hg - i * 2;
      if (pVal >= 2) pips.push(<span key={i} className="food full">🍗</span>);
      else if (pVal === 1) pips.push(<span key={i} className="food half">🍖</span>);
      else pips.push(<span key={i} className="food empty" style={{ opacity: 0.25 }}>🥩</span>);
    }
    return pips;
  };

  return (
    <>
      {/* Top Debugging HUD */}
      <div id="hud">
        <div><b>{fps}</b> fps</div>
        <div>xyz <b>{coordsStr}</b></div>
        <div id="modeLine">mode <b>{game.survival ? "survival" : "creative"}</b></div>
        <div>time <b>{clockStr}</b></div>
      </div>

      {/* Aimed Block Target HUD */}
      <div id="blockTargetHUD" className={`target-hud ${targetBlockName ? 'visible' : ''}`}>
        {targetBlockName}
      </div>

      {/* Hearts & Hunger Stats */}
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
          return (
            <div 
              key={index} 
              className={`slot ${index === selectedSlot ? 'active' : ''}`}
            >
              {hasItem && <Swatch3D id={id} />}
              {hasItem && <span className="count">{count}</span>}
              <span className="key">{index + 1}</span>
              {hasItem && <span className="name">{thingName(id)}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
