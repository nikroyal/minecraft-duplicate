import React, { useState, useEffect } from 'react';
import { capturedLogs, subscribeLogs, clearCapturedLogs, getSystemTelemetry } from '../errorLog.js';

export default function ErrorConsoleModal({ onClose }) {
  const [logs, setLogs] = useState([...capturedLogs]);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'error' | 'warn' | 'network' | 'telemetry'
  const [copied, setCopied] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    return subscribeLogs((latest) => {
      setLogs([...latest]);
    });
  }, []);

  const counts = {
    all: logs.length,
    error: logs.filter(l => l.type === 'error').length,
    warn: logs.filter(l => l.type === 'warn').length,
    network: logs.filter(l => l.type === 'network').length,
    telemetry: logs.filter(l => l.type === 'telemetry').length,
  };

  const filteredLogs = logs.filter(l => {
    if (activeTab === 'all') return true;
    return l.type === activeTab;
  });

  const handleCopyDiagnostics = () => {
    const sys = getSystemTelemetry();
    let report = `### 🐞 GAME DIAGNOSTICS & TELEMETRY REPORT\n`;
    report += `**Time**: ${new Date().toLocaleString()}\n`;
    report += `**UserAgent**: ${sys.userAgent || 'N/A'}\n`;
    report += `**Viewport**: ${sys.viewportWidth}x${sys.viewportHeight} (Ratio: ${sys.devicePixelRatio})\n`;
    report += `**Memory**: ${typeof sys.memory === 'object' ? `${sys.memory.usedJSHeapSize} / ${sys.memory.totalJSHeapSize}` : 'N/A'}\n`;
    report += `**Network**: ${sys.online ? 'Online 🟢' : 'Offline 🔴'}\n\n`;

    report += `### LOGS & STACK TRACES (${logs.length}):\n`;
    logs.forEach((l, idx) => {
      report += `${idx + 1}. [${l.timestamp}] [${l.type.toUpperCase()}] [${l.source}]: ${l.message}\n`;
      if (l.details) report += `   Details/Stack:\n${l.details.split('\n').map(line => '   ' + line).join('\n')}\n`;
    });

    navigator.clipboard.writeText(report).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const telemetryData = getSystemTelemetry();

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.80)',
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
        maxWidth: '850px',
        maxHeight: '88vh',
        background: '#100d0a',
        border: '1px solid rgba(242, 217, 160, 0.3)',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 36px rgba(0,0,0,0.8)',
        overflow: 'hidden',
        color: '#f0e6cc',
        fontFamily: 'monospace',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          background: 'rgba(30, 24, 18, 0.95)',
          borderBottom: '1px solid rgba(242, 217, 160, 0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🐞</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#f2d9a0', letterSpacing: '1px' }}>
                DEVTOOLS CONSOLE & SYSTEM TELEMETRY INSPECTOR
              </div>
              <div style={{ fontSize: '9px', color: '#a89880' }}>
                Press F9 or ` ~ ` anytime to toggle mid-game
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleCopyDiagnostics}
              style={{
                background: copied ? '#39ff14' : '#f2d9a0',
                color: '#000',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '10px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {copied ? '✓ DIAGNOSTICS COPIED!' : '📋 COPY FULL DIAGNOSTICS FOR AI'}
            </button>

            <button
              onClick={clearCapturedLogs}
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: '#ccc',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '10px',
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
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              ✕ CLOSE
            </button>
          </div>
        </div>

        {/* System Telemetry Quick Strip */}
        <div style={{
          background: 'rgba(20, 16, 12, 0.9)',
          borderBottom: '1px solid rgba(242, 217, 160, 0.15)',
          padding: '8px 20px',
          display: 'flex',
          gap: '16px',
          fontSize: '9px',
          color: '#c8b896',
          flexWrap: 'wrap',
        }}>
          <span>🌐 <strong>Status</strong>: {telemetryData.online ? 'Online 🟢' : 'Offline 🔴'}</span>
          <span>🖥️ <strong>Viewport</strong>: {telemetryData.viewportWidth}×{telemetryData.viewportHeight} (@{telemetryData.devicePixelRatio}x)</span>
          {typeof telemetryData.memory === 'object' && (
            <span>💾 <strong>Memory Heap</strong>: {telemetryData.memory.usedJSHeapSize} / {telemetryData.memory.totalJSHeapSize}</span>
          )}
        </div>

        {/* Tab Selector */}
        <div style={{
          display: 'flex',
          background: 'rgba(15, 12, 8, 0.9)',
          borderBottom: '1px solid rgba(242, 217, 160, 0.15)',
          padding: '0 20px',
          gap: '4px',
        }}>
          {[
            { key: 'all', label: 'ALL LOGS', count: counts.all, color: '#f2d9a0' },
            { key: 'error', label: 'ERRORS', count: counts.error, color: '#ff4d4d' },
            { key: 'warn', label: 'WARNINGS', count: counts.warn, color: '#ffb830' },
            { key: 'network', label: 'NETWORK', count: counts.network, color: '#3897f0' },
            { key: 'telemetry', label: 'TELEMETRY', count: counts.telemetry, color: '#39ff14' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                fontFamily: 'inherit',
                fontSize: '10px',
                fontWeight: activeTab === tab.key ? 800 : 400,
                color: activeTab === tab.key ? tab.color : '#8a7a60',
                background: activeTab === tab.key ? 'rgba(40,32,22,0.8)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Log Stream Area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          background: '#070605',
        }}>
          {filteredLogs.length === 0 ? (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: '#8a7a60',
              fontSize: '11px',
              fontStyle: 'italic',
            }}>
              No logs recorded in this category yet.
            </div>
          ) : (
            filteredLogs.map((item) => {
              const typeColors = {
                error: { bg: 'rgba(255, 77, 77, 0.1)', border: '#ff4d4d', tag: '🔴 ERROR' },
                warn: { bg: 'rgba(255, 184, 48, 0.1)', border: '#ffb830', tag: '⚠️ WARN' },
                info: { bg: 'rgba(214, 178, 120, 0.08)', border: '#d6b278', tag: 'ℹ️ INFO' },
                network: { bg: 'rgba(56, 151, 240, 0.1)', border: '#3897f0', tag: '🌐 NET' },
                telemetry: { bg: 'rgba(57, 255, 20, 0.1)', border: '#39ff14', tag: '📊 TELEMETRY' },
              };
              const styleConfig = typeColors[item.type] || typeColors.info;
              const isExpanded = expandedId === item.id;

              return (
                <div
                  key={item.id}
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  style={{
                    background: styleConfig.bg,
                    borderLeft: `3px solid ${styleConfig.border}`,
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                    borderRight: '1px solid rgba(255,255,255,0.05)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', opacity: 0.8 }}>
                    <span style={{ fontWeight: 'bold', color: styleConfig.border }}>{styleConfig.tag} • [{item.source}]</span>
                    <span>{item.timestamp}</span>
                  </div>

                  <div style={{ fontSize: '11px', color: '#f0e6cc', fontWeight: 600, wordBreak: 'break-word' }}>
                    {item.message}
                  </div>

                  {item.details && (
                    <div>
                      <div style={{ fontSize: '8px', color: '#a09075', marginTop: '2px' }}>
                        {isExpanded ? '▼ Hide Stack / Details' : '▶ Click to expand stack trace / details'}
                      </div>
                      {isExpanded && (
                        <pre style={{
                          margin: '6px 0 0 0',
                          padding: '8px',
                          background: 'rgba(0,0,0,0.7)',
                          borderRadius: '4px',
                          fontSize: '9px',
                          color: '#ccc',
                          overflowX: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}>
                          {item.details}
                        </pre>
                      )}
                    </div>
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
