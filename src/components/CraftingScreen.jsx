import React, { useState, useCallback, useMemo } from 'react';
import { inventory, hotbar, game } from '../state.js';
import { RECIPES, BLOCKS, ITEMS, thingName, isPlaceable, resolveRecipe } from '../config.js';
import { invCount, addItem, removeItem } from '../player.js';
import { craft, scheduleSave } from '../ui.js';
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
  for (const rawId of Object.keys(inventory)) {
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
  // grid[0..8] = item ids placed in the 3x3 grid
  const [grid, setGrid] = useState([...EMPTY_GRID]);
  const [held, setHeld] = useState(null); // { id, count } — item on cursor

  // Build a "bag" from the grid for recipe matching
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

  // ── interactions ───────────────────────────────────────────────────────
  // Click an inventory item → pick it up (or add to held if same)
  const handlePickItem = useCallback((id) => {
    if (invCount(id) <= 0) return;
    if (held) {
      // put held back first (drop on empty space below), then pick new
      if (held.id === id) {
        const available = invCount(id);
        const take = Math.min(available, 64 - held.count);
        if (take > 0) {
          removeItem(id, take);
          setHeld({ id, count: held.count + take });
        }
      } else {
        // swap: put held back, pick new
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
      // Place held item into grid slot
      const newGrid = [...grid];
      if (slotId === 0) {
        // Empty slot → place 1
        newGrid[idx] = held.id;
        const newCount = held.count - 1;
        setHeld(newCount > 0 ? { id: held.id, count: newCount } : null);
      } else if (slotId === held.id) {
        // Same item → stack 1 more
        newGrid[idx] = held.id; // already there, just reduce held
        const newCount = held.count - 1;
        setHeld(newCount > 0 ? { id: held.id, count: newCount } : null);
      } else {
        // Different item → swap
        const displaced = slotId;
        newGrid[idx] = held.id;
        const newHeldCount = held.count - 1;
        addItem(displaced, 1);
        setHeld(newHeldCount > 0 ? { id: held.id, count: newHeldCount } : null);
      }
      setGrid(newGrid);
    } else if (slotId > 0) {
      // No held item → pick up from grid
      const newGrid = [...grid];
      newGrid[idx] = 0;
      setGrid(newGrid);
      setHeld({ id: slotId, count: 1 });
    }
  }, [held, grid]);

  // Right-click grid slot (split stack / remove 1) — handled via onContextMenu
  const handleGridRightClick = useCallback((e, idx) => {
    e.preventDefault();
    const slotId = grid[idx];
    if (held) {
      // Place 1 from held into slot
      if (slotId === 0 || slotId === held.id) {
        const newGrid = [...grid];
        newGrid[idx] = held.id;
        const newCount = held.count - 1;
        setHeld(newCount > 0 ? { id: held.id, count: newCount } : null);
        setGrid(newGrid);
      }
    } else if (slotId > 0) {
      // Pick up 1 from grid slot
      const newGrid = [...grid];
      newGrid[idx] = 0;
      setGrid(newGrid);
      setHeld({ id: slotId, count: 1 });
    }
  }, [held, grid]);

  // Click output slot → collect crafted item, consume grid inputs
  const handleCollectOutput = useCallback(() => {
    if (!matchedRecipe) return;
    if (held && held.id !== outputId) return; // can't merge different items
    if (held && held.count + outputQty > 64) return;

    // Consume exactly what the recipe needs from the grid
    const newGrid = [...grid];
    for (const rawId of Object.keys(matchedRecipe.in)) {
      const id = Number(rawId);
      let need = matchedRecipe.in[rawId];
      for (let i = 0; i < 9 && need > 0; i++) {
        if (newGrid[i] === id) { newGrid[i] = 0; need--; }
      }
    }
    setGrid(newGrid);

    if (held) {
      setHeld({ id: outputId, count: held.count + outputQty });
    } else {
      setHeld({ id: outputId, count: outputQty });
    }
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
      const oldId = currentSlotId;
      hotbar[idx] = held.id;
      if (oldId > 0 && oldId !== held.id && invCount(oldId) > 0) {
        const cnt = Math.min(invCount(oldId), 64);
        removeItem(oldId, cnt);
        setHeld({ id: oldId, count: cnt });
      } else {
        addItem(held.id, held.count);
        setHeld(null);
      }
    } else if (currentSlotId > 0) {
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

  // Keyboard shortcut listener (keys 1-8 to assign held item or selected item to hotbar slot)
  React.useEffect(() => {
    const handleKeyDown = (e) => {
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

  // Clear grid → return all items to inventory
  const clearGrid = useCallback(() => {
    for (const id of grid) {
      if (id > 0) addItem(id, 1);
    }
    setGrid([...EMPTY_GRID]);
  }, [grid]);

  // Close: return held + grid to inventory
  const handleClose = useCallback(() => {
    if (held) addItem(held.id, held.count);
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
            🔨 INVENTORY & CRAFTING
          </span>
          {held && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#f2d9a0' }}>
              <Swatch3D id={held.id} />
              Holding: <strong>{thingName(held.id)} ×{held.count}</strong>
              <button onClick={handleReturnHeld} style={{
                fontFamily: 'inherit', fontSize: 10, color: '#d6b278',
                background: 'rgba(40,32,22,0.9)', border: '1px solid rgba(214,178,120,0.25)',
                borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
              }}>Return</button>
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

          {/* ── TOP: Grid + Output ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 28, justifyContent: 'center', flexWrap: 'wrap' }}>

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
                  Click to collect
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
                {playerItems.map(({ id, count }) => (
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
                  </div>
                ))}
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
            <strong style={{ color: '#d6b278' }}>How to manage hotbar &amp; craft:</strong>
            &nbsp;Click an item to pick it up → Click a Hotbar slot (1–8) or Crafting Grid slot to place/swap it.
            &nbsp;<em style={{ color: '#c8b896' }}>Or press number keys 1–8 while holding an item to assign it directly!</em>
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
          <span style={{ color: '#9a8a76', fontSize: 10 }}>— click Hotbar (1–8) or Crafting Grid</span>
        </div>
      )}
    </>
  );
}

