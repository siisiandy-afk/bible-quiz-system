import React, { useState } from 'react';
import './AdminLogin.css';
import { isSupabaseConfigured, authService } from '../services/supabase';

// Demo PIN from original vanilla application (fallback when Supabase is not connected)
const DEMO_ADMIN_PIN = '1234';

export default function AdminLogin({ isOpen, onClose, onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isSupabaseConfigured) {
      if (!email.trim() || !password.trim()) {
        setError('Please enter your Quiz Master email and password.');
        return;
      }

      setIsSubmitting(true);
      try {
        const { data, error: authError } = await authService.signInWithEmail({
          email: email.trim(),
          password: password.trim(),
        });

        if (authError) {
          setError(authError.message || 'Authentication failed. Please check credentials.');
          setIsSubmitting(false);
          return;
        }

        setIsSubmitting(false);
        setEmail('');
        setPassword('');
        onSuccess(data?.user || null);
      } catch (err) {
        setIsSubmitting(false);
        setError(err.message || 'Unexpected error during authentication.');
      }
    } else {
      // Demo PIN fallback
      if (pin === DEMO_ADMIN_PIN) {
        setError('');
        setPin('');
        onSuccess(null);
      } else {
        setError('Incorrect PIN. (Original Demo PIN is 1234)');
      }
    }
  };

  const handleClose = () => {
    setError('');
    setEmail('');
    setPassword('');
    setPin('');
    onClose();
  };

  return (
    <div className="admin-modal-overlay" onClick={handleClose}>
      <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="admin-modal-title">Quiz Master Access</h2>
        <p className="admin-modal-subtitle">
          {isSupabaseConfigured
            ? 'Sign in with your Quiz Master credentials'
            : 'Enter Quiz Master authorization PIN to initialize room'}
        </p>

        {isSupabaseConfigured ? (
          <div className="admin-modal-notice admin-modal-notice--configured">
            <strong>Supabase Auth Active:</strong> Authenticating directly with Supabase. Only authorized Quiz Masters can create and administer competition rooms.
          </div>
        ) : (
          <div className="admin-modal-notice">
            <strong>Security Notice:</strong> Demo PIN is <code>1234</code>. Supabase credentials are not yet configured in <code>.env</code>. This client PIN is a temporary placeholder and does not provide server security.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isSupabaseConfigured ? (
            <>
              <input
                type="email"
                className="admin-modal-input"
                placeholder="Quiz Master Email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                autoFocus
              />
              <input
                type="password"
                className="admin-modal-input"
                placeholder="Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
              />
            </>
          ) : (
            <input
              type="password"
              className="admin-modal-input admin-modal-input--pin"
              placeholder="PIN (Demo: 1234)"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setError('');
              }}
              autoFocus
            />
          )}

          {error && <div className="admin-modal-error">{error}</div>}

          <div className="admin-modal-actions">
            <button
              type="button"
              className="admin-modal-btn-cancel btn-push"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="admin-modal-btn-submit btn-push"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Authenticating...' : isSupabaseConfigured ? 'Sign In' : 'Authorize'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
