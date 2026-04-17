import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage({ onLoginSuccess }) {
  const { login, loading, error } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier.trim()) return alert('Employee ID atau Username wajib diisi');
    if (!password) return alert('Password wajib diisi');

    const success = await login(identifier.trim(), password);
    if (success && onLoginSuccess) onLoginSuccess();
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', minHeight: '550px',
      background: 'var(--bg-dark)'
    }}>
      <div className="glass-panel" style={{ width: '380px', padding: '2rem' }}>

        {/* Header */}
        <header style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏢</div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem', color: 'white' }}>PT Sahabat Sakinah Senter</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>AutoCall Dashboard — Unified SSO Login</p>
        </header>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>

          {/* Identifier (Employee ID / Username) */}
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Employee ID / Username
            </label>
            <input
              type="text"
              id="input-identifier"
              className="input-area"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="Masukkan ID / Username SSO"
              autoComplete="username"
              style={{ height: '40px', padding: '0 10px' }}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              SSO Password
            </label>
            <input
              type="password"
              id="input-password"
              className="input-area"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              style={{ height: '40px', padding: '0 10px' }}
            />
          </div>

          {/* Error Display */}
          {error && (
            <div style={{
              color: 'var(--color-error)', fontSize: '0.82rem', textAlign: 'center',
              background: 'rgba(239,68,68,0.1)', padding: '0.5rem 0.75rem',
              borderRadius: '6px', border: '1px solid rgba(239,68,68,0.2)'
            }}>
              {error}
            </div>
          )}

          <div style={{ textAlign: 'center', margin: '5px 0' }}>
             <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Akses khusus Tim IT (Login SSO)
             </p>
          </div>

          <button
            type="submit"
            id="btn-login"
            className="btn-primary"
            disabled={loading}
            style={{ marginTop: '0.25rem', justifyContent: 'center' }}
          >
            {loading ? 'Memproses...' : 'Masuk ke Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
