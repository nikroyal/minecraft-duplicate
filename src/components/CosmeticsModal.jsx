import React, { useState } from 'react';
import { toast } from '../ui.js';
import { game } from '../state.js';

export const COSMETIC_SKINS = [
  { id: 'steve', name: 'Classic Adventurer', icon: '👤', color: '#3b82f6', desc: 'Standard Minecraft Explorer' },
  { id: 'knight', name: 'Master Knight', icon: '🛡️', color: '#94a3b8', desc: 'Armored Royal Warrior' },
  { id: 'cyber', name: 'Cyber Neon Voxel', icon: '🤖', color: '#06b6d4', desc: 'Futuristic Grid Runner' },
  { id: 'dragon', name: 'Dragon Warden', icon: '🐉', color: '#dc2626', desc: 'Master of Mythic Beasts' },
  { id: 'crown', name: 'Golden Monarch', icon: '👑', color: '#eab308', desc: 'Royal Sovereign of Voxel Lands' }
];

export const PARTICLE_TRAILS = [
  { id: 'none', name: 'No Trail', icon: '🚫', desc: 'Default movement without trail particles' },
  { id: 'flame', name: '🔥 Flame Trail', icon: '🔥', desc: 'Emits fiery embers as you walk and jump' },
  { id: 'ender', name: '🌌 Ender Sparkles', icon: '🌌', desc: 'Purple void sparkles trail behind you' },
  { id: 'emerald', name: '💚 Emerald Glow', icon: '💚', desc: 'Bright green magic sparkles' },
  { id: 'rainbow', name: '🌈 Rainbow Aura', icon: '🌈', desc: 'Multi-colored spectrum trail' }
];

export default function CosmeticsModal({ onClose }) {
  const [selectedSkin, setSelectedSkin] = useState(game.cosmeticSkin || 'steve');
  const [selectedTrail, setSelectedTrail] = useState(game.particleTrail || 'flame');

  const handleApply = () => {
    game.cosmeticSkin = selectedSkin;
    game.particleTrail = selectedTrail;
    try {
      localStorage.setItem('voxel_cosmetic_skin', selectedSkin);
      localStorage.setItem('voxel_particle_trail', selectedTrail);
    } catch (e) {}
    toast(`✨ Cosmetics applied! Skin: ${selectedSkin}, Trail: ${selectedTrail}`);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(20,24,30,0.98), rgba(10,12,16,0.99))',
        border: '2px solid var(--gold)', borderRadius: '16px',
        width: '640px', maxWidth: '95vw', padding: '24px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.8)', color: '#fff', textAlign: 'left',
        position: 'relative'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
            fontSize: '18px', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer'
          }}
        >
          ✕
        </button>

        <h2 style={{ color: 'var(--gold-bright)', margin: '0 0 4px 0', fontSize: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          🎨 Character Wardrobe & Particle Trails
        </h2>
        <p style={{ color: '#aaa', fontSize: '11px', margin: '0 0 20px 0' }}>
          Customize your character's visual appearance and movement aura!
        </p>

        {/* Section 1: Character Skins */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--gold)', marginBottom: '8px', textTransform: 'uppercase' }}>
            Choose Character Skin
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
            {COSMETIC_SKINS.map(s => {
              const active = selectedSkin === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedSkin(s.id)}
                  style={{
                    background: active ? 'rgba(214,178,120,0.2)' : 'rgba(255,255,255,0.03)',
                    border: active ? '2px solid var(--gold-bright)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px', padding: '10px 6px', textAlign: 'center', cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '4px' }}>{s.icon}</div>
                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: active ? 'var(--gold-bright)' : '#fff' }}>{s.name}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2: Particle Trails */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--gold)', marginBottom: '8px', textTransform: 'uppercase' }}>
            Select Particle Trail Aura
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
            {PARTICLE_TRAILS.map(t => {
              const active = selectedTrail === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTrail(t.id)}
                  style={{
                    background: active ? 'rgba(214,178,120,0.2)' : 'rgba(255,255,255,0.03)',
                    border: active ? '2px solid var(--gold-bright)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px', padding: '10px 6px', textAlign: 'center', cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '4px' }}>{t.icon}</div>
                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: active ? 'var(--gold-bright)' : '#fff' }}>{t.name}</div>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleApply}
          style={{
            width: '100%', background: 'var(--gold)', color: '#000', border: 'none',
            padding: '12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px',
            cursor: 'pointer', boxShadow: '0 4px 15px rgba(214,178,120,0.3)'
          }}
        >
          ✨ Save & Equip Cosmetics
        </button>
      </div>
    </div>
  );
}
