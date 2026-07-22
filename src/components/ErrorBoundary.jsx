import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("UI ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
          background: 'rgba(180, 40, 40, 0.95)', border: '1px solid #ff7777',
          color: '#fff', padding: '12px 18px', borderRadius: 8, fontSize: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          ⚠️ UI Component Error recovered.
          <button 
            onClick={() => this.setState({ hasError: false })}
            style={{ marginLeft: 12, background: '#fff', color: '#000', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Dismiss
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
