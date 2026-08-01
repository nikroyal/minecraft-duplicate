import React, { useState } from 'react';
import { loginWithEmail, signupWithEmail } from '../firebase.js';

function formatAuthErrorMessage(err) {
  if (!err) return "An unknown error occurred. Please try again.";
  const code = (err.code || err.message || '').toLowerCase();

  if (code.includes('user-not-found') || code.includes('invalid-credential') || code.includes('wrong-password')) {
    return "⚠️ Account not found or password incorrect. Check your email & password, or click Register to create a new account!";
  }
  if (code.includes('invalid-email')) {
    return "⚠️ Please enter a valid email address (e.g. player@example.com).";
  }
  if (code.includes('email-already-in-use')) {
    return "⚠️ This email is already registered! Please click Sign In instead.";
  }
  if (code.includes('weak-password')) {
    return "⚠️ Password is too weak. Please use at least 6 characters.";
  }
  if (code.includes('network-request-failed')) {
    return "⚠️ Connection error. Please check your internet connection and try again.";
  }
  if (code.includes('too-many-requests')) {
    return "⚠️ Too many attempts. Please wait a moment before trying again.";
  }

  return err.message ? err.message.replace(/^Firebase:\s*/i, '').replace(/\(auth\/[a-z-]+\)\.?/i, '').trim() : "Authentication failed.";
}

export default function AuthCard({ authStatus }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(''), 7000);
  };

  const validateEmail = (val) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(val);
  };

  const handleSignIn = () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) return showError("Please enter both email and password.");
    if (!validateEmail(cleanEmail)) return showError("⚠️ Please enter a valid email format (e.g. player@example.com).");
    setLoading(true);
    loginWithEmail(cleanEmail, password)
      .catch(err => {
        showError(formatAuthErrorMessage(err));
      })
      .finally(() => setLoading(false));
  };

  const handleRegister = () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) return showError("Please enter both email and password.");
    if (!validateEmail(cleanEmail)) return showError("⚠️ Please enter a valid email format (e.g. player@example.com).");
    if (password.length < 6) return showError("Password must be at least 6 characters.");
    setLoading(true);
    signupWithEmail(cleanEmail, password)
      .catch(err => {
        showError(formatAuthErrorMessage(err));
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
