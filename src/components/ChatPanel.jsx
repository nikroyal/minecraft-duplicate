import React, { useState, useEffect, useRef } from 'react';
import { 
  createOrGetDirectChat, sendChatMessage, subscribeToUserChats, subscribeToChatMessages,
  fetchAllUsersForMaster, subscribeToUserFriends
} from '../firebase.js';
import { toast } from '../ui.js';

export default function ChatPanel({ currentUser, isSidePanel = false, onClose, initialTargetUser = null }) {
  const [chatsList, setChatsList] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  // New Chat modal state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatTab, setNewChatTab] = useState('friends'); // 'friends' or 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [friendsData, setFriendsData] = useState({ friends: [], friendRequests: [] });
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  const messagesEndRef = useRef(null);

  // Auto-scroll messages to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Subscribe to user chats list
  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;
    const unsub = subscribeToUserChats(currentUser.uid, (list) => {
      setChatsList(list);
      if (!activeChatId && list.length > 0) {
        setActiveChatId(list[0].id);
      }
    });
    return () => unsub();
  }, [currentUser]);

  // Subscribe to active chat messages
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    const unsub = subscribeToChatMessages(activeChatId, (msgs) => {
      setMessages(msgs);
      setTimeout(scrollToBottom, 80);
    });
    return () => unsub();
  }, [activeChatId]);

  // Handle initial target user if passed from external button
  useEffect(() => {
    if (initialTargetUser && initialTargetUser.uid) {
      handleStartDirectChat(initialTargetUser.uid, initialTargetUser.email);
    }
  }, [initialTargetUser]);

  // Load directory and friends when opening New Chat modal
  useEffect(() => {
    if (!showNewChatModal || !currentUser) return;
    setLoadingDirectory(true);

    fetchAllUsersForMaster()
      .then(list => setAllUsers(list || []))
      .catch(err => console.error(err))
      .finally(() => setLoadingDirectory(false));

    const unsubFriends = subscribeToUserFriends(currentUser.uid, (data) => {
      setFriendsData(data);
    });

    return () => unsubFriends();
  }, [showNewChatModal, currentUser]);

  const handleStartDirectChat = async (targetUid, targetEmail) => {
    if (!targetUid) return;
    const id = await createOrGetDirectChat(targetUid, targetEmail);
    if (id) {
      setActiveChatId(id);
      setShowNewChatModal(false);
      toast(`💬 Chat opened with ${targetEmail}!`);
    } else {
      toast(`⚠️ Could not open chat.`);
    }
  };

  const handleSendMessage = async () => {
    if (!activeChatId || !inputText.trim()) return;
    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);

    const ok = await sendChatMessage(activeChatId, textToSend);
    setSending(false);
    if (!ok) {
      toast("⚠️ Failed to send message.");
    }
  };

  const activeChat = chatsList.find(c => c.id === activeChatId);

  // Get display details for recipient in active chat
  const getOtherParticipantEmail = (chat) => {
    if (!chat || !currentUser) return 'Chat';
    if (chat.participantEmails) {
      const otherUid = (chat.participants || []).find(uid => uid !== currentUser.uid);
      if (otherUid && chat.participantEmails[otherUid]) return chat.participantEmails[otherUid];
    }
    return 'Player Chat';
  };

  const recipientEmail = activeChat ? getOtherParticipantEmail(activeChat) : 'Select a Chat';

  // Filter directory and friends for New Chat modal
  const filteredFriends = friendsData.friends.filter(f => {
    const q = searchQuery.toLowerCase();
    return f.email.toLowerCase().includes(q);
  });

  const filteredAllUsers = allUsers.filter(u => {
    if (u.uid === currentUser?.uid) return false;
    const q = searchQuery.toLowerCase();
    return u.email.toLowerCase().includes(q) || (u.raw?.bio || '').toLowerCase().includes(q);
  });

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', width: '100%',
      background: isSidePanel ? 'rgba(14, 11, 8, 0.96)' : 'rgba(20, 16, 12, 0.98)',
      border: isSidePanel ? '2px solid var(--gold)' : '1px solid var(--slot-line)',
      borderRadius: isSidePanel ? '12px' : '8px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.85)',
      color: '#f0e6d2', overflow: 'hidden', boxSizing: 'border-box'
    }}>
      {/* ── HEADER BAR ── */}
      <div style={{
        padding: '10px 14px', background: 'rgba(30, 22, 14, 0.95)',
        borderBottom: '1px solid var(--slot-line)', display: 'flex',
        justify: 'space-between', alignItems: 'center', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>💬</span>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--gold-bright)' }}>
              {isSidePanel ? 'IN-GAME CHAT' : 'COMMUNITY CHAT HUB'}
            </div>
            <div style={{ fontSize: '9px', color: '#a09075' }}>
              {activeChat ? `With: ${recipientEmail}` : 'Select or start a conversation'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            onClick={() => setShowNewChatModal(true)}
            style={{
              background: 'rgba(214,178,120,0.2)', border: '1px solid var(--gold)', color: 'var(--gold-bright)',
              padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer'
            }}
          >
            + New Chat
          </button>
          {isSidePanel && onClose && (
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '16px', cursor: 'pointer', padding: '2px 6px' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── MAIN BODY CONTAINER (CONVERSATIONS LIST + MESSAGES VIEW) ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        
        {/* ── CONVERSATIONS LIST (LEFT DRAWER / TAB) ── */}
        <div style={{
          width: isSidePanel ? '130px' : '200px', flexShrink: 0,
          borderRight: '1px solid var(--slot-line)', background: 'rgba(0,0,0,0.3)',
          display: 'flex', flexDirection: 'column', overflowY: 'auto'
        }}>
          <div style={{ padding: '6px 10px', fontSize: '9px', fontWeight: 'bold', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            Recent ({chatsList.length})
          </div>

          {chatsList.length === 0 ? (
            <div style={{ padding: '16px 8px', fontSize: '9px', color: '#888', textAlign: 'center' }}>
              No chats yet. Click "+ New Chat" to start!
            </div>
          ) : (
            chatsList.map(chat => {
              const isSelected = chat.id === activeChatId;
              const titleEmail = getOtherParticipantEmail(chat);
              const lastMsgText = chat.lastMessage?.text || 'No messages';

              return (
                <div
                  key={chat.id}
                  onClick={() => setActiveChatId(chat.id)}
                  style={{
                    padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer', textAlign: 'left',
                    background: isSelected ? 'rgba(214,178,120,0.2)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--gold)' : '3px solid transparent'
                  }}
                >
                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: isSelected ? 'var(--gold-bright)' : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    👤 {titleEmail.split('@')[0]}
                  </div>
                  <div style={{ fontSize: '8px', color: '#aaa', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {lastMsgText}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── MESSAGES HISTORY & INPUT BOX (RIGHT AREA) ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'rgba(0,0,0,0.2)' }}>
          
          {/* Active Chat Target Header */}
          {activeChat && (
            <div style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '10px', fontWeight: 'bold', color: '#d8caae', textAlign: 'left' }}>
              💬 Chatting with <span style={{ color: 'var(--gold-bright)' }}>{recipientEmail}</span>
            </div>
          )}

          {/* Messages Scroll View */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {!activeChatId ? (
              <div style={{ color: '#aaa', fontSize: '11px', textAlign: 'center', marginTop: '40px' }}>
                Select a conversation from the left or click "+ New Chat" to start messaging!
              </div>
            ) : messages.length === 0 ? (
              <div style={{ color: '#888', fontSize: '10px', textAlign: 'center', marginTop: '30px' }}>
                No messages in this chat yet. Say hello! 👋
              </div>
            ) : (
              messages.map(msg => {
                const isMe = msg.senderUid === currentUser?.uid;
                const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: isMe ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <div style={{ fontSize: '8px', color: '#999', marginBottom: '2px' }}>
                      {isMe ? 'You' : msg.senderEmail} • {timeStr}
                    </div>
                    <div style={{
                      maxWidth: '82%', padding: '7px 11px', borderRadius: '8px',
                      fontSize: '11px', lineHeight: '1.4', textAlign: 'left', wordBreak: 'break-word',
                      background: isMe ? 'rgba(214,178,120,0.25)' : 'rgba(255,255,255,0.08)',
                      border: isMe ? '1px solid var(--gold)' : '1px solid rgba(255,255,255,0.12)',
                      color: isMe ? '#fff' : '#eee'
                    }}>
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input Box */}
          <div style={{ padding: '8px 10px', background: 'rgba(30, 22, 14, 0.95)', borderTop: '1px solid var(--slot-line)', display: 'flex', gap: '6px' }}>
            <input
              type="text"
              placeholder={activeChatId ? "Type a message..." : "Select a chat to type..."}
              disabled={!activeChatId || sending}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
              style={{
                flex: 1, padding: '7px 10px', borderRadius: '4px',
                background: 'rgba(0,0,0,0.5)', border: '1px solid var(--slot-line)',
                color: '#fff', fontSize: '11px', outline: 'none'
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!activeChatId || !inputText.trim() || sending}
              style={{
                padding: '7px 14px', background: 'var(--gold)', color: '#000',
                border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                cursor: 'pointer', opacity: (!activeChatId || !inputText.trim()) ? 0.5 : 1
              }}
            >
              Send
            </button>
          </div>

        </div>

      </div>

      {/* ── NEW CHAT MODAL OVERLAY ── */}
      {showNewChatModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'rgba(20,16,12,0.98)', border: '2px solid var(--gold)', borderRadius: '10px',
            width: '100%', maxWidth: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 15px 50px rgba(0,0,0,0.9)', overflow: 'hidden', color: '#f0e6d2'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--slot-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--gold-bright)' }}>
                ➕ Start a New Chat
              </div>
              <button onClick={() => setShowNewChatModal(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Selector Tabs */}
            <div className="dashboard-tabs" style={{ padding: '8px 16px 0 16px', marginBottom: 0 }}>
              <button
                className={`dash-tab ${newChatTab === 'friends' ? 'active' : ''}`}
                onClick={() => setNewChatTab('friends')}
              >
                👥 My Friends ({friendsData.friends.length})
              </button>
              <button
                className={`dash-tab ${newChatTab === 'all' ? 'active' : ''}`}
                onClick={() => setNewChatTab('all')}
              >
                🔍 All Players ({allUsers.length})
              </button>
            </div>

            {/* Search Input */}
            <div style={{ padding: '10px 16px 6px 16px' }}>
              <input
                type="text"
                placeholder={newChatTab === 'friends' ? "Search friends..." : "Search all players by email or bio..."}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--slot-line)', color: '#fff', fontSize: '11px' }}
              />
            </div>

            {/* List View */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 16px 16px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {loadingDirectory ? (
                <div style={{ color: 'var(--gold)', fontSize: '11px', textAlign: 'center', padding: '20px' }}>Loading player directory...</div>
              ) : newChatTab === 'friends' ? (
                filteredFriends.length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: '11px', textAlign: 'center', padding: '20px' }}>No matching friends found.</div>
                ) : (
                  filteredFriends.map(f => (
                    <div
                      key={f.uid}
                      style={{
                        padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}
                    >
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff' }}>💚 {f.email}</span>
                      <button
                        onClick={() => handleStartDirectChat(f.uid, f.email)}
                        style={{ background: 'var(--gold)', color: '#000', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        💬 Chat Now
                      </button>
                    </div>
                  ))
                )
              ) : (
                filteredAllUsers.length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: '11px', textAlign: 'center', padding: '20px' }}>No players found matching filter.</div>
                ) : (
                  filteredAllUsers.map(u => (
                    <div
                      key={u.uid}
                      style={{
                        padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff' }}>👤 {u.email}</div>
                        <div style={{ fontSize: '9px', color: '#aaa' }}>{u.raw?.bio || 'Player'}</div>
                      </div>
                      <button
                        onClick={() => handleStartDirectChat(u.uid, u.email)}
                        style={{ background: 'var(--gold)', color: '#000', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        💬 Chat Now
                      </button>
                    </div>
                  ))
                )
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
