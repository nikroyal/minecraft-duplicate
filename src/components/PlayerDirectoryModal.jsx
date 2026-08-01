import React, { useState, useEffect } from 'react';
import { 
  fetchAllUsersForMaster, sendRoomInvite, updateUserBio, createTeamRoom,
  sendFriendRequest, acceptFriendRequest, declineFriendRequest, removeFriend, subscribeToUserFriends
} from '../firebase.js';
import { game } from '../state.js';
import { toast } from '../ui.js';

export default function PlayerDirectoryModal({ currentUser, onClose }) {
  const [activeTab, setActiveTab] = useState('directory'); // 'directory' or 'friends'
  const [searchQuery, setSearchQuery] = useState('');
  const [playersList, setPlayersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myBio, setMyBio] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [invitingState, setInvitingState] = useState({}); // { [uid]: 'sending' | 'sent' }

  // Friends state
  const [friendsData, setFriendsData] = useState({ friends: [], friendRequests: [] });
  const [friendActionLoading, setFriendActionLoading] = useState({});

  useEffect(() => {
    fetchAllUsersForMaster()
      .then(list => {
        setPlayersList(list || []);
        const me = (list || []).find(u => u.uid === currentUser?.uid);
        if (me && me.raw && me.raw.bio) setMyBio(me.raw.bio);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;
    const unsub = subscribeToUserFriends(currentUser.uid, (data) => {
      setFriendsData(data);
    });
    return () => unsub();
  }, [currentUser]);

  const handleSaveBio = async () => {
    await updateUserBio(myBio);
    toast("Profile Bio updated!");
    setEditingBio(false);
  };

  const handleInvite = async (targetPlayer) => {
    let roomId = game.activeRoomId;
    let roomName = game.activeRoomInfo?.name || 'Voxel Team Room';

    // If player is not in an active room, auto-create a personal Team Room so invite works seamlessly!
    if (!roomId) {
      toast("🚀 Creating a Team Room for your invite...");
      const createdId = await createTeamRoom(`${currentUser?.email?.split('@')[0] || 'Player'}'s Room`, 'Custom Team Room', false);
      if (createdId) {
        game.mode = 'room';
        game.activeRoomId = createdId;
        game.activeRoomInfo = { id: createdId, name: `${currentUser?.email?.split('@')[0] || 'Player'}'s Room` };
        roomId = createdId;
        roomName = `${currentUser?.email?.split('@')[0] || 'Player'}'s Room`;
      } else {
        return toast("⚠️ Could not create Team Room for invite.");
      }
    }

    setInvitingState(prev => ({ ...prev, [targetPlayer.uid]: 'sending' }));

    const ok = await sendRoomInvite(targetPlayer.uid, roomId, roomName);
    if (ok) {
      toast(`✉️ Sent room invite to ${targetPlayer.email}!`);
      setInvitingState(prev => ({ ...prev, [targetPlayer.uid]: 'sent' }));
      setTimeout(() => {
        setInvitingState(prev => ({ ...prev, [targetPlayer.uid]: null }));
      }, 4000);
    } else {
      toast(`⚠️ Could not send invite to ${targetPlayer.email}. (Rate limit active)`);
      setInvitingState(prev => ({ ...prev, [targetPlayer.uid]: null }));
    }
  };

  const handleAddFriend = async (targetPlayer) => {
    setFriendActionLoading(prev => ({ ...prev, [targetPlayer.uid]: true }));
    const res = await sendFriendRequest(targetPlayer.uid, targetPlayer.email);
    toast(res.msg);
    setFriendActionLoading(prev => ({ ...prev, [targetPlayer.uid]: false }));
  };

  const handleAcceptFriend = async (req) => {
    setFriendActionLoading(prev => ({ ...prev, [req.senderUid]: true }));
    const ok = await acceptFriendRequest(req.senderUid, req.senderEmail);
    if (ok) {
      toast(`💚 Accepted friend request from ${req.senderEmail}!`);
    } else {
      toast(`⚠️ Failed to accept request.`);
    }
    setFriendActionLoading(prev => ({ ...prev, [req.senderUid]: false }));
  };

  const handleDeclineFriend = async (req) => {
    await declineFriendRequest(req.senderUid);
    toast(`Declined request.`);
  };

  const handleRemoveFriendClick = async (friendUid, friendEmail) => {
    if (confirm(`Remove ${friendEmail} from your friends list?`)) {
      await removeFriend(friendUid);
      toast(`Removed ${friendEmail} from friends.`);
    }
  };

  const myFriendUids = new Set(friendsData.friends.map(f => f.uid));

  const filteredDirectory = playersList.filter(p => {
    const q = searchQuery.toLowerCase();
    const emailMatch = p.email.toLowerCase().includes(q);
    const bioMatch = (p.raw?.bio || '').toLowerCase().includes(q);
    return emailMatch || bioMatch;
  });

  const filteredFriends = friendsData.friends.filter(f => {
    const q = searchQuery.toLowerCase();
    return f.email.toLowerCase().includes(q);
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    }}>
      <div style={{
        background: 'rgba(20,16,12,0.98)', border: '2px solid var(--gold)', borderRadius: '12px',
        width: '100%', maxWidth: '640px', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 15px 50px rgba(0,0,0,0.9)', overflow: 'hidden', color: '#f0e6d2'
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--slot-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', color: 'var(--gold-bright)', fontWeight: 'bold' }}>
              👥 SOCIAL NETWORK & PLAYER DIRECTORY
            </h2>
            <div style={{ fontSize: '10px', color: '#9a8a76', marginTop: '2px' }}>
              Search accounts, manage friends list, and send room invitations
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* My Profile Bio Bar */}
        <div style={{ padding: '10px 20px', background: 'rgba(214,178,120,0.06)', borderBottom: '1px solid var(--slot-line)', textAlign: 'left', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--gold-bright)' }}>👤 My Account Bio</span>
            {!editingBio ? (
              <button onClick={() => setEditingBio(true)} style={{ background: 'transparent', border: 'none', color: 'var(--gold)', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>✏️ Edit Bio</button>
            ) : (
              <button onClick={handleSaveBio} style={{ background: 'var(--gold)', border: 'none', color: '#000', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold', padding: '2px 8px', borderRadius: '3px' }}>Save</button>
            )}
          </div>
          {!editingBio ? (
            <div style={{ fontSize: '10px', color: myBio ? '#ddd' : '#888', fontStyle: !myBio ? 'italic' : 'normal' }}>
              {myBio || 'No bio set. Click Edit Bio to set your status!'}
            </div>
          ) : (
            <input
              type="text"
              value={myBio}
              onChange={e => setMyBio(e.target.value)}
              placeholder="e.g. Master Castle Builder & Redstone Engineer"
              style={{ width: '100%', padding: '6px', fontSize: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: '#fff', borderRadius: '4px' }}
            />
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="dashboard-tabs" style={{ flexShrink: 0, padding: '10px 20px 0 20px', marginBottom: 0 }}>
          <button
            className={`dash-tab ${activeTab === 'directory' ? 'active' : ''}`}
            onClick={() => setActiveTab('directory')}
          >
            🔍 All Players ({playersList.length})
          </button>
          <button
            className={`dash-tab ${activeTab === 'friends' ? 'active' : ''}`}
            onClick={() => setActiveTab('friends')}
          >
            👥 Friends List ({friendsData.friends.length})
            {friendsData.friendRequests.length > 0 && (
              <span style={{ marginLeft: '6px', background: '#ff3b30', color: '#fff', fontSize: '9px', padding: '1px 5px', borderRadius: '8px', fontWeight: 'bold' }}>
                {friendsData.friendRequests.length} NEW
              </span>
            )}
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '10px 20px 6px 20px', flexShrink: 0 }}>
          <input
            type="text"
            placeholder={activeTab === 'directory' ? "🔍 Search players by name, email, or bio..." : "🔍 Search friends..."}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: '#fff', fontSize: '11px' }}
          />
        </div>

        {/* TAB 1: PLAYER DIRECTORY */}
        {activeTab === 'directory' && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {loading ? (
              <div style={{ color: 'var(--gold)', fontSize: '11px', textAlign: 'center', padding: '20px' }}>Loading directory...</div>
            ) : filteredDirectory.length === 0 ? (
              <div style={{ color: '#aaa', fontSize: '11px', textAlign: 'center', padding: '20px' }}>No matching players found.</div>
            ) : (
              filteredDirectory.map(p => {
                const isMe = p.uid === currentUser?.uid;
                const isFriend = myFriendUids.has(p.uid);
                const bio = p.raw?.bio || 'No bio provided';
                const roleTag = p.role === 'master' || p.role === 'admin' ? '👑 Admin' : '👤 Player';
                const inviteStatus = invitingState[p.uid];

                return (
                  <div key={p.uid} style={{
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                    padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left'
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
                          {isFriend && <span style={{ fontSize: '8px', padding: '2px 5px', borderRadius: '3px', background: 'rgba(57,255,20,0.2)', color: '#39ff14', fontWeight: 'bold' }}>💚 FRIEND</span>}
                        </div>
                        <div style={{ fontSize: '10px', color: '#aaa', marginTop: '2px' }}>{bio}</div>
                      </div>
                    </div>

                    {!isMe && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {!isFriend && (
                          <button
                            onClick={() => handleAddFriend(p)}
                            disabled={friendActionLoading[p.uid]}
                            style={{
                              background: 'rgba(214,178,120,0.15)', border: '1px solid var(--gold)', color: 'var(--gold-bright)',
                              padding: '6px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer'
                            }}
                          >
                            + Add Friend
                          </button>
                        )}
                        <button
                          onClick={() => handleInvite(p)}
                          disabled={inviteStatus === 'sending' || inviteStatus === 'sent'}
                          style={{
                            background: inviteStatus === 'sent' ? 'rgba(57,255,20,0.25)' : 'rgba(76,217,100,0.18)',
                            border: inviteStatus === 'sent' ? '1px solid #39ff14' : '1px solid #4cd964',
                            color: inviteStatus === 'sent' ? '#39ff14' : '#4cd964',
                            padding: '6px 12px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          {inviteStatus === 'sending' ? '⏳ Sending...' : inviteStatus === 'sent' ? '✓ Invited!' : '✉️ Send Room Invite'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: FRIENDS LIST & PENDING REQUESTS */}
        {activeTab === 'friends' && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
            
            {/* Incoming Requests Banner */}
            {friendsData.friendRequests.length > 0 && (
              <div style={{ background: 'rgba(214,178,120,0.1)', border: '1px solid var(--gold)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--gold-bright)', marginBottom: '8px' }}>
                  📩 Pending Incoming Friend Requests ({friendsData.friendRequests.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {friendsData.friendRequests.map(req => (
                    <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.4)', padding: '8px 10px', borderRadius: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#fff', fontWeight: 'bold' }}>👤 {req.senderEmail}</span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleAcceptFriend(req)}
                          disabled={friendActionLoading[req.senderUid]}
                          style={{ background: 'var(--gold)', color: '#000', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleDeclineFriend(req)}
                          style={{ background: 'rgba(255,255,255,0.1)', color: '#aaa', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* My Friends List */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--gold-bright)', marginBottom: '8px' }}>
                💚 My Friends ({filteredFriends.length})
              </div>

              {filteredFriends.length === 0 ? (
                <div style={{ color: '#aaa', fontSize: '11px', textAlign: 'center', padding: '20px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                  No friends added yet. Go to the "All Players" tab to add friends!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {filteredFriends.map(f => {
                    const matchPlayerObj = playersList.find(p => p.uid === f.uid);
                    const isOnline = matchPlayerObj?.isOnline;
                    const inviteStatus = invitingState[f.uid];

                    return (
                      <div key={f.uid} style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(214,178,120,0.2)', borderRadius: '6px',
                        padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <div style={{ fontSize: '18px' }}>👤</div>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {f.email}
                              {isOnline ? (
                                <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(76,217,100,0.2)', color: '#4cd964', fontWeight: 'bold' }}>🟢 ONLINE</span>
                              ) : (
                                <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', color: '#888' }}>OFFLINE</span>
                              )}
                            </div>
                            <div style={{ fontSize: '9px', color: '#aaa', marginTop: '2px' }}>
                              Added: {f.addedAt ? new Date(f.addedAt).toLocaleDateString() : 'Friend'}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            onClick={() => handleInvite(f)}
                            disabled={inviteStatus === 'sending' || inviteStatus === 'sent'}
                            style={{
                              background: inviteStatus === 'sent' ? 'rgba(57,255,20,0.25)' : 'rgba(76,217,100,0.18)',
                              border: inviteStatus === 'sent' ? '1px solid #39ff14' : '1px solid #4cd964',
                              color: inviteStatus === 'sent' ? '#39ff14' : '#4cd964',
                              padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer'
                            }}
                          >
                            {inviteStatus === 'sending' ? '⏳ Sending...' : inviteStatus === 'sent' ? '✓ Invited!' : '✉️ Invite to Room'}
                          </button>

                          <button
                            onClick={() => handleRemoveFriendClick(f.uid, f.email)}
                            style={{ background: 'rgba(255,60,60,0.15)', border: '1px solid #ff6666', color: '#ff9999', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
