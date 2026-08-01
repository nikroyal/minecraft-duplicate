import React, { useState, useEffect } from 'react';
import { toast } from '../ui.js';
import { inventory } from '../state.js';

export const DAILY_REWARDS = [
  { day: 1, title: 'Day 1 Starter Pack', items: '🍎 5 Apples + 🪵 10 Wood Planks', icon: '🍎', claimed: false },
  { day: 2, title: 'Day 2 Survival Kit', items: '🥩 5 Cooked Meat + 🕯️ 10 Torches', icon: '🥩', claimed: false },
  { day: 3, title: 'Day 3 Treasure Bag', items: '🪙 100 Gold Coins + 🪵 20 Planks', icon: '🪙', claimed: false },
  { day: 4, title: 'Day 4 Warrior Arsenal', items: '🗡️ 1 Iron Sword + 🛡️ Leather Vest', icon: '🗡️', claimed: false },
  { day: 5, title: 'Day 5 Diamond Cache', items: '💎 3 Diamonds + ⛏️ Iron Pickaxe', icon: '💎', claimed: false },
  { day: 6, title: 'Day 6 Alchemy Elixir', items: '🧪 Speed Potion & 🧪 Regeneration', icon: '🧪', claimed: false },
  { day: 7, title: 'Day 7 Grand Jackpot', items: '👑 Master Crown + 🔥 Flame Trail Cosmetic', icon: '👑', claimed: false }
];

export default function DailyLoginModal({ currentUser, onClose }) {
  const [streak, setStreak] = useState(1);
  const [claimedDays, setClaimedDays] = useState({});
  const [lastClaimedDate, setLastClaimedDate] = useState('');

  const todayStr = new Date().toDateString();

  useEffect(() => {
    try {
      const savedStreak = parseInt(localStorage.getItem('voxel_daily_streak') || '1', 10);
      const savedClaimed = JSON.parse(localStorage.getItem('voxel_daily_claimed') || '{}');
      const savedLastDate = localStorage.getItem('voxel_daily_last_claimed_date') || '';
      setStreak(savedStreak);
      setClaimedDays(savedClaimed);
      setLastClaimedDate(savedLastDate);
    } catch (e) {}
  }, []);

  const handleClaim = (day) => {
    if (claimedDays[day] || lastClaimedDate === todayStr) {
      return toast("⏳ You have already claimed today's reward! Come back tomorrow.");
    }

    const newClaimed = { ...claimedDays, [day]: true };
    setClaimedDays(newClaimed);
    setLastClaimedDate(todayStr);

    try {
      localStorage.setItem('voxel_daily_claimed', JSON.stringify(newClaimed));
      localStorage.setItem('voxel_daily_last_claimed_date', todayStr);
      const nextStreak = Math.min(7, day + 1);
      setStreak(nextStreak);
      localStorage.setItem('voxel_daily_streak', nextStreak.toString());
    } catch (e) {}

    // Give items in game state
    if (day === 1) { inventory[110] = (inventory[110] || 0) + 5; inventory[7] = (inventory[7] || 0) + 10; }
    else if (day === 2) { inventory[111] = (inventory[111] || 0) + 5; inventory[20] = (inventory[20] || 0) + 10; }
    else if (day === 3) { inventory[7] = (inventory[7] || 0) + 20; }
    else if (day === 4) { inventory[108] = (inventory[108] || 0) + 1; }
    else if (day === 5) { inventory[106] = (inventory[106] || 0) + 3; inventory[105] = (inventory[105] || 0) + 1; }
    else if (day === 6) { inventory[110] = (inventory[110] || 0) + 10; }
    else if (day === 7) { game.particleTrail = 'flame'; }

    toast(`🎁 Claimed Day ${day} Daily Reward! Check inventory!`);
  };

  const hasClaimedToday = lastClaimedDate === todayStr;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(26,20,15,0.98), rgba(12,10,8,0.99))',
        border: '2px solid var(--gold)', borderRadius: '16px',
        width: '680px', maxWidth: '95vw', padding: '24px',
        boxShadow: '0 12px 40px rgba(214,178,120,0.25)', color: '#fff', textAlign: 'center',
        position: 'relative'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
            fontSize: '18px', width: '32px', height: '32px', borderRadius: '50%',
            cursor: 'pointer'
          }}
        >
          ✕
        </button>

        <div style={{ fontSize: '28px', marginBottom: '4px' }}>🎁</div>
        <h2 style={{ color: 'var(--gold-bright)', margin: 0, fontSize: '22px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          7-Day Daily Login Streaks
        </h2>
        <p style={{ color: '#bbb', fontSize: '12px', margin: '6px 0 20px 0' }}>
          Log in every 24 hours to claim tools, diamonds, cosmetics, and rewards!
        </p>

        {/* 7-Day Grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '12px', marginBottom: '24px'
        }}>
          {DAILY_REWARDS.map(r => {
            const isClaimed = !!claimedDays[r.day];
            const isTodayTarget = r.day === streak;
            const isAvailable = isTodayTarget && !isClaimed && !hasClaimedToday;

            return (
              <div
                key={r.day}
                style={{
                  background: isClaimed
                    ? 'rgba(76,217,100,0.1)'
                    : isAvailable
                    ? 'rgba(214,178,120,0.18)'
                    : 'rgba(255,255,255,0.03)',
                  border: isClaimed
                    ? '1px solid #4cd964'
                    : isAvailable
                    ? '2px solid var(--gold-bright)'
                    : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px', padding: '12px 8px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: '10px', fontWeight: 'bold', color: isAvailable ? 'var(--gold-bright)' : '#888', textTransform: 'uppercase' }}>
                  Day {r.day}
                </div>
                <div style={{ fontSize: '30px', margin: '8px 0' }}>{r.icon}</div>
                <div style={{ fontSize: '10px', color: '#ccc', marginBottom: '10px', minHeight: '28px' }}>
                  {r.items}
                </div>

                <button
                  onClick={() => handleClaim(r.day)}
                  disabled={!isAvailable}
                  style={{
                    width: '100%', padding: '6px 0', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold',
                    border: 'none', cursor: isAvailable ? 'pointer' : 'default',
                    background: isClaimed
                      ? '#4cd964'
                      : isAvailable
                      ? 'var(--gold-bright)'
                      : 'rgba(255,255,255,0.1)',
                    color: isClaimed || isAvailable ? '#000' : '#666'
                  }}
                >
                  {isClaimed ? '✓ Claimed' : isAvailable ? '🎁 Claim Now' : isTodayTarget && hasClaimedToday ? '⏳ Tomorrow' : '🔒 Locked'}
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'var(--gold)', color: '#000', border: 'none',
            padding: '10px 28px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          Continue Playing
        </button>
      </div>
    </div>
  );
}
