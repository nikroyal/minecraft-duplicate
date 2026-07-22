import React from 'react';
import { player, game, hotbar, inventory, toolDurability } from '../state.js';
import { thingName, BLOCKS, ITEMS } from '../config.js';
import { invCount } from '../player.js';
import Swatch3D from './Swatch3D.jsx';

import { selectSlot } from '../ui.js';

export default function HUDOverlay({ selectedSlot, targetBlockName, fps, coordsStr, clockStr }) {
  const activeSelected = selectedSlot !== undefined ? selectedSlot : game.selected;
  const hp = Math.max(0, player.health);
  const hunger = Math.max(0, player.hunger);

  // Render 10 heart slots (each represents 2 HP)
  const hearts = Array.from({ length: 10 }, (_, i) => {
    const heartVal = hp - i * 2;
    if (heartVal >= 1.5) return '❤️';
    if (heartVal >= 0.5) return '💔';
    return '🖤';
  });

  // Render 10 hunger slots (each represents 2 Hunger)
  const hungers = Array.from({ length: 10 }, (_, i) => {
    const hungerVal = hunger - i * 2;
    if (hungerVal >= 1.5) return '🍗';
    if (hungerVal >= 0.5) return '🦴';
    return '⚪';
  });

  const selectedId = hotbar[activeSelected];

  // Determine day/night icon from timeOfDay (0–1 cycle)
  const timeOfDay = game.timeOfDay || 0.3;
  const isNight = timeOfDay < 0.22 || timeOfDay > 0.80;
  const isTransition = (timeOfDay >= 0.22 && timeOfDay < 0.36) || (timeOfDay >= 0.64 && timeOfDay < 0.80);
  const timeIcon = isNight ? '🌙' : isTransition ? '🌅' : '☀️';

  return (
    <div id="hud">
      {/* Voxel Title */}
      <div className="title">VOXEL</div>

      {/* ── Time / Clock + Coords HUD — top right ── */}
      <div style={{
        position: 'fixed',
        top: '12px',
        right: '14px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '4px',
        zIndex: 120,
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        {/* Clock pill */}
        <div style={{
          background: 'rgba(0,0,0,0.50)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: '8px',
          padding: '4px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '14px',
          fontFamily: '"Courier New", monospace',
          color: '#f0e6cc',
          letterSpacing: '0.06em',
          backdropFilter: 'blur(4px)',
        }}>
          <span style={{ fontSize: '16px', lineHeight: 1 }}>{timeIcon}</span>
          <span style={{ fontWeight: 700 }}>{clockStr || '--:--'}</span>
        </div>
        {/* Coords + FPS pill */}
        <div style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '6px',
          padding: '2px 10px',
          fontSize: '9px',
          fontFamily: '"Courier New", monospace',
          color: 'rgba(200,185,155,0.75)',
          letterSpacing: '0.04em',
        }}>
          {coordsStr}&nbsp;&nbsp;|&nbsp;&nbsp;{fps} fps
        </div>
      </div>

      {/* Target Block HUD */}
      <div id="targetHud" className={`target-hud ${targetBlockName ? 'visible' : ''}`} style={{ display: targetBlockName ? 'block' : 'none' }}>
        <span id="targetName">{targetBlockName || 'Air'}</span>
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

      {/* XP Level Bar & Level Number */}
      {game.survival && (
        <div style={{
          position: 'fixed',
          bottom: '72px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2px',
          zIndex: 110,
          pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: '15px',
            fontFamily: '"Minecraft", monospace',
            fontWeight: 800,
            color: '#80ff20',
            textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
          }}>
            {player.level}
          </span>
          <div style={{
            width: '320px',
            height: '6px',
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid #1a3a08',
            borderRadius: '3px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(100, Math.max(0, (((player.xp || 0) % (((player.level || 0) + 1) * 10)) / (((player.level || 0) + 1) * 10)) * 100))}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #55ff55, #80ff20)',
              boxShadow: '0 0 4px #80ff20',
            }} />
          </div>
        </div>
      )}

      {/* Hotbar */}
      <div id="hotbar" className="hotbar" style={{ display: 'flex' }}>
        {hotbar.map((id, index) => {
          const count = invCount(id);
          const isSelected = activeSelected === index;

          const itemDef = ITEMS[id];
          const isTool = itemDef && itemDef.tool;
          const maxDurability = isTool ? ([30, 60, 150, 500][(itemDef.tier || 1) - 1] || 30) : 0;
          const currentDurability = isTool ? (toolDurability[id] !== undefined ? toolDurability[id] : maxDurability) : 0;
          const durPercent = maxDurability > 0 ? Math.max(0, Math.min(100, (currentDurability / maxDurability) * 100)) : 100;

          let barColor = '#4cd964';
          if (durPercent < 30) barColor = '#ff3b30';
          else if (durPercent < 60) barColor = '#ffcc00';

          return (
            <div
              key={index}
              className={`slot ${isSelected ? 'active' : ''}`}
              onClick={() => selectSlot(index)}
              style={{ cursor: 'pointer' }}
            >
              <span className="key">{index + 1}</span>
              {id > 0 && (count > 0 || !game.survival) ? (
                <>
                  <Swatch3D id={id} />
                  {game.survival && count > 0 && (
                    <span className="count">{count}</span>
                  )}
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
