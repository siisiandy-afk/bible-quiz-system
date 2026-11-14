import React, { useState, useEffect } from 'react';
import './AdminLogin.css';
import { isSupabaseConfigured, authService } from '../services/supabase';

const MIN_PASSWORD_LENGTH = 6;

const MODAL_META = {
  signin: {
    title: 'Quiz Master Access',
    subtitleConfigured: 'Sign in with your Quiz Master credentials',
    submitConfigured: 'Sign In',
    busyLabel: 'Authenticating...',
  },
  forgot: {
    title: 'Reset Password',
    subtitleConfigured: 'Enter your Quiz Master email to receive a password reset link',
    submitConfigured: 'Send Reset Link',
    busyLabel: 'Sending...',
  },
  change: {
    title: 'Change Password',
    subtitleConfigured: 'Enter your current password and choose a new password',
    submitConfigured: 'Update Password',
    busyLabel: 'Updating...',
  },
  recovery: {
    title: 'Set New Password',
    subtitleConfigured: 'Choose a new password for your Quiz Master account',
    submitConfigured: 'Save New Password',
    busyLabel: 'Saving...',
  },
};

function validateNewPasswords(newPassword, confirmPassword, currentPassword) {
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (newPassword !== confirmPassword) {
    return 'New passwords do not match.';
  }
  if (currentPassword !== undefined && currentPassword === newPassword) {
    return 'New password must be different from your current password.';
  }
  return '';
}

export default function AdminLogin({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'signin',
  prefillEmail = '',
  keepSessionOnPasswordChange = false,
  onRecoveryComplete,
  currentUser = null,
  onSignOut,
}) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetSensitiveFields = () => {
    setPassword('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
  };

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setEmail(prefillEmail || currentUser?.email || '');
      setSuccessMsg('');
      setIsSubmitting(false);
      resetSensitiveFields();
    }
  }, [isOpen, initialMode, prefillEmail, currentUser]);

  if (!isOpen) return null;

  const activeMode = mode;
  const copy = MODAL_META[activeMode] || MODAL_META.signin;
  const isRecoveryOnly = initialMode === 'recovery' && activeMode === 'recovery';
  const showSuccessCloseOnly = keepSessionOnPasswordChange && activeMode === 'change' && Boolean(successMsg);

  const switchMode = (nextMode) => {
    resetSensitiveFields();
    setSuccessMsg('');
    setMode(nextMode);
  };

  const handleClose = () => {
    resetSensitiveFields();
    setEmail('');
    setSuccessMsg('');
    setIsSubmitting(false);
    onClose();
  };

  const handleSignInSubmit = async () => {
    if (currentUser) {
      onSuccess(currentUser);
      return;
    }

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
  };

  const handleForgotSubmit = async () => {
    if (!email.trim()) {
      setError('Please enter your Quiz Master email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: resetError } = await authService.resetPasswordForEmail(email.trim());
      setIsSubmitting(false);

      if (resetError) {
        setError(resetError.message || 'Could not send password reset email.');
        return;
      }

      setSuccessMsg(
        'Reset link sent! Check your email inbox and open the link to choose a new password.'
      );
    } catch (err) {
      setIsSubmitting(false);
      setError(err.message || 'Unexpected error requesting password reset.');
    }
  };

  const handleChangeSubmit = async () => {
    const cleanEmail = (prefillEmail || currentUser?.email || email).trim();
    if (!cleanEmail || !currentPassword) {
      setError('Please enter your email and current password.');
      return;
    }

    const validationErr = validateNewPasswords(newPassword, confirmPassword, currentPassword);
    if (validationErr) {
      setError(validationErr);
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: changeError } = await authService.changePassword({
        email: cleanEmail,
        currentPassword,
        newPassword,
      });

      if (changeError) {
        setIsSubmitting(false);
        setError(changeError.message || 'Failed to update password.');
        return;
      }

      if (!keepSessionOnPasswordChange) {
        await authService.signOut();
        if (onSignOut) onSignOut();
      }

      setIsSubmitting(false);
      resetSensitiveFields();

      if (keepSessionOnPasswordChange) {
        setSuccessMsg('Password updated successfully.');
      } else {
        setEmail(cleanEmail);
        setMode('signin');
        setSuccessMsg('Password updated! You can now sign in with your new password.');
      }
    } catch (err) {
      setIsSubmitting(false);
      setError(err.message || 'Unexpected error updating password.');
    }
  };

  const handleRecoverySubmit = async () => {
    const validationErr = validateNewPasswords(newPassword, confirmPassword);
    if (validationErr) {
      setError(validationErr);
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await authService.updatePassword({ newPassword });
      if (updateError) {
        setIsSubmitting(false);
        setError(updateError.message || 'Failed to set new password.');
        return;
      }

      await authService.signOut();
      if (onSignOut) onSignOut();
      if (onRecoveryComplete) onRecoveryComplete();

      setIsSubmitting(false);
      resetSensitiveFields();
      setMode('signin');
      setSuccessMsg('Password updated! Sign in below with your new password.');
    } catch (err) {
      setIsSubmitting(false);
      setError(err.message || 'Unexpected error saving new password.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!isSupabaseConfigured) {
      setError('Supabase authentication is not configured.');
      return;
    }

    if (activeMode === 'signin') return handleSignInSubmit();
    if (activeMode === 'forgot') return handleForgotSubmit();
    if (activeMode === 'change') return handleChangeSubmit();
    if (activeMode === 'recovery') return handleRecoverySubmit();
  };

  return (
    <div className="admin-modal-overlay" onClick={handleClose}>
      <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="admin-modal-title">
          {currentUser && activeMode === 'signin' ? 'Quiz Master Session' : copy.title}
        </h2>
        <p className="admin-modal-subtitle">
          {currentUser && activeMode === 'signin'
            ? `Signed in as ${currentUser.email}`
            : isSupabaseConfigured
            ? copy.subtitleConfigured
            : 'Configuration required'}
        </p>

        {!isSupabaseConfigured ? (
          <div className="admin-modal-notice admin-modal-error">
            <strong>Configuration Required:</strong> Supabase authentication is not configured. Add valid credentials to <code>.env</code> to enable Quiz Master access.
          </div>
        ) : (
          activeMode === 'signin' && (
            <div className="admin-modal-notice admin-modal-notice--configured">
              <strong>Supabase Auth Active:</strong> {currentUser ? `Signed in as ${currentUser.email}. Ready to initialize a competition room.` : 'Authenticating directly with Supabase. Only authorized Quiz Masters can create and administer competition rooms.'}
            </div>
          )
        )}

        {successMsg && <div className="admin-modal-success">{successMsg}</div>}

        <form onSubmit={handleSubmit}>
          {isSupabaseConfigured && (
            <>
              {activeMode === 'signin' && !currentUser && (
                <>
                  <input
                    type="email"
                    className="admin-modal-input"
                    placeholder="Quiz Master Email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                      setSuccessMsg('');
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
              )}

              {activeMode === 'forgot' && (
                <input
                  type="email"
                  className="admin-modal-input"
                  placeholder="Quiz Master Email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                    setSuccessMsg('');
                  }}
                  autoFocus
                />
              )}

              {activeMode === 'change' && (
                <>
                  <input
                    type="email"
                    className="admin-modal-input"
                    placeholder="Quiz Master Email"
                    value={email || currentUser?.email || ''}
                    readOnly={Boolean(currentUser?.email || prefillEmail)}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                      setSuccessMsg('');
                    }}
                    autoFocus={!currentUser?.email && !prefillEmail}
                  />
                  <input
                    type="password"
                    className="admin-modal-input"
                    placeholder="Current Password"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      setError('');
                      setSuccessMsg('');
                    }}
                    autoFocus={Boolean(currentUser?.email || prefillEmail)}
                  />
                </>
              )}

              {(activeMode === 'change' || activeMode === 'recovery') && (
                <>
                  <input
                    type="password"
                    className="admin-modal-input"
                    placeholder={`New Password (min ${MIN_PASSWORD_LENGTH} chars)`}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setError('');
                      setSuccessMsg('');
                    }}
                    autoFocus={activeMode === 'recovery'}
                  />
                  <input
                    type="password"
                    className="admin-modal-input"
                    placeholder="Confirm New Password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError('');
                      setSuccessMsg('');
                    }}
                  />
                </>
              )}
            </>
          )}

          {error && <div className="admin-modal-error">{error}</div>}

          <div className="admin-modal-actions">
            <button
              type="button"
              className="admin-modal-btn-cancel btn-push"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              {showSuccessCloseOnly ? 'Close' : 'Cancel'}
            </button>
            {!showSuccessCloseOnly && isSupabaseConfigured && (
              <button
                type="submit"
                className="admin-modal-btn-submit btn-push"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? copy.busyLabel
                  : currentUser && activeMode === 'signin'
                  ? 'Create Room'
                  : copy.submitConfigured}
              </button>
            )}
          </div>

          {isSupabaseConfigured && !keepSessionOnPasswordChange && !isRecoveryOnly && (
            <div className="admin-modal-links">
              {activeMode === 'signin' ? (
                <>
                  <button
                    type="button"
                    className="admin-modal-link-btn"
                    onClick={() => switchMode('change')}
                    disabled={isSubmitting}
                  >
                    Change Password
                  </button>
                  {currentUser ? (
                    <button
                      type="button"
                      className="admin-modal-link-btn"
                      onClick={async () => {
                        await authService.signOut();
                        if (onSignOut) onSignOut();
                      }}
                      disabled={isSubmitting}
                    >
                      Sign Out
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="admin-modal-link-btn"
                      onClick={() => switchMode('forgot')}
                      disabled={isSubmitting}
                    >
                      Forgot Password?
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  className="admin-modal-link-btn"
                  onClick={() => switchMode('signin')}
                  disabled={isSubmitting}
                >
                  Back to Sign In
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
