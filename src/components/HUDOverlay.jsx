import React, { useState, useEffect } from 'react';
import { player, game, hotbar, inventory, toolDurability, getTotalArmorPoints } from '../state.js';
import { thingName, BLOCKS, ITEMS } from '../config.js';
import { invCount } from '../player.js';
import Swatch3D from './Swatch3D.jsx';
import { capturedErrors, subscribeErrors } from '../errorLog.js';
import { activeNavigation, clearActiveNavigation } from '../pathfinder.js';

import { selectSlot } from '../ui.js';

export default function HUDOverlay({ 
  selectedSlot, targetBlockName, fps, coordsStr, clockStr, 
  notificationsCount = 0, unreadChatCount = 0, onOpenNotifications, onOpenChat,
  bgmActive = false, onToggleBGM, onOpenErrorConsole
}) {
  const [, forceUpdate] = useState(0);
  const [errorCount, setErrorCount] = useState(capturedErrors.length);

  useEffect(() => {
    return subscribeErrors((errs) => {
      setErrorCount(errs.length);
    });
  }, []);

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

  const armorPoints = getTotalArmorPoints();
  const armorIcons = Array.from({ length: 10 }, (_, i) => {
    const val = armorPoints - i * 2;
    if (val >= 1.5) return '🛡️';
    if (val >= 0.5) return '🛡️';
    return null;
  }).filter(Boolean);

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

      {/* ── ⚔️ EQUIPMENT & HOLDING HUD WIDGET — top left ── */}
      <div style={{
        position: 'fixed',
        top: '60px',
        left: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        zIndex: 120,
        userSelect: 'none',
        pointerEvents: 'none',
      }}>
        {/* Main Hand Widget */}
        <div style={{
          background: 'rgba(12, 10, 8, 0.70)',
          border: '1px solid rgba(242, 217, 160, 0.3)',
          borderRadius: '8px',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backdropFilter: 'blur(6px)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
          minWidth: '180px',
        }}>
          <div style={{
            width: '36px', height: '36px',
            background: selectedId > 0 ? 'rgba(35,28,18,0.9)' : 'rgba(20,16,10,0.6)',
            border: `1px solid ${selectedId > 0 ? '#f2d9a0' : 'rgba(214,178,120,0.15)'}`,
            borderRadius: '4px',
            display: 'grid', placeItems: 'center',
          }}>
            {selectedId > 0 ? <Swatch3D id={selectedId} /> : <span style={{ fontSize: '16px', opacity: 0.4 }}>✋</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '9px', color: '#c8b896', letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: 700 }}>
              MAIN HAND
            </span>
            <span style={{ fontSize: '11px', fontWeight: 800, color: selectedId > 0 ? '#f2d9a0' : '#8a7a60' }}>
              {selectedId > 0 ? thingName(selectedId) : 'Bare Hands'}
            </span>
            {selectedId > 0 && ITEMS[selectedId]?.tool && (
              <span style={{ fontSize: '8px', color: '#8fd06a', fontWeight: 'bold' }}>
                Tier {ITEMS[selectedId].tier || 1} • {toolDurability[selectedId] !== undefined ? toolDurability[selectedId] : ([30, 60, 150, 500][(ITEMS[selectedId].tier || 1) - 1] || 30)} Durability
              </span>
            )}
          </div>
        </div>

        {/* Armor Status Widget */}
        <div style={{
          background: 'rgba(12, 10, 8, 0.70)',
          border: '1px solid rgba(111,230,224,0.3)',
          borderRadius: '8px',
          padding: '6px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          backdropFilter: 'blur(6px)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
          minWidth: '180px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', color: '#6fe6e0', letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: 700 }}>
              🛡️ ARMOR ({armorPoints}/20)
            </span>
            <span style={{ fontSize: '8px', color: '#8fd06a', fontWeight: 'bold' }}>
              -{Math.round(Math.min(80, armorPoints * 4))}% DMG
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: '2px' }}>
            {['helmet', 'chestplate', 'leggings', 'boots'].map(slot => {
              const piece = player.armor ? player.armor[slot] : null;
              const icons = { helmet: '🪖', chestplate: '🦺', leggings: '👖', boots: '👢' };
              
              return (
                <div key={slot} title={piece ? `${thingName(piece.id)} (+${ITEMS[piece.id]?.defense || 0} Def)` : `Empty ${slot}`} style={{
                  width: '32px', height: '32px',
                  background: piece ? 'rgba(30,55,65,0.9)' : 'rgba(20,16,10,0.6)',
                  border: `1px solid ${piece ? '#6fe6e0' : 'rgba(214,178,120,0.15)'}`,
                  borderRadius: '4px',
                  display: 'grid', placeItems: 'center',
                  position: 'relative'
                }}>
                  {piece && piece.id ? (
                    <Swatch3D id={piece.id} />
                  ) : (
                    <span style={{ fontSize: '13px', opacity: 0.3 }}>{icons[slot]}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Top-Center GPS Target Navigation HUD ── */}
      {activeNavigation && player && player.pos && (() => {
        const nav = activeNavigation;
        const tx = nav.targetPos?.x ?? nav.x;
        const tz = nav.targetPos?.z ?? nav.z;
        if (tx === undefined || tz === undefined) return null;

        const dx = tx - player.pos.x;
        const dz = tz - player.pos.z;
        const navDist = Math.round(Math.hypot(dx, dz));
        const angle = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const navHeading = dirs[Math.floor((angle + 22.5) / 45) % 8];
        const name = nav.targetName || nav.name || 'Waypoint';
        const icon = nav.targetIcon || nav.icon || '📍';

        return (
          <div style={{
            position: 'fixed',
            top: '14px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, rgba(20,24,30,0.95), rgba(10,12,16,0.98))',
            border: '2px solid #39ff14',
            borderRadius: '20px',
            padding: '6px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 130,
            boxShadow: '0 0 24px rgba(57,255,20,0.4)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
            fontFamily: 'sans-serif',
            fontSize: '11px',
            userSelect: 'none',
          }}>
            <span style={{ fontSize: '15px' }}>{icon}</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 800, color: '#39ff14', letterSpacing: '0.5px' }}>
                GPS: {name}
              </span>
              <span style={{ fontSize: '9px', color: '#c8b896' }}>
                📏 {navDist}m away • 🧭 Heading {navHeading}
              </span>
            </div>

            <button
              onClick={() => {
                player.autoPilot = !player.autoPilot;
                if (nav) nav.autoPilot = player.autoPilot;
                forceUpdate();
              }}
              title="Toggle Auto-Pilot Mode (Press P)"
              style={{
                background: (player.autoPilot || nav.autoPilot) ? 'rgba(57,255,20,0.3)' : 'rgba(255,255,255,0.1)',
                border: `1px solid ${(player.autoPilot || nav.autoPilot) ? '#39ff14' : 'rgba(255,255,255,0.2)'}`,
                borderRadius: '12px',
                padding: '4px 10px',
                fontSize: '9px',
                fontWeight: 800,
                color: (player.autoPilot || nav.autoPilot) ? '#39ff14' : '#ccc',
                cursor: 'pointer',
                letterSpacing: '0.5px',
              }}
            >
              {(player.autoPilot || nav.autoPilot) ? '🤖 AUTO-PILOT: ON' : '🤖 AUTO-PILOT'}
            </button>

            <button
              onClick={() => clearActiveNavigation()}
              title="Cancel Navigation"
              style={{
                background: 'rgba(255,77,77,0.25)',
                border: '1px solid #ff4d4d',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                color: '#ff4d4d',
                fontWeight: 800,
                fontSize: '10px',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        );
      })()}

      {/* ── Time / Clock + Coords HUD — top right ── */}
      <div style={{
        position: 'fixed',
        top: '12px',
        right: '14px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '6px',
        zIndex: 120,
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
          pointerEvents: 'none',
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
          pointerEvents: 'none',
        }}>
          {coordsStr}&nbsp;&nbsp;|&nbsp;&nbsp;{fps} fps
        </div>

        {/* In-Game Notifications & Chat Counter Buttons */}
        <div style={{ display: 'flex', gap: '6px', pointerEvents: 'auto', marginTop: '2px' }}>
          <button
            onClick={() => {
              if (document.pointerLockElement) document.exitPointerLock();
              if (window.__toggleWayfinder) window.__toggleWayfinder();
            }}
            title="Locate Nearest NPC Village"
            style={{
              background: 'linear-gradient(135deg, rgba(57,255,20,0.25), rgba(20,60,25,0.4))',
              border: '1px solid #39ff14',
              borderRadius: '6px', padding: '5px 9px', color: '#88ff88', fontSize: '10px',
              fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
              boxShadow: '0 0 10px rgba(57,255,20,0.3)', backdropFilter: 'blur(4px)'
            }}
          >
            <span>🏡 VILLAGE</span>
          </button>

          <button
            onClick={onOpenNotifications}
            title="Open Notification Center"
            style={{
              background: notificationsCount > 0 ? 'rgba(214,178,120,0.35)' : 'rgba(0,0,0,0.55)',
              border: `1px solid ${notificationsCount > 0 ? 'var(--gold)' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: '6px', padding: '5px 9px', color: '#fff', fontSize: '10px',
              fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)'
            }}
          >
            <span>🔔 NOTIFICATIONS</span>
            <span style={{
              background: notificationsCount > 0 ? 'var(--gold-bright)' : 'rgba(255,255,255,0.2)',
              color: '#000', borderRadius: '10px', padding: '1px 6px', fontSize: '9px', fontWeight: 800
            }}>
              {notificationsCount}
            </span>
          </button>

          <button
            onClick={onOpenChat}
            title="Toggle Chat Panel"
            style={{
              background: unreadChatCount > 0 ? 'rgba(0,122,255,0.35)' : 'rgba(0,0,0,0.55)',
              border: `1px solid ${unreadChatCount > 0 ? '#3897f0' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: '6px', padding: '5px 9px', color: '#fff', fontSize: '10px',
              fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)'
            }}
          >
            <span>💬 CHAT</span>
            <span style={{
              background: unreadChatCount > 0 ? '#3897f0' : 'rgba(255,255,255,0.2)',
              color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '9px', fontWeight: 800
            }}>
              {unreadChatCount}
            </span>
          </button>

          <button
            onClick={onOpenErrorConsole}
            title="Open In-Game Error Console & Stack Inspector (Press F9 or ~)"
            style={{
              background: errorCount > 0 ? 'rgba(255,77,77,0.35)' : 'rgba(0,0,0,0.55)',
              border: `1px solid ${errorCount > 0 ? '#ff4d4d' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: '6px', padding: '5px 9px', color: '#fff', fontSize: '10px',
              fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)'
            }}
          >
            <span>🐞 ERRORS</span>
            <span style={{
              background: errorCount > 0 ? '#ff4d4d' : 'rgba(255,255,255,0.2)',
              color: errorCount > 0 ? '#fff' : '#aaa', borderRadius: '10px', padding: '1px 6px', fontSize: '9px', fontWeight: 800
            }}>
              {errorCount}
            </span>
          </button>
        </div>

        {/* Ambient Music Toggle Button */}
        <button
          onClick={onToggleBGM}
          title="Toggle Ambient Background Music"
          style={{
            background: bgmActive ? 'rgba(57,255,20,0.25)' : 'rgba(0,0,0,0.55)',
            border: `1px solid ${bgmActive ? '#39ff14' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: '6px',
            padding: '4px 9px',
            color: bgmActive ? '#39ff14' : '#ccc',
            fontSize: '9px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            pointerEvents: 'auto',
            marginTop: '2px',
          }}
        >
          {bgmActive ? '🎵 MUSIC ON' : '🔇 MUSIC OFF'}
        </button>
      </div>

      {/* Target Block HUD (integrated with XP & Mob Kills) */}
      <div id="targetHud" className={`target-hud ${targetBlockName ? 'visible' : ''}`} style={{ display: targetBlockName ? 'block' : 'none' }}>
        <span id="targetName">
          <span style={{ opacity: 0.65, fontSize: '10px', letterSpacing: '1px', marginRight: '5px' }}>TARGET:</span>
          {targetBlockName}
        </span>
      </div>

      {/* Survival Health, Armor & Hunger Overlay */}
      {game.survival && (
        <div id="survivalHud" className="survival-hud" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {armorPoints > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(111,230,224,0.4)', alignSelf: 'flex-start' }}>
              <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#6fe6e0', letterSpacing: '0.5px' }}>DEFENSE ({armorPoints}/20):</span>
              <div style={{ display: 'flex', gap: '1px' }}>
                {armorIcons.map((a, i) => (
                  <span key={i} style={{ fontSize: '11px', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }}>{a}</span>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: '18px' }}>
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
          const currentDurability = isTool ? (toolDurability[`slot_${index}`] !== undefined ? toolDurability[`slot_${index}`] : (toolDurability[id] !== undefined ? toolDurability[id] : maxDurability)) : 0;
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

      {/* 🏷️ 3D FLOATING WORLD WAYPOINTS (Base 🏡, Farm 🌾, Markers) */}
      {typeof window !== 'undefined' && Array.isArray(window.__projectedWaypoints) && window.__projectedWaypoints.map(wp => (
        <div
          key={wp.id}
          style={{
            position: 'fixed',
            left: `${wp.x}px`,
            top: `${wp.y}px`,
            transform: 'translate(-50%, -100%)',
            zIndex: 115,
            pointerEvents: 'none',
            userSelect: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <div style={{
            background: 'rgba(20, 16, 12, 0.92)',
            border: '1px solid var(--gold)',
            borderRadius: '16px',
            padding: '3px 10px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.8)',
            color: '#fff',
            fontSize: '10px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            whiteSpace: 'nowrap'
          }}>
            <span>{wp.icon}</span>
            <span style={{ color: 'var(--gold-bright)' }}>{wp.name}</span>
            <span style={{ color: '#aaa', fontSize: '9px' }}>({wp.dist}m)</span>
          </div>
          {/* Indicator triangle */}
          <div style={{
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '6px solid var(--gold)'
          }} />
        </div>
      ))}

      {/* ⌨️ BOTTOM CONTEXT HOTKEY ACTION BAR */}
      <div style={{
        position: 'fixed',
        bottom: '84px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 110,
        pointerEvents: 'none',
        userSelect: 'none',
        background: 'rgba(10, 8, 5, 0.65)',
        border: '1px solid rgba(214,178,120,0.25)',
        borderRadius: '6px',
        padding: '3px 14px',
        display: 'flex',
        gap: '12px',
        fontSize: '9px',
        color: '#ccc',
        backdropFilter: 'blur(3px)',
        boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
      }}>
        <span><strong style={{ color: 'var(--gold-bright)' }}>[WASD]</strong> Move</span>
        <span><strong style={{ color: 'var(--gold-bright)' }}>[LMB]</strong> Mine / Attack</span>
        <span><strong style={{ color: 'var(--gold-bright)' }}>[RMB]</strong> Place</span>
        <span><strong style={{ color: 'var(--gold-bright)' }}>[E]</strong> Crafting</span>
        <span><strong style={{ color: 'var(--gold-bright)' }}>[T]</strong> Chat</span>
        <span><strong style={{ color: 'var(--gold-bright)' }}>[Esc]</strong> Pause</span>
      </div>

      {/* Physics Debug Telemetry Panel (F3 Toggle) */}
      {typeof window !== 'undefined' && window.__physicsDebug && window.__physicsTelemetry && (
        <div style={{
          position: 'fixed',
          top: '70px',
          left: '14px',
          background: 'rgba(10, 15, 25, 0.88)',
          border: '1px solid #4cd964',
          borderRadius: '6px',
          padding: '10px 14px',
          color: '#e0f0ff',
          fontFamily: 'monospace',
          fontSize: '12px',
          lineHeight: '1.5',
          zIndex: 9999,
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}>
          <div style={{ color: '#4cd964', fontWeight: 'bold', marginBottom: '4px', borderBottom: '1px solid #333' }}>
            ⚡ PHYSICS DEBUG (F3)
          </div>
          <div><strong>Grounded State:</strong> <span style={{ color: window.__physicsTelemetry.grounded ? '#4cd964' : '#ff3b30' }}>{window.__physicsTelemetry.grounded ? 'TRUE (GROUNDED)' : 'FALSE (AIRBORNE)'}</span></div>
          <div><strong>Vertical Velocity:</strong> {window.__physicsTelemetry.velY} m/s</div>
          <div><strong>Supporting Collider ID:</strong> <span style={{ color: '#ffea00' }}>{window.__physicsTelemetry.supportCollider}</span></div>
          <div><strong>Supporting Chunk Coords:</strong> <span style={{ color: '#4cd964' }}>{window.__physicsTelemetry.supportChunk}</span></div>
          <div><strong>Position:</strong> ({window.__physicsTelemetry.posX}, {window.__physicsTelemetry.posY}, {window.__physicsTelemetry.posZ})</div>
          <div><strong>In Water:</strong> {window.__physicsTelemetry.inWater ? 'YES' : 'NO'} | <strong>Flying:</strong> {window.__physicsTelemetry.flying ? 'YES' : 'NO'}</div>
          <div><strong>Camera Sync:</strong> <span style={{ color: '#4cd964' }}>{window.__physicsTelemetry.cameraSync}</span></div>
          <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed #444', color: '#6fe6e0' }}>
            <strong>📦 DROPPED ITEM ENTITIES ({window.__physicsTelemetry.droppedItemsCount || 0}):</strong>
          </div>
          {window.__physicsTelemetry.droppedItemsList && window.__physicsTelemetry.droppedItemsList.length > 0 ? (
            window.__physicsTelemetry.droppedItemsList.slice(0, 5).map((item, i) => (
              <div key={i} style={{ fontSize: '11px', color: item.mode === 'ATTRACTING' ? '#39ff14' : item.mode === 'FALLING' ? '#ffaa00' : '#d8caae' }}>
                #{i + 1} {item.name}×{item.count} | Pos: ({item.posX}, {item.posY}, {item.posZ}) | Vel: ({item.velX}, {item.velY}, {item.velZ}) | Gravity: {item.gravityState} | Collide(H:{item.collidedHoriz}, V:{item.collidedVert}) | Mode: <strong>{item.mode}</strong>
              </div>
            ))
          ) : (
            <div style={{ fontSize: '11px', color: '#888' }}>No active item entity drops nearby.</div>
          )}
          <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed #444', color: '#ffaa00' }}>
            <strong>⚠ CHUNK PIPELINE SYNC</strong>
          </div>
          <div><strong>Dirty Chunks:</strong> <span style={{ color: window.__physicsTelemetry.dirtyChunks > 0 ? '#ff6b35' : '#4cd964' }}>{window.__physicsTelemetry.dirtyChunks}</span> {window.__physicsTelemetry.dirtyCxCz}</div>
          <div><strong>Last Water Tick:</strong> {window.__physicsTelemetry.lastWaterTick}</div>
          <div><strong>Last Mesh Rebuild:</strong> {window.__physicsTelemetry.lastMeshRebuild}</div>
        </div>
      )}

      {/* ── Navigation hint: visible in bottom-left during active pathfinding ── */}
      {activeNavigation && (
        <div style={{
          position: 'fixed',
          bottom: '16px',
          left: '16px',
          background: 'rgba(10,20,10,0.88)',
          border: '1px solid rgba(57,255,20,0.5)',
          borderRadius: '6px',
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          zIndex: 9990,
          pointerEvents: 'none',
          boxShadow: '0 2px 10px rgba(57,255,20,0.15)',
          backdropFilter: 'blur(4px)',
        }}>
          <span style={{ fontSize: '14px' }}>🧭</span>
          <div>
            <div style={{ fontSize: '10px', color: '#39ff14', fontWeight: 700, letterSpacing: '0.5px' }}>
              NAVIGATING • {activeNavigation.targetIcon} {activeNavigation.targetName}
            </div>
            <div style={{ fontSize: '9px', color: 'rgba(200,255,200,0.6)', marginTop: '1px' }}>
              Press <strong style={{ color: '#39ff14' }}>B</strong> to go back to pathfinding page
            </div>
          </div>
        </div>
      )}

      {/* ── 🪂 SLOW FALL / PARACHUTE DESCENT PROMPT & GLIDE CONTROL ── */}
      {(!player.onGround && !player.flying && player.vel && player.vel.y < -0.1) && (
        <div style={{
          position: 'fixed',
          bottom: '120px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: player.isSlowFalling
            ? 'linear-gradient(145deg, rgba(20, 80, 40, 0.95), rgba(10, 50, 25, 0.98))'
            : 'linear-gradient(145deg, rgba(20, 25, 35, 0.9), rgba(10, 15, 20, 0.95))',
          border: player.isSlowFalling ? '2px solid #39ff14' : '2px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '24px',
          padding: '8px 20px',
          zIndex: 9999,
          boxShadow: player.isSlowFalling
            ? '0 0 20px rgba(57, 255, 20, 0.5), inset 0 0 10px rgba(57, 255, 20, 0.3)'
            : '0 4px 16px rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#fff',
          fontFamily: 'Inter, sans-serif',
          pointerEvents: 'auto',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'all 0.2s ease',
        }}
        onMouseDown={() => { if (typeof touch !== 'undefined') touch.slowFall = true; }}
        onMouseUp={() => { if (typeof touch !== 'undefined') touch.slowFall = false; }}
        onTouchStart={() => { if (typeof touch !== 'undefined') touch.slowFall = true; }}
        onTouchEnd={() => { if (typeof touch !== 'undefined') touch.slowFall = false; }}
        >
          <span style={{ fontSize: '20px' }}>🪂</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: player.isSlowFalling ? '#39ff14' : '#ffffff', letterSpacing: '0.5px' }}>
              {player.isSlowFalling ? 'GLIDING / SLOW FALL ACTIVE' : 'PRESS [F] TO SLOW FALL'}
            </div>
            <div style={{ fontSize: '10px', color: player.isSlowFalling ? '#b0ffb0' : 'rgba(255, 255, 255, 0.7)' }}>
              {player.isSlowFalling ? 'Descent speed capped • Fall damage negated!' : 'Hold [F] or Click here to prevent fall damage'}
            </div>
          </div>
        </div>
      )}

      {/* ── 📡 TNT DETONATOR ON-SCREEN REMOTE CONTROL ── */}
      {(selectedId === 180 || selectedId === 56 || selectedId === 117 || selectedId === 118 || selectedId === 119 || (game.primedTnt && game.primedTnt.length > 0)) && (
        <div style={{
          position: 'fixed',
          bottom: '90px',
          right: '24px',
          background: 'linear-gradient(145deg, rgba(28, 12, 12, 0.92), rgba(16, 8, 8, 0.95))',
          border: '2px solid #ff3333',
          borderRadius: '16px',
          padding: '14px 18px',
          zIndex: 9999,
          boxShadow: '0 8px 32px rgba(255, 0, 0, 0.4), inset 0 0 12px rgba(255, 51, 51, 0.2)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          minWidth: '220px',
          userSelect: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>📡</span>
            <span style={{ color: '#ff4444', fontWeight: 800, fontSize: '13px', letterSpacing: '1px', textTransform: 'uppercase' }}>
              TNT Detonator Remote
            </span>
          </div>

          <div style={{ fontSize: '11px', color: '#ffaaaa', textAlign: 'center', background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: '4px' }}>
            {game.primedTnt && game.primedTnt.length > 0
              ? `💣 ${game.primedTnt.length} TNT(s) Primed & Ready!`
              : 'READY TO DETONATE REMOTE TNTs'}
          </div>

          {/* BIG RED BUTTON */}
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && typeof window.__detonateRemoteTnt === 'function') {
                window.__detonateRemoteTnt();
              }
            }}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: 'linear-gradient(180deg, #ff4444 0%, #cc0000 100%)',
              border: '2px solid #ffaaaa',
              borderRadius: '8px',
              color: '#ffffff',
              fontWeight: 900,
              fontSize: '14px',
              letterSpacing: '0.5px',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(255, 0, 0, 0.6), inset 0 2px 4px rgba(255, 255, 255, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span style={{ fontSize: '16px' }}>🔴</span> PRESS RED BUTTON
          </button>

          <div style={{ fontSize: '10px', color: '#aaa', fontStyle: 'italic' }}>
            Press <kbd style={{ background: '#333', color: '#fff', padding: '1px 4px', borderRadius: '3px' }}>1</kbd> or <kbd style={{ background: '#333', color: '#fff', padding: '1px 4px', borderRadius: '3px' }}>R</kbd> on Keyboard
          </div>
        </div>
      )}
    </div>
  );
}
