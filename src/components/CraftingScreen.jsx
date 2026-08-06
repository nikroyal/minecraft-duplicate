import React, { useState, useCallback, useMemo } from 'react';
import { inventory, hotbar, game, reactBridge, player, getTotalArmorPoints } from '../state.js';
import { RECIPES, BLOCKS, ITEMS, thingName, isPlaceable, resolveRecipe } from '../config.js';
import { invCount, addItem, removeItem } from '../player.js';
import { craft, scheduleSave, toast } from '../ui.js';
import { playPlaceSound } from '../audio.js';
import Swatch3D from './Swatch3D.jsx';

// ── helpers ────────────────────────────────────────────────────────────────
function SlotBox({ id, count, size = 52, onClick, onContextMenu, highlighted, ghost, style = {} }) {
  const isEmpty = !id || id === 0;
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        width: size, height: size, position: 'relative',
        background: 'rgba(30,24,16,0.9)',
        border: `1px solid ${highlighted ? '#f2d9a0' : ghost ? 'rgba(214,178,120,0.4)' : 'rgba(214,178,120,0.2)'}`,
        borderRadius: 3,
        display: 'grid', placeItems: 'center',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: highlighted ? '0 0 0 1px #f2d9a0, 0 0 10px rgba(242,217,160,0.3)' : 'none',
        transition: 'border-color .1s, box-shadow .1s',
        ...style,
      }}
    >
      {!isEmpty && (
        <>
          <Swatch3D id={id} />
          {count > 1 && (
            <span style={{
              position: 'absolute', right: 3, bottom: 2,
              fontSize: 11, fontWeight: 700,
              color: '#f2d9a0', textShadow: '0 1px 2px #000',
            }}>{count}</span>
          )}
        </>
      )}
    </div>
  );
}

// All items the player has, sorted by block first then items, de-duped by id
function getPlayerItems() {
  const items = [];
  const seen = new Set();
  for (const rawId of Object.keys(inventory || {})) {
    const id = Number(rawId);
    if (id > 0 && invCount(id) > 0 && !seen.has(id)) {
      seen.add(id);
      items.push({ id, count: invCount(id) });
    }
  }
  // also include hotbar items not already in inventory obj
  for (const id of hotbar) {
    if (id > 0 && invCount(id) > 0 && !seen.has(id)) {
      seen.add(id);
      items.push({ id, count: invCount(id) });
    }
  }
  return items;
}

const EMPTY_GRID = Array(9).fill(0);

export default function CraftingScreen({ onClose }) {
  // grid[0..8] = item ids placed in the 3x3 grid (1 item per cell, no stacking)
  const [grid, setGrid] = useState([...EMPTY_GRID]);
  // held = item currently on the cursor: { id, count } or null
  const [held, setHeld] = useState(null);

  // Build a "bag" from the grid for recipe matching: { itemId: count }
  const gridBag = useMemo(() => {
    const bag = {};
    for (const id of grid) {
      if (id > 0) bag[id] = (bag[id] || 0) + 1;
    }
    return bag;
  }, [grid]);

  const matchedRecipe = useMemo(() => resolveRecipe(gridBag), [gridBag]);

  const outputId  = matchedRecipe?.out  ?? 0;
  const outputQty = matchedRecipe?.qty  ?? 1;
  const [, forceUpdate] = useState(0);
  const armorPoints = getTotalArmorPoints();

  const handleArmorSlotClick = useCallback((slotKey) => {
    if (!player.armor) player.armor = { helmet: null, chestplate: null, leggings: null, boots: null };
    const currentPiece = player.armor[slotKey];

    if (held) {
      const itemDef = ITEMS[held.id];
      if (itemDef && itemDef.armorSlot === slotKey) {
        const oldId = currentPiece ? currentPiece.id : 0;
        player.armor[slotKey] = { id: held.id, durability: itemDef.durability || 100 };
        playPlaceSound(held.id);
        toast(`Equipped ${thingName(held.id)} (+${itemDef.defense || 0} Defense)`);

        if (held.count > 1) {
          if (oldId > 0) addItem(oldId, 1);
          setHeld({ id: held.id, count: held.count - 1 });
        } else {
          if (oldId > 0) {
            setHeld({ id: oldId, count: 1 });
          } else {
            setHeld(null);
          }
        }
      } else {
        toast(`Item must be a ${slotKey} armor piece!`);
      }
    } else if (currentPiece && currentPiece.id) {
      setHeld({ id: currentPiece.id, count: 1 });
      player.armor[slotKey] = null;
      toast(`Unequipped ${thingName(currentPiece.id)}`);
    }
    forceUpdate(n => n + 1);
    scheduleSave();
    if (reactBridge.updateUI) reactBridge.updateUI();
  }, [held]);

  const handleQuickEquip = useCallback((id) => {
    const itemDef = ITEMS[id];
    if (!itemDef || !itemDef.armorSlot) return;
    const slotKey = itemDef.armorSlot;
    if (!player.armor) player.armor = { helmet: null, chestplate: null, leggings: null, boots: null };
    const currentPiece = player.armor[slotKey];

    removeItem(id, 1);
    player.armor[slotKey] = { id, durability: itemDef.durability || 100 };
    if (currentPiece && currentPiece.id) {
      addItem(currentPiece.id, 1);
    }
    playPlaceSound(id);
    toast(`Equipped ${thingName(id)} (+${itemDef.defense || 0} Defense)`);
    forceUpdate(n => n + 1);
    scheduleSave();
    if (reactBridge.updateUI) reactBridge.updateUI();
  }, []);

  const acquiredTools = useMemo(() => {
    const tools = [];
    const seen = new Set();
    const allOwnedIds = new Set([...Object.keys(inventory || {}).map(Number), ...hotbar]);
    for (const id of allOwnedIds) {
      if (id > 0 && invCount(id) > 0 && !seen.has(id)) {
        const def = ITEMS[id];
        if (def && (def.tool || id === 146)) {
          seen.add(id);
          tools.push({ id, count: invCount(id), def });
        }
      }
    }
    tools.sort((a, b) => (b.def.tier || 1) - (a.def.tier || 1));
    return tools;
  }, [inventory, hotbar]);

  const handleHoldTool = useCallback((id) => {
    hotbar[game.selected] = id;
    addItem(id, 1);
    toast(`Holding ${thingName(id)} in main hand!`);
    playPlaceSound(id);
    forceUpdate(n => n + 1);
    scheduleSave();
    if (reactBridge.updateUI) reactBridge.updateUI();
  }, []);

  // ── interactions ───────────────────────────────────────────────────────

  // Click an inventory item → pick it up into the cursor (or merge if same item)
  const handlePickItem = useCallback((id) => {
    if (invCount(id) <= 0) return;
    if (held) {
      if (held.id === id) {
        // Same item: add as much as possible to held stack
        const available = invCount(id);
        const take = Math.min(available, 64 - held.count);
        if (take > 0) {
          removeItem(id, take);
          setHeld({ id, count: held.count + take });
        }
      } else {
        // Different item: put held back, pick up the new item
        addItem(held.id, held.count);
        const take = Math.min(invCount(id), 64);
        removeItem(id, take);
        setHeld({ id, count: take });
      }
    } else {
      const take = Math.min(invCount(id), 64);
      removeItem(id, take);
      setHeld({ id, count: take });
    }
  }, [held]);

  // Click a grid slot
  const handleGridClick = useCallback((idx) => {
    const slotId = grid[idx];
    if (held) {
      const newGrid = [...grid];
      if (slotId === 0) {
        // Empty slot → place 1 item from held
        newGrid[idx] = held.id;
        const newCount = held.count - 1;
        setHeld(newCount > 0 ? { id: held.id, count: newCount } : null);
        setGrid(newGrid);
      } else if (slotId === held.id) {
        // Same item already in this slot — the grid only tracks 1 per slot,
        // so there's nothing to do (each cell = exactly 1 item unit).
        // This is expected behaviour; no silent corruption.
      } else {
        // Different item in slot → proper swap: pick up old slot item into held,
        // place one of held's item into the slot.
        const oldSlotId = slotId;
        newGrid[idx] = held.id;
        setGrid(newGrid);
        // Reduce held by 1 (placed in slot), carry the old slot item instead
        if (held.count === 1) {
          // Held stack exhausted → just swap directly
          setHeld({ id: oldSlotId, count: 1 });
        } else {
          // Still have more held items: put old slot item into inventory,
          // keep the rest of held stack
          addItem(oldSlotId, 1);
          setHeld({ id: held.id, count: held.count - 1 });
        }
      }
    } else if (slotId > 0) {
      // No held item → pick up the item from this grid slot
      const newGrid = [...grid];
      newGrid[idx] = 0;
      setGrid(newGrid);
      setHeld({ id: slotId, count: 1 });
    }
  }, [held, grid]);

  // Right-click grid slot: if holding, place 1; if not, pick up 1 from slot
  const handleGridRightClick = useCallback((e, idx) => {
    e.preventDefault();
    const slotId = grid[idx];
    if (held) {
      if (slotId === 0) {
        // Place 1 of held into empty slot
        const newGrid = [...grid];
        newGrid[idx] = held.id;
        const newCount = held.count - 1;
        setHeld(newCount > 0 ? { id: held.id, count: newCount } : null);
        setGrid(newGrid);
      }
      // If slot has same item, do nothing (can't stack >1 per grid cell)
      // If slot has different item, do nothing on right-click (left-click to swap)
    } else if (slotId > 0) {
      // No held → pick up the 1 item from this slot
      const newGrid = [...grid];
      newGrid[idx] = 0;
      setGrid(newGrid);
      setHeld({ id: slotId, count: 1 });
    }
  }, [held, grid]);

  // Click output slot → collect crafted item directly into inventory
  // (and onto cursor so player can see what they got)
  const handleCollectOutput = useCallback(() => {
    if (!matchedRecipe) return;

    // If holding a different item, auto-return it to inventory first so
    // the player is never blocked from collecting their craft result.
    if (held && held.id !== outputId) {
      addItem(held.id, held.count);
      setHeld(null);
    }

    // Check there's room in inventory for the result
    const currentHeldCount = (held && held.id === outputId) ? held.count : 0;
    if (currentHeldCount + outputQty > 64) return;

    // Consume exactly what the recipe needs from the grid
    const newGrid = [...grid];
    for (const rawId of Object.keys(matchedRecipe?.in || {})) {
      const id = Number(rawId);
      let need = matchedRecipe.in[rawId];
      for (let i = 0; i < 9 && need > 0; i++) {
        if (newGrid[i] === id) { newGrid[i] = 0; need--; }
      }
    }
    setGrid(newGrid);

    // Pick up crafted output onto cursor (will save to inventory on place/close)
    setHeld({ id: outputId, count: currentHeldCount + outputQty });
  }, [matchedRecipe, grid, held, outputId, outputQty]);

  // Put held item back into inventory
  const handleReturnHeld = useCallback(() => {
    if (!held) return;
    addItem(held.id, held.count);
    setHeld(null);
  }, [held]);

  // Hotbar slot click interaction
  const handleHotbarSlotClick = useCallback((idx) => {
    const currentSlotId = hotbar[idx];
    if (held) {
      // Place held item into this hotbar slot
      const oldId = currentSlotId;
      hotbar[idx] = held.id;
      // Add the held item to inventory (it's now registered to the hotbar slot)
      addItem(held.id, held.count);

      if (oldId > 0 && oldId !== held.id) {
        // There was a different item in the slot — put it on the cursor
        const cnt = invCount(oldId);
        if (cnt > 0) {
          const take = Math.min(cnt, 64);
          removeItem(oldId, take);
          setHeld({ id: oldId, count: take });
        } else {
          // Old hotbar item had 0 count — just clear held
          setHeld(null);
        }
      } else {
        setHeld(null);
      }
    } else if (currentSlotId > 0) {
      // No held item → select this slot and pick up its stack to cursor
      game.selected = idx;
      const count = invCount(currentSlotId);
      if (count > 0) {
        const take = Math.min(count, 64);
        removeItem(currentSlotId, take);
        setHeld({ id: currentSlotId, count: take });
      }
    }
    scheduleSave();
    if (reactBridge.updateUI) reactBridge.updateUI();
  }, [held]);

  // Keyboard shortcut: press 1–8 while holding an item to assign it to that hotbar slot
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
      if (e.code.startsWith('Digit')) {
        const num = parseInt(e.code.replace('Digit', ''), 10);
        if (num >= 1 && num <= 8) {
          const slotIdx = num - 1;
          if (held) {
            hotbar[slotIdx] = held.id;
            addItem(held.id, held.count);
            setHeld(null);
            scheduleSave();
            if (reactBridge.updateUI) reactBridge.updateUI();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [held]);

  // Clear grid → return all grid items to inventory
  const clearGrid = useCallback(() => {
    for (const id of grid) {
      if (id > 0) addItem(id, 1);
    }
    setGrid([...EMPTY_GRID]);
  }, [grid]);

  // Close: return held + grid items to inventory, then close
  const handleClose = useCallback(() => {
    if (held) { addItem(held.id, held.count); setHeld(null); }
    for (const id of grid) { if (id > 0) addItem(id, 1); }
    onClose();
  }, [held, grid, onClose]);

  const playerItems = getPlayerItems();

  return (
    <>
      {/* ── Main Panel ── */}
      <div style={{
        width: 'min(740px, 96vw)',
        maxHeight: '90vh',
        background: 'rgba(20,15,10,0.97)',
        border: '1px solid rgba(214,178,120,0.35)',
        borderRadius: 10,
        boxShadow: '0 20px 80px rgba(0,0,0,0.8)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 22px',
          borderBottom: '1px solid rgba(214,178,120,0.2)',
          background: 'rgba(0,0,0,0.3)',
        }}>
          <span style={{ color: '#f2d9a0', fontWeight: 700, fontSize: 14, letterSpacing: 2 }}>
            🔨 INVENTORY &amp; CRAFTING
          </span>
          {held && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#f2d9a0' }}>
              <Swatch3D id={held.id} />
              Holding: <strong>{thingName(held.id)} ×{held.count}</strong>
              <button onClick={handleReturnHeld} style={{
                fontFamily: 'inherit', fontSize: 10, color: '#d6b278',
                background: 'rgba(40,32,22,0.9)', border: '1px solid rgba(214,178,120,0.25)',
                borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
              }}>↩ Return to Inventory</button>
            </div>
          )}
          <button onClick={handleClose} style={{
            fontFamily: 'inherit', fontSize: 11, color: '#d6b278',
            background: 'rgba(40,32,22,0.9)', border: '1px solid rgba(214,178,120,0.25)',
            borderRadius: 4, padding: '6px 14px', cursor: 'pointer', letterSpacing: 1,
          }}>✕ Close</button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── TOP: Armor Equipment + Grid + Output ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>

            {/* 🛡️ ARMOR EQUIPMENT SLOTS */}
            <div style={{
              background: 'rgba(15, 12, 8, 0.85)',
              border: '1px solid rgba(111,230,224,0.3)',
              borderRadius: 8,
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              minWidth: 200,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(111,230,224,0.2)', paddingBottom: 6 }}>
                <span style={{ fontSize: 10, letterSpacing: 1.5, color: '#6fe6e0', fontWeight: 700, textTransform: 'uppercase' }}>
                  🛡️ ARMOR ({armorPoints}/20)
                </span>
                <span style={{ fontSize: 9, color: '#8fd06a', fontWeight: 'bold' }}>
                  -{Math.round(Math.min(80, armorPoints * 4))}% DMG
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {['helmet', 'chestplate', 'leggings', 'boots'].map(slot => {
                  const piece = player.armor ? player.armor[slot] : null;
                  const icons = { helmet: '🪖', chestplate: '🦺', leggings: '👖', boots: '👢' };
                  const labels = { helmet: 'Helmet', chestplate: 'Chestplate', leggings: 'Leggings', boots: 'Boots' };
                  const isMatchHeld = held !== null && ITEMS[held.id]?.armorSlot === slot;

                  return (
                    <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        onClick={() => handleArmorSlotClick(slot)}
                        title={piece ? `${thingName(piece.id)} (Defense: +${ITEMS[piece.id]?.defense || 0})` : `Equip ${labels[slot]}`}
                        style={{
                          width: 42, height: 42,
                          background: piece ? 'rgba(30,55,65,0.9)' : isMatchHeld ? 'rgba(111,230,224,0.15)' : 'rgba(20,16,10,0.8)',
                          border: `1px solid ${piece ? '#6fe6e0' : isMatchHeld ? '#6fe6e0' : 'rgba(214,178,120,0.2)'}`,
                          borderRadius: 4,
                          display: 'grid', placeItems: 'center',
                          cursor: 'pointer',
                          position: 'relative',
                          boxShadow: piece ? '0 0 8px rgba(111,230,224,0.3)' : 'none',
                          transition: 'all .15s',
                        }}
                      >
                        {piece && piece.id ? (
                          <Swatch3D id={piece.id} />
                        ) : (
                          <span style={{ fontSize: 18, opacity: isMatchHeld ? 0.8 : 0.3 }}>{icons[slot]}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', fontSize: 10 }}>
                        <span style={{ fontWeight: 700, color: piece ? '#6fe6e0' : '#8a7a60' }}>
                          {piece ? thingName(piece.id) : `Empty ${labels[slot]}`}
                        </span>
                        {piece && (
                          <span style={{ fontSize: 8, color: '#8fd06a' }}>
                            +{ITEMS[piece.id]?.defense || 0} Def | Dur: {piece.durability || ITEMS[piece.id]?.durability || 100}
                          </span>
                        )}
                        {!piece && isMatchHeld && (
                          <span style={{ fontSize: 8, color: '#6fe6e0' }}>
                            Click to equip held armor
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ⛏️ ACQUIRED TOOLS & WEAPONS RACK */}
            <div style={{
              background: 'rgba(15, 12, 8, 0.85)',
              border: '1px solid rgba(242, 217, 160, 0.3)',
              borderRadius: 8,
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              minWidth: 220,
              maxHeight: 250,
              overflowY: 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(242, 217, 160, 0.2)', paddingBottom: 6 }}>
                <span style={{ fontSize: 10, letterSpacing: 1.5, color: '#f2d9a0', fontWeight: 700, textTransform: 'uppercase' }}>
                  ⛏️ TOOLS ACQUIRED ({acquiredTools.length})
                </span>
                <span style={{ fontSize: 9, color: '#8fd06a', fontWeight: 'bold' }}>
                  HAND: {hotbar[game.selected] > 0 ? thingName(hotbar[game.selected]) : 'Bare Hands'}
                </span>
              </div>

              {acquiredTools.length === 0 ? (
                <div style={{ fontSize: 10, color: '#8a7a60', fontStyle: 'italic', padding: '12px 0', textAlign: 'center' }}>
                  No tools acquired yet.<br />Craft a Wooden Pickaxe in the 3x3 grid!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {acquiredTools.map(({ id, count, def }) => {
                    const isCurrentlyHeld = hotbar[game.selected] === id;
                    const tierName = def.tier === 4 ? 'Diamond' : def.tier === 3 ? 'Iron' : def.tier === 2 ? 'Stone' : 'Wood';
                    const maxDur = [30, 60, 150, 500][(def.tier || 1) - 1] || 30;
                    const currentDur = toolDurability[id] !== undefined ? toolDurability[id] : maxDur;

                    return (
                      <div key={id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        background: isCurrentlyHeld ? 'rgba(242,217,160,0.15)' : 'rgba(25,20,14,0.6)',
                        border: `1px solid ${isCurrentlyHeld ? '#f2d9a0' : 'rgba(214,178,120,0.15)'}`,
                        borderRadius: 4, padding: '4px 8px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <SlotBox id={id} count={count} size={36} onClick={() => handleHoldTool(id)} />
                          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 10 }}>
                            <span style={{ fontWeight: 700, color: isCurrentlyHeld ? '#f2d9a0' : '#fff' }}>
                              {thingName(id)} {count > 1 ? `×${count}` : ''}
                            </span>
                            <span style={{ fontSize: 8, color: '#8fd06a' }}>
                              Tier {def.tier || 1} ({tierName}) | Dur: {currentDur}/{maxDur}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleHoldTool(id)}
                          style={{
                            fontFamily: 'inherit', fontSize: 8, fontWeight: 'bold',
                            color: isCurrentlyHeld ? '#000' : '#f2d9a0',
                            background: isCurrentlyHeld ? '#f2d9a0' : 'rgba(40,32,22,0.9)',
                            border: '1px solid rgba(214,178,120,0.3)',
                            borderRadius: 3, padding: '3px 7px', cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {isCurrentlyHeld ? '✋ Holding' : '⚡ Equip'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3×3 Grid */}
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: '#d6b278', opacity: .7, textTransform: 'uppercase', marginBottom: 10 }}>
                Crafting Grid
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 58px)', gap: 5 }}>
                {grid.map((id, idx) => (
                  <SlotBox
                    key={idx}
                    id={id}
                    count={id > 0 ? 1 : 0}
                    size={58}
                    onClick={() => handleGridClick(idx)}
                    onContextMenu={(e) => handleGridRightClick(e, idx)}
                    highlighted={held !== null && (id === 0 || id === held?.id)}
                    style={{ cursor: held ? 'crosshair' : (id > 0 ? 'pointer' : 'default') }}
                  />
                ))}
              </div>
              {/* Clear button */}
              <button onClick={clearGrid} style={{
                fontFamily: 'inherit', fontSize: 10, letterSpacing: 1,
                color: '#9a8a76', background: 'transparent',
                border: '1px solid rgba(214,178,120,0.15)',
                borderRadius: 4, padding: '5px 0', marginTop: 8,
                width: '100%', cursor: 'pointer',
                transition: 'color .1s, border-color .1s',
              }}
                onMouseEnter={e => { e.currentTarget.style.color = '#d6b278'; e.currentTarget.style.borderColor = 'rgba(214,178,120,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#9a8a76'; e.currentTarget.style.borderColor = 'rgba(214,178,120,0.15)'; }}
              >
                ↩ Clear Grid
              </button>
            </div>

            {/* Arrow */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                fontSize: 26,
                color: matchedRecipe ? '#f2d9a0' : 'rgba(214,178,120,0.25)',
                transition: 'color .2s',
                lineHeight: 1,
              }}>⟹</div>
              {matchedRecipe && (
                <div style={{ fontSize: 8, color: '#8fd06a', letterSpacing: 0.5, textAlign: 'center', maxWidth: 48 }}>
                  {matchedRecipe.name}
                </div>
              )}
            </div>

            {/* Output Slot */}
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: '#d6b278', opacity: .7, textTransform: 'uppercase', marginBottom: 10 }}>
                Result
              </div>
              <div
                onClick={handleCollectOutput}
                style={{
                  width: 70, height: 70,
                  background: outputId ? 'rgba(60,48,28,0.9)' : 'rgba(20,16,10,0.7)',
                  border: `2px solid ${outputId ? '#f2d9a0' : 'rgba(214,178,120,0.15)'}`,
                  borderRadius: 6,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: outputId ? 'pointer' : 'default',
                  boxShadow: outputId ? '0 0 0 1px #f2d9a0, 0 0 18px rgba(242,217,160,0.3), inset 0 0 12px rgba(242,217,160,0.08)' : 'none',
                  transition: 'all .2s',
                  position: 'relative',
                }}
              >
                {outputId > 0 && (
                  <>
                    <Swatch3D id={outputId} />
                    {outputQty > 1 && (
                      <span style={{
                        position: 'absolute', right: 4, bottom: 3,
                        fontSize: 12, fontWeight: 700,
                        color: '#f2d9a0', textShadow: '0 1px 2px #000',
                      }}>×{outputQty}</span>
                    )}
                    <div style={{ fontSize: 8, color: '#8fd06a', marginTop: 2, textAlign: 'center', padding: '0 4px' }}>
                      {thingName(outputId)}
                    </div>
                  </>
                )}
                {!outputId && (
                  <span style={{ fontSize: 22, opacity: 0.12 }}>□</span>
                )}
              </div>
              {outputId > 0 && (
                <div style={{ fontSize: 9, color: '#8fd06a', textAlign: 'center', marginTop: 6 }}>
                  Click to collect → Inventory
                </div>
              )}
            </div>
          </div>

          {/* ── SEPARATOR ── */}
          <div style={{ borderTop: '1px solid rgba(214,178,120,0.15)', marginTop: -4 }} />

          {/* ── EDITABLE HOTBAR ── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 10, letterSpacing: 2, color: '#f2d9a0', fontWeight: 700, textTransform: 'uppercase' }}>
                ⚡ EDITABLE HOTBAR (SLOTS 1–8)
              </span>
              <span style={{ fontSize: 9, color: '#c8b896', opacity: 0.8 }}>
                Click slot to place/swap held item, or press 1–8 while holding an item
              </span>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6,
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(214,178,120,0.25)',
              borderRadius: 8, padding: 8,
            }}>
              {hotbar.map((slotId, idx) => {
                const count = invCount(slotId);
                const isSelected = game.selected === idx;
                return (
                  <div key={idx} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ position: 'relative' }}>
                      <SlotBox
                        id={slotId}
                        count={count}
                        size={52}
                        onClick={() => handleHotbarSlotClick(idx)}
                        highlighted={isSelected || (held !== null && slotId === held?.id)}
                        style={{
                          borderColor: isSelected ? '#f2d9a0' : 'rgba(214,178,120,0.3)',
                          boxShadow: isSelected ? '0 0 0 2px #f2d9a0, 0 0 12px rgba(242,217,160,0.4)' : 'none',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{
                        position: 'absolute', left: 4, top: 2, fontSize: 10, fontWeight: 700,
                        color: '#d6b278', textShadow: '0 1px 2px #000', pointerEvents: 'none'
                      }}>{idx + 1}</span>
                    </div>
                    <div style={{ fontSize: 8, color: isSelected ? '#f2d9a0' : '#c8b896', textAlign: 'center', maxWidth: 54, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {slotId > 0 ? thingName(slotId) : 'Empty'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── SEPARATOR ── */}
          <div style={{ borderTop: '1px solid rgba(214,178,120,0.15)', marginTop: -4 }} />

          {/* ── BOTTOM: Inventory ── */}
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: '#d6b278', opacity: .7, textTransform: 'uppercase', marginBottom: 10 }}>
              Inventory — click an item to pick it up, then place into crafting grid or Hotbar
            </div>
            {playerItems.length === 0 ? (
              <div style={{ fontSize: 11, color: '#9a8a76', opacity: .7, padding: '12px 0' }}>
                Your inventory is empty. Go mine some blocks!
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))',
                gap: 5,
                maxHeight: 180,
                overflowY: 'auto',
                paddingRight: 4,
              }}>
                {playerItems.map(({ id, count }) => {
                  const isArmor = !!ITEMS[id]?.armorSlot;
                  return (
                    <div key={id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <SlotBox
                        id={id}
                        count={count}
                        size={52}
                        onClick={() => handlePickItem(id)}
                        highlighted={held?.id === id}
                        style={{ cursor: 'pointer' }}
                      />
                      <div style={{ fontSize: 8, color: '#c8b896', textAlign: 'center', maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {thingName(id)}
                      </div>
                      {isArmor && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleQuickEquip(id); }}
                          title="Quick Equip Armor"
                          style={{
                            fontSize: 8, color: '#6fe6e0', background: 'rgba(20,40,50,0.9)',
                            border: '1px solid rgba(111,230,224,0.6)', borderRadius: 3, padding: '1px 5px',
                            cursor: 'pointer', marginTop: 1, fontFamily: 'inherit', fontWeight: 'bold'
                          }}
                        >
                          🛡️ Equip
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Quick Reference ── */}
          <div style={{
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(214,178,120,0.1)',
            borderRadius: 6,
            padding: '10px 16px',
            fontSize: 10,
            color: '#9a8a76',
            lineHeight: 1.8,
          }}>
            <strong style={{ color: '#d6b278' }}>How to craft:</strong>
            &nbsp;1) Click an item in Inventory to pick it up. &nbsp;2) Click grid slots to place items. &nbsp;3) When a recipe matches, click the Result slot — the item goes straight to your Inventory.
            &nbsp;<em style={{ color: '#c8b896' }}>Press 1–8 while holding an item to assign it to a Hotbar slot. Right-click a grid slot to pick up 1 item.</em>
          </div>
        </div>
      </div>

      {/* Floating held-item indicator */}
      {held && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(20,15,10,0.95)',
          border: '1px solid #f2d9a0',
          borderRadius: 6, padding: '8px 18px',
          fontSize: 12, color: '#f2d9a0',
          pointerEvents: 'none',
          zIndex: 999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.6), 0 0 12px rgba(242,217,160,0.2)',
        }}>
          <Swatch3D id={held.id} />
          <strong>{thingName(held.id)}</strong>
          <span style={{ color: '#d6b278' }}>×{held.count}</span>
          <span style={{ color: '#9a8a76', fontSize: 10 }}>— click a Grid slot or Hotbar slot (1–8)</span>
        </div>
      )}
    </>
  );
}
