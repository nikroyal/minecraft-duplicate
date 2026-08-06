import React, { useState, useEffect } from 'react';
import { capturedErrors, subscribeErrors, clearCapturedErrors } from '../errorLog.js';

export default function ErrorConsoleModal({ onClose }) {
  const [errors, setErrors] = useState([...capturedErrors]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return subscribeErrors((latest) => {
      setErrors([...latest]);
    });
  }, []);

  const handleCopy = () => {
    if (errors.length === 0) return;
    const text = errors.map(e => `[${e.timestamp}] [${e.source}] ${e.message}\n${e.stack ? e.stack + '\n' : ''}`).join('\n---\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      userSelect: 'text',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '750px',
        maxHeight: '85vh',
        background: '#12100d',
        border: '1px solid #ff4d4d',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(255, 77, 77, 0.25)',
        overflow: 'hidden',
        color: '#f0e6cc',
        fontFamily: 'monospace',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          background: 'rgba(255, 77, 77, 0.12)',
          borderBottom: '1px solid rgba(255, 77, 77, 0.3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>🐞</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#ff4d4d', letterSpacing: '1px' }}>
                IN-GAME ERROR CONSOLE ({errors.length})
              </div>
              <div style={{ fontSize: '10px', color: '#aaa' }}>
                Press F9 or ` ~ ` anytime to toggle mid-game
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleCopy}
              disabled={errors.length === 0}
              style={{
                background: copied ? '#39ff14' : '#ff4d4d',
                color: copied ? '#000' : '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {copied ? '✓ COPIED TO CLIPBOARD' : '📋 COPY ERRORS FOR AI'}
            </button>

            <button
              onClick={clearCapturedErrors}
              disabled={errors.length === 0}
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#ccc',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              🧹 CLEAR
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              ✕ CLOSE
            </button>
          </div>
        </div>

        {/* Error List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          background: '#0a0907',
        }}>
          {errors.length === 0 ? (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: '#39ff14',
              fontSize: '13px',
              fontWeight: 'bold',
              background: 'rgba(57, 255, 20, 0.05)',
              borderRadius: '8px',
              border: '1px dashed rgba(57, 255, 20, 0.3)',
            }}>
              ✓ No runtime or UI errors detected! Game is running smoothly.
            </div>
          ) : (
            errors.map((item) => (
              <div
                key={item.id}
                style={{
                  background: 'rgba(255, 77, 77, 0.08)',
                  border: '1px solid rgba(255, 77, 77, 0.3)',
                  borderRadius: '6px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#ff8888' }}>
                  <span>SOURCE: {item.source}</span>
                  <span>{item.timestamp}</span>
                </div>

                <div style={{ fontSize: '12px', color: '#ffaaaa', fontWeight: 700, wordBreak: 'break-word' }}>
                  {item.message}
                </div>

                {item.stack && (
                  <pre style={{
                    margin: 0,
                    padding: '8px',
                    background: 'rgba(0,0,0,0.6)',
                    borderRadius: '4px',
                    fontSize: '10px',
                    color: '#888',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {item.stack}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
