import React, { useState, useEffect } from 'react';
import { fetchAllUsersForMaster, sendRoomInvite, updateUserBio } from '../firebase.js';
import { game, player } from '../state.js';
import { toast } from '../ui.js';

export default function PlayerDirectoryModal({ currentUser, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [playersList, setPlayersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myBio, setMyBio] = useState('');
  const [editingBio, setEditingBio] = useState(false);

  useEffect(() => {
    fetchAllUsersForMaster()
      .then(list => {
        setPlayersList(list);
        const me = list.find(u => u.uid === currentUser?.uid);
        if (me && me.raw && me.raw.bio) setMyBio(me.raw.bio);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [currentUser]);

  const handleSaveBio = async () => {
    await updateUserBio(myBio);
    toast("Profile Bio updated!");
    setEditingBio(false);
  };

  const handleInvite = async (targetPlayer) => {
    if (!game.activeRoomId) {
      return toast("You must select or enter a Team Room to invite players!");
    }
    const roomName = game.activeRoomInfo?.name || 'Custom Room';
    const ok = await sendRoomInvite(targetPlayer.uid, game.activeRoomId, roomName);
    if (ok) {
      toast(`Sent invitation to ${targetPlayer.email}!`);
    } else {
      toast(`Failed to send invitation.`);
    }
  };

  const filtered = playersList.filter(p => {
    const q = searchQuery.toLowerCase();
    const emailMatch = p.email.toLowerCase().includes(q);
    const bioMatch = (p.raw?.bio || '').toLowerCase().includes(q);
    return emailMatch || bioMatch;
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    }}>
      <div style={{
        background: 'rgba(20,16,12,0.98)', border: '1px solid var(--gold)', borderRadius: '10px',
        width: '100%', maxWidth: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 12px 40px rgba(0,0,0,0.8)', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--slot-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '15px', color: 'var(--gold-bright)', fontWeight: 'bold' }}>🔍 Player Directory & Profiles</h2>
            <div style={{ fontSize: '10px', color: '#9a8a76', marginTop: '2px' }}>Search players, view account cards, and send room invites</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* My Profile Bio Bar */}
        <div style={{ padding: '12px 20px', background: 'rgba(214,178,120,0.06)', borderBottom: '1px solid var(--slot-line)', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--gold-bright)' }}>👤 My Account Bio</span>
            {!editingBio ? (
              <button onClick={() => setEditingBio(true)} style={{ background: 'transparent', border: 'none', color: 'var(--gold)', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>✏️ Edit Bio</button>
            ) : (
              <button onClick={handleSaveBio} style={{ background: 'var(--gold)', border: 'none', color: '#000', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold', padding: '2px 8px', borderRadius: '3px' }}>Save</button>
            )}
          </div>
          {!editingBio ? (
            <div style={{ fontSize: '10px', color: myBio ? '#ddd' : '#888', italic: !myBio }}>{myBio || 'No bio set. Click Edit Bio to add your status or specialization!'}</div>
          ) : (
            <input
              type="text"
              value={myBio}
              onChange={e => setMyBio(e.target.value)}
              placeholder="e.g. Castle Builder & Redstone Engineer"
              style={{ width: '100%', padding: '6px', fontSize: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: '#fff', borderRadius: '4px' }}
            />
          )}
        </div>

        {/* Search Bar */}
        <div style={{ padding: '12px 20px 8px 20px' }}>
          <input
            type="text"
            placeholder="Search players by name, email, or bio keywords..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: '#fff', fontSize: '11px' }}
          />
        </div>

        {/* Directory List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {loading ? (
            <div style={{ color: 'var(--gold)', fontSize: '11px', textAlign: 'center', padding: '20px' }}>Loading directory...</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: '11px', textAlign: 'center', padding: '20px' }}>No matching players found.</div>
          ) : (
            filtered.map(p => {
              const isMe = p.uid === currentUser?.uid;
              const bio = p.raw?.bio || 'No bio provided';
              const roleTag = p.role === 'master' || p.role === 'admin' ? '👑 Admin' : '👤 Player';
              
              return (
                <div key={p.uid} style={{
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                  padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left'
                }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(214,178,120,0.15)', border: '1px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                      👤
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff' }}>{p.email}</span>
                        <span style={{ fontSize: '8px', padding: '2px 5px', borderRadius: '3px', background: 'rgba(214,178,120,0.2)', color: 'var(--gold-bright)', fontWeight: 'bold' }}>{roleTag}</span>
                        {p.isOnline && <span style={{ fontSize: '8px', padding: '2px 5px', borderRadius: '3px', background: 'rgba(76,217,100,0.2)', color: '#4cd964', fontWeight: 'bold' }}>🟢 ONLINE</span>}
                      </div>
                      <div style={{ fontSize: '10px', color: '#aaa', marginTop: '2px' }}>{bio}</div>
                    </div>
                  </div>

                  {!isMe && (
                    <button
                      onClick={() => handleInvite(p)}
                      style={{
                        background: 'rgba(76,217,100,0.18)', border: '1px solid #4cd964', color: '#4cd964',
                        padding: '6px 12px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer'
                      }}
                    >
                      ✉️ Send Invite
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
