import React from 'react';
import { player, game, hotbar, inventory, toolDurability } from '../state.js';
import { thingName, BLOCKS, ITEMS } from '../config.js';
import { invCount } from '../player.js';
import Swatch3D from './Swatch3D.jsx';

export default function HUDOverlay() {
  const hp = Math.max(0, player.health);
  const hunger = Math.max(0, player.hunger);

  // Render 10 heart slots (each represents 2 HP)
  const hearts = Array.from({ length: 10 }, (_, i) => {
    const heartVal = hp - i * 2;
    if (heartVal >= 1.5) return '❤️'; // Full heart
    if (heartVal >= 0.5) return '💔'; // Half heart
    return '🖤'; // Empty heart
  });

  // Render 10 hunger slots (each represents 2 Hunger)
  const hungers = Array.from({ length: 10 }, (_, i) => {
    const hungerVal = hunger - i * 2;
    if (hungerVal >= 1.5) return '🍗'; // Full hunger leg
    if (hungerVal >= 0.5) return '🦴'; // Half hunger
    return '⚪'; // Empty hunger
  });

  const selectedId = hotbar[game.selected];

  return (
    <div id="hud">
      {/* Voxel Title & Stats */}
      <div className="title">VOXEL</div>
      
      {/* Target Block HUD */}
      <div id="targetHud" className="target-hud" style={{ display: 'none' }}>
        <span id="targetName">Air</span>
      </div>

      {/* Survival Health & Hunger Overlay */}
      {game.survival && (
        <div id="survivalHud" className="survival-hud" style={{ display: 'flex' }}>
          <div className="bar-row health" id="healthBar">
            {hearts.map((h, i) => (
              <span key={i} className="unit">{h}</span>
            ))}
          </div>
          <div className="bar-row hunger" id="hungerBar">
            {hungers.map((h, i) => (
              <span key={i} className="unit">{h}</span>
            ))}
          </div>
        </div>
      )}

      {/* Hotbar */}
      <div id="hotbar" className="hotbar" style={{ display: 'flex' }}>
        {hotbar.map((id, index) => {
          const count = invCount(id);
          const isSelected = game.selected === index;
          
          // Tool Durability calculation
          const itemDef = ITEMS[id];
          const isTool = itemDef && itemDef.tool;
          const maxDurability = isTool ? ([30, 60, 150, 500][(itemDef.tier || 1) - 1] || 30) : 0;
          
          // Use item ID for durability key
          const currentDurability = isTool ? (toolDurability[id] !== undefined ? toolDurability[id] : maxDurability) : 0;
          const durPercent = maxDurability > 0 ? Math.max(0, Math.min(100, (currentDurability / maxDurability) * 100)) : 100;

          // Color tier
          let barColor = '#4cd964'; // Green
          if (durPercent < 30) barColor = '#ff3b30'; // Red
          else if (durPercent < 60) barColor = '#ffcc00'; // Yellow

          return (
            <div
              key={index}
              className={`slot ${isSelected ? 'active' : ''}`}
            >
              <span className="key">{index + 1}</span>
              {id > 0 && (count > 0 || !game.survival) ? (
                <>
                  <Swatch3D id={id} />
                  {game.survival && count > 0 && (
                    <span className="count">{count}</span>
                  )}
                  {/* Tool Durability Bar */}
                  {isTool && currentDurability < maxDurability && (
                    <div className="durability-bar-container">
                      <div
                        className="durability-bar"
                        style={{ width: `${durPercent}%`, backgroundColor: barColor }}
                      />
                    </div>
                  )}
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Selected Item Name Banner */}
      {selectedId > 0 && (
        <div id="activeItemName" className="active-item-name">
          {thingName(selectedId)}
        </div>
      )}
    </div>
  );
}
