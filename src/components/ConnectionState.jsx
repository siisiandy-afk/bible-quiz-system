import React from 'react';
import './ConnectionState.css';

export default function ConnectionState({
  status, // 'connecting' | 'error'
  mode,   // 'host' | 'player' | 'display'
  roomCode,
  errorMessage,
  onRetry,
  onCancel,
}) {
  const isConnecting = status === 'connecting';

  let title = 'Connecting to Quiz Server...';
  if (isConnecting) {
    if (mode === 'host') title = 'Initializing Host Room...';
    else if (mode === 'player') title = 'Joining Quiz Room...';
    else if (mode === 'display') title = 'Opening Public Display...';
  } else {
    title = 'Connection Failed';
  }

  return (
    <div className="connection-state">
      <div
        className={`connection-state__card ${
          !isConnecting ? 'connection-state__card--error' : ''
        }`}
      >
        {isConnecting ? (
          <div className="connection-state__spinner" />
        ) : (
          <div className="connection-state__error-icon">!</div>
        )}

        <h2 className="connection-state__title">{title}</h2>

        {roomCode && (
          <div className="connection-state__room-badge">Room #{roomCode}</div>
        )}

        <p
          className={`connection-state__message ${
            !isConnecting ? 'connection-state__message--error' : ''
          }`}
        >
          {isConnecting
            ? 'Establishing real-time WebSocket connection to MQTT broker. Verifying network handshake...'
            : errorMessage ||
              'Unable to establish a connection with the quiz broker. Please check your network connection.'}
        </p>

        <div className="connection-state__disclaimer">
          {isConnecting
            ? 'Only verified WebSocket connections proceed to the interface. You will not be shown as connected until the handshake succeeds.'
            : 'Note: MQTT connection only verifies broker reachability. Full room validation and owner verification will be handled via Supabase in the backend phase.'}
        </div>

        <div className="connection-state__actions">
          <button
            type="button"
            className="connection-state__btn-cancel btn-push"
            onClick={onCancel}
          >
            {isConnecting ? 'Cancel' : 'Back to Setup'}
          </button>

          {!isConnecting && onRetry && (
            <button
              type="button"
              className="connection-state__btn-retry btn-push"
              onClick={onRetry}
            >
              Retry Connection
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
