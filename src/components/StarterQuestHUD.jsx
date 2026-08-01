import React, { useState, useEffect } from 'react';
import { toast } from '../ui.js';

export const STARTER_QUESTS = [
  { id: 'logs', title: '🪵 Harvest Wood', desc: 'Punch trees to collect 4 Wood Planks', target: 4, icon: '🪵' },
  { id: 'crafting', title: '🛠️ Craft Worktable', desc: 'Open Crafting Menu [C] & make a Crafting Table', target: 1, icon: '🛠️' },
  { id: 'stone', title: '⛏️ Mine Cobblestone', desc: 'Mine 5 Stone blocks with a pickaxe', target: 5, icon: '⛏️' },
  { id: 'shelter', title: '🏠 Build Starter Shelter', desc: 'Place 10 solid blocks to build a basic house', target: 10, icon: '🏠' },
  { id: 'food', title: '🍎 Restore Hunger', desc: 'Eat any food item to restore health & stamina', target: 1, icon: '🍎' }
];

export default function StarterQuestHUD({ questState, onUpdateQuest }) {
  const [minimized, setMinimized] = useState(false);
  const [completedAnim, setCompletedAnim] = useState(null);

  const activeIndex = questState.currentIndex || 0;
  const currentQuest = STARTER_QUESTS[activeIndex];
  const isAllComplete = activeIndex >= STARTER_QUESTS.length;

  if (isAllComplete) {
    return (
      <div style={{
        position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 140, background: 'rgba(20, 30, 20, 0.88)', border: '1px solid #39ff14',
        borderRadius: '20px', padding: '6px 18px', color: '#39ff14',
        fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px',
        boxShadow: '0 4px 20px rgba(57, 255, 20, 0.3)', backdropFilter: 'blur(6px)'
      }}>
        <span>🎉 Master Builder Quest Completed! +50 Gold & Flame Trail Unlocked</span>
      </div>
    );
  }

  const currentProgress = questState.progress?.[currentQuest.id] || 0;
  const pct = Math.min(100, Math.floor((currentProgress / currentQuest.target) * 100));

  return (
    <div style={{
      position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 140, width: '360px', maxWidth: '92vw',
      background: 'rgba(16, 12, 8, 0.92)', border: '1px solid var(--gold)',
      borderRadius: '12px', padding: '10px 14px', color: '#fff',
      boxShadow: '0 8px 30px rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
      transition: 'all 0.3s ease'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '14px' }}>{currentQuest.icon}</span>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--gold-bright)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Starter Quest ({activeIndex + 1}/{STARTER_QUESTS.length})
          </span>
        </div>
        <button
          onClick={() => setMinimized(!minimized)}
          style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '11px' }}
        >
          {minimized ? '▼ Expand' : '▲ Hide'}
        </button>
      </div>

      {!minimized && (
        <>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff', marginBottom: '2px' }}>
            {currentQuest.title}
          </div>
          <div style={{ fontSize: '10px', color: '#bbb', marginBottom: '8px' }}>
            {currentQuest.desc}
          </div>

          {/* Progress Bar */}
          <div style={{
            background: 'rgba(255,255,255,0.1)', borderRadius: '6px', height: '8px',
            overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)', position: 'relative'
          }}>
            <div style={{
              width: `${pct}%`, height: '100%',
              background: 'linear-gradient(90deg, #d6b278, #ffd700)',
              borderRadius: '6px', transition: 'width 0.4s ease'
            }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '9px', color: 'var(--gold-bright)', fontWeight: 'bold' }}>
            <span>Progress: {currentProgress} / {currentQuest.target}</span>
            <span>{pct}%</span>
          </div>
        </>
      )}
    </div>
  );
}
