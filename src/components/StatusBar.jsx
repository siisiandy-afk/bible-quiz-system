import React from 'react';
import './StatusBar.css';

export default function StatusBar({ isOnline }) {
  const statusClass = isOnline ? 'status-bar--online' : 'status-bar--offline';

  return (
    <div id="status-bar" className={`status-bar ${statusClass}`}>
      {isOnline ? 'ONLINE' : 'OFFLINE'}
    </div>
  );
}
