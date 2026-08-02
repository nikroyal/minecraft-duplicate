import React, { useState } from 'react';
import { acceptFriendRequest, declineFriendRequest } from '../firebase.js';
import { toast } from '../ui.js';

export default function NotificationCenterModal({ currentUser, friendRequests = [], roomInvites = [], onClose, onJoinRoom }) {
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState({});

  const handleAccept = async (req) => {
    setLoading(prev => ({ ...prev, [req.senderUid]: true }));
    const ok = await acceptFriendRequest(req.senderUid, req.senderEmail);
    if (ok) {
      toast(`💚 Accepted friend request from ${req.senderEmail}!`);
    } else {
      toast(`⚠️ Could not accept request.`);
    }
    setLoading(prev => ({ ...prev, [req.senderUid]: false }));
  };

  const handleDecline = async (req) => {
    await declineFriendRequest(req.senderUid);
    toast(`Declined request.`);
  };

  const totalCount = friendRequests.length + roomInvites.length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(20,24,30,0.98), rgba(10,12,16,0.99))',
        border: '2px solid var(--gold)', borderRadius: '16px',
        width: '540px', maxWidth: '95vw', padding: '24px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.8)', color: '#fff', textAlign: 'left',
        position: 'relative'
      }}>
        {/* Close Button */}
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
          🔔 Notification Center ({totalCount})
        </h2>
        <p style={{ color: '#aaa', fontSize: '11px', margin: '0 0 16px 0' }}>
          Manage your incoming friend requests and multiplayer room invitations.
        </p>

        {/* Tab Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            onClick={() => setActiveTab('all')}
            style={{
              padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', border: 'none', cursor: 'pointer',
              background: activeTab === 'all' ? 'var(--gold)' : 'rgba(255,255,255,0.1)',
              color: activeTab === 'all' ? '#000' : '#ccc'
            }}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setActiveTab('friends')}
            style={{
              padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', border: 'none', cursor: 'pointer',
              background: activeTab === 'friends' ? 'var(--gold)' : 'rgba(255,255,255,0.1)',
              color: activeTab === 'friends' ? '#000' : '#ccc'
            }}
          >
            📩 Friend Requests ({friendRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('invites')}
            style={{
              padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', border: 'none', cursor: 'pointer',
              background: activeTab === 'invites' ? 'var(--gold)' : 'rgba(255,255,255,0.1)',
              color: activeTab === 'invites' ? '#000' : '#ccc'
            }}
          >
            ✉️ Room Invites ({roomInvites.length})
          </button>
        </div>

        {/* List View */}
        <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {totalCount === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#888', fontSize: '12px' }}>
              🎉 You have no pending notifications right now.
            </div>
          ) : (
            <>
              {/* Friend Requests */}
              {(activeTab === 'all' || activeTab === 'friends') && friendRequests.map(req => (
                <div
                  key={req.id}
                  style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(214,178,120,0.3)',
                    borderRadius: '8px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--gold-bright)' }}>
                      📩 Incoming Friend Request
                    </div>
                    <div style={{ fontSize: '11px', color: '#fff', marginTop: '2px' }}>
                      <strong>{req.senderEmail}</strong> wants to be your friend!
                    </div>
                    <div style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>
                      {new Date(req.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      disabled={loading[req.senderUid]}
                      onClick={() => handleAccept(req)}
                      style={{
                        background: '#4cd964', color: '#000', border: 'none', padding: '6px 12px',
                        borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer'
                      }}
                    >
                      {loading[req.senderUid] ? '...' : 'Accept 💚'}
                    </button>
                    <button
                      onClick={() => handleDecline(req)}
                      style={{
                        background: 'rgba(255,255,255,0.1)', color: '#ccc', border: 'none', padding: '6px 10px',
                        borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer'
                      }}
                    >
                      Decline ✕
                    </button>
                  </div>
                </div>
              ))}

              {/* Room Invites */}
              {(activeTab === 'all' || activeTab === 'invites') && roomInvites.map(inv => (
                <div
                  key={inv.id}
                  style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(76,217,100,0.3)',
                    borderRadius: '8px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#4cd964' }}>
                      ✉️ Team Room Invitation
                    </div>
                    <div style={{ fontSize: '11px', color: '#fff', marginTop: '2px' }}>
                      <strong>{inv.senderEmail}</strong> invited you to <strong>{inv.roomName}</strong>
                    </div>
                    <div style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>
                      {new Date(inv.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      onJoinRoom(inv.roomId, inv.roomName);
                      onClose();
                    }}
                    style={{
                      background: '#4cd964', color: '#000', border: 'none', padding: '6px 14px',
                      borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer'
                    }}
                  >
                    Join Room 🚀
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: '20px', background: 'rgba(255,255,255,0.1)', color: '#fff',
            border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer'
          }}
        >
          Close Notification Center
        </button>
      </div>
    </div>
  );
}
