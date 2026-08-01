import React, { useState } from 'react';

export default function AdminHandbookModal({ onClose }) {
  const [activeSection, setActiveSection] = useState('overview');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0, 0, 0, 0.88)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(24,18,12,0.99), rgba(12,10,8,0.99))',
        border: '2px solid var(--gold)', borderRadius: '16px',
        width: '740px', maxWidth: '95vw', maxHeight: '88vh', padding: '24px',
        boxShadow: '0 16px 50px rgba(214,178,120,0.3)', color: '#fff', textAlign: 'left',
        position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
          <div>
            <h2 style={{ color: 'var(--gold-bright)', margin: 0, fontSize: '22px', letterSpacing: '1px', textTransform: 'uppercase' }}>
              📜 Master Admin Command Manual
            </h2>
            <div style={{ color: '#aaa', fontSize: '11px', marginTop: '2px' }}>
              Official Operations & Moderation Handbook for Voxel Ecosystem Administrators
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
              fontSize: '18px', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {/* Navigation Section Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', flexShrink: 0 }}>
          {[
            { id: 'overview', label: '📖 Overview' },
            { id: 'moderation', label: '🛡️ Moderation & Freeze' },
            { id: 'teleport', label: '📍 Teleport & Health' },
            { id: 'inventory', label: '🎁 Item Gifting' },
            { id: 'broadcast', label: '📢 Server Broadcasts' },
            { id: 'surveillance', label: '💬 Chat Oversight' },
            { id: 'anticheat', label: '🔒 Anti-Cheat' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', border: 'none', cursor: 'pointer',
                background: activeSection === tab.id ? 'var(--gold)' : 'rgba(255,255,255,0.08)',
                color: activeSection === tab.id ? '#000' : '#ccc'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '6px', lineHeight: 1.6, fontSize: '12px', color: '#ddd' }}>
          {activeSection === 'overview' && (
            <div>
              <h3 style={{ color: 'var(--gold-bright)', marginTop: 0 }}>1. Master Admin Privileges</h3>
              <p>As a Master Administrator, you possess full administrative governance over the Voxel Ecosystem. The Master Dashboard gives you live command over player states, room instances, real-time chat surveillance, global broadcasts, and server time.</p>
              <div style={{ background: 'rgba(214,178,120,0.1)', borderLeft: '4px solid var(--gold)', padding: '10px 14px', borderRadius: '4px', margin: '12px 0' }}>
                💡 <strong>Key Responsibility:</strong> Use your moderation capabilities responsibly to maintain a safe, welcoming, and fair environment for all players.
              </div>
            </div>
          )}

          {activeSection === 'moderation' && (
            <div>
              <h3 style={{ color: 'var(--gold-bright)', marginTop: 0 }}>2. Player Governance & Freeze Powers</h3>
              <p>You can freeze or unfreeze any online or offline player in real time:</p>
              <ul>
                <li><strong>🧊 Freeze Player:</strong> Locks the player in position, disabling their movement inputs and interactions while keeping them connected.</li>
                <li><strong>👑 Promote / Demote Role:</strong> Toggle a user between <code>player</code> and <code>admin</code> roles in Firestore.</li>
                <li><strong>🕵️ Stealth Room Surveillance:</strong> Spectate any active public or private team room without triggering presence alerts.</li>
              </ul>
            </div>
          )}

          {activeSection === 'teleport' && (
            <div>
              <h3 style={{ color: 'var(--gold-bright)', marginTop: 0 }}>3. Teleportation & Health Restores</h3>
              <p>Administrative commands for player positioning and emergency support:</p>
              <ul>
                <li><strong>📍 Teleport to Coordinates:</strong> Send a <code>teleportTarget</code> signal (X, Y, Z) to any player. The client instantly teleports to the designated position.</li>
                <li><strong>❤️ Restore Health:</strong> Set a target player's health to maximum (20 HP) and clear their <code>dead</code> flag if they have perished.</li>
              </ul>
            </div>
          )}

          {activeSection === 'inventory' && (
            <div>
              <h3 style={{ color: 'var(--gold-bright)', marginTop: 0 }}>4. Item Gifting & Resource Management</h3>
              <p>Directly inject items into any target player's active inventory:</p>
              <ul>
                <li>Specify item ID (e.g. <code>106</code> for Diamonds, <code>108</code> for Iron Sword, <code>7</code> for Wood Planks) and count.</li>
                <li>Items are pushed to the player's <code>inventoryAdditions</code> queue and auto-stacked into their inventory with a notification toast.</li>
              </ul>
            </div>
          )}

          {activeSection === 'broadcast' && (
            <div>
              <h3 style={{ color: 'var(--gold-bright)', marginTop: 0 }}>5. Server Broadcast Announcements</h3>
              <p>Publish server-wide banner broadcasts to all connected players across all singleplayer and room instances simultaneously:</p>
              <ul>
                <li>Broadcast messages appear as glowing golden top banners on every active player's screen in real time.</li>
                <li>Useful for event announcements, scheduled server maintenance, or community milestones.</li>
              </ul>
            </div>
          )}

          {activeSection === 'surveillance' && (
            <div>
              <h3 style={{ color: 'var(--gold-bright)', marginTop: 0 }}>6. Real-Time Chat Surveillance Stream</h3>
              <p>All conversations across the Voxel Ecosystem are visible to administrators in the <strong>💬 All Chats Stream</strong> tab:</p>
              <ul>
                <li><strong>Global Chat:</strong> View all public world chat messages.</li>
                <li><strong>Team Rooms:</strong> Monitor chat activity inside custom multiplayer rooms.</li>
                <li><strong>Direct Messages:</strong> Inspect private 1-on-1 player chat channels for moderation and safety.</li>
              </ul>
            </div>
          )}

          {activeSection === 'anticheat' && (
            <div>
              <h3 style={{ color: 'var(--gold-bright)', marginTop: 0 }}>7. Anti-Cheat Engine & Security Controls</h3>
              <p>The automated Anti-Cheat Shield protects the ecosystem against client tampering:</p>
              <ul>
                <li><strong>Frozen Registries:</strong> <code>BLOCKS</code>, <code>ITEMS</code>, and <code>RECIPES</code> are frozen in memory at boot.</li>
                <li><strong>Speed & Health Throttling:</strong> Speeds &gt; 35 block/s and health &gt; 100 HP are automatically clamped.</li>
                <li><strong>Input Sanitization:</strong> All chat and bio inputs are sanitized to strip XSS payloads.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: '16px', background: 'rgba(255,255,255,0.1)', color: '#fff',
            border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', flexShrink: 0
          }}
        >
          Close Handbook
        </button>
      </div>
    </div>
  );
}
