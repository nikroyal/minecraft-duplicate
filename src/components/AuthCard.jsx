import React, { useState } from 'react';
import { loginWithEmail, signupWithEmail } from '../firebase.js';

export default function AuthCard({ authStatus }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(''), 6000);
  };

  const handleSignIn = () => {
    if (!email.trim() || !password) return showError("Please enter email and password.");
    setLoading(true);
    loginWithEmail(email.trim(), password)
      .catch(err => {
        showError(err.message);
      })
      .finally(() => setLoading(false));
  };

  const handleRegister = () => {
    if (!email.trim() || !password) return showError("Please enter email and password.");
    if (password.length < 6) return showError("Password must be at least 6 characters.");
    setLoading(true);
    signupWithEmail(email.trim(), password)
      .catch(err => {
        showError(err.message);
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="card" id="authCard">
      <h1>VOXEL</h1>
      <div className="tag">A TINY WORLD</div>
      <p style={{ marginBottom: '20px', fontSize: '11px', letterSpacing: '1px', color: 'var(--gold)', textTransform: 'uppercase' }}>
        AUTHENTICATION REQUIRED
      </p>

      <div className="cloud-panel" style={{ marginTop: 0 }}>
        <div className="cloud-title">🔑 Sign In or Create Account</div>
        <div className="cloud-input-group">
          <input
            id="authEmail"
            type="email"
            className="cloud-input"
            placeholder="Email Address"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={loading}
          />
          <input
            id="authPassword"
            type="password"
            className="cloud-input"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
            onKeyDown={e => {
              if (e.key === 'Enter' && !loading) handleSignIn();
            }}
          />
        </div>
        <div className="cloud-actions" style={{ marginTop: '15px', justifyContent: 'center', gap: '8px' }}>
          <button
            id="authSignInBtn"
            className="cloud-btn"
            disabled={loading}
            onClick={handleSignIn}
            style={{ flex: 1, padding: '10px' }}
          >
            {loading ? "Signing In..." : "Sign In"}
          </button>
          <button
            id="authRegisterBtn"
            className="cloud-btn secondary"
            disabled={loading}
            onClick={handleRegister}
            style={{ flex: 1, padding: '10px' }}
          >
            {loading ? "Registering..." : "Register"}
          </button>
        </div>
        {error && (
          <div id="cloudAuthError" style={{ color: '#ff9a86', fontSize: '10px', marginTop: '8px', lineHeight: 1.3, textAlign: 'center' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
