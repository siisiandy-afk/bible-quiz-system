import React, { useState, useEffect } from 'react';
import './PublicDisplay.css';
import { playElectricBell, initAudio } from '../services/audio';

export default function PublicDisplay({ roomCode, mqttEvents, onExit }) {
  const [buzzList, setBuzzList] = useState([]);
  const [status, setStatus] = useState('LOCKED');

  useEffect(() => {
    if (!mqttEvents) return;
    const { type, payload } = mqttEvents;

    if (type === 'status') {
      setStatus(payload);
    } else if (type === 'reset') {
      setBuzzList([]);
      setStatus('LOCKED');
    } else if (type === 'buzz') {
      const name = payload;
      initAudio();
      playElectricBell(name);
      setBuzzList((prev) => {
        if (prev.some((item) => item.name === name)) return prev;
        return [
          ...prev,
          {
            name,
            rank: prev.length + 1,
          },
        ];
      });
    }
  }, [mqttEvents]);

  return (
    <div className="public-display">
      <div className="public-display__header">
        <div>
          <div className="public-display__room-title">Room Code</div>
          <div className="public-display__room-code">{roomCode}</div>
        </div>

        <div
          className={`public-display__status-badge ${
            status === 'OPEN'
              ? 'public-display__status-badge--open'
              : 'public-display__status-badge--locked'
          }`}
        >
          {status === 'OPEN' ? '⚡ BUZZERS ACTIVE' : '🔒 LOCKED'}
        </div>

        <button
          type="button"
          onClick={onExit}
          className="public-display__exit-btn"
        >
          Exit
        </button>
      </div>

      <div className="public-display__board">
        {buzzList.length === 0 ? (
          <div className="public-display__empty">Waiting for contestants to buzz in...</div>
        ) : (
          buzzList.map((item) => {
            let rowClass = 'buzz-row--rank-other';
            let badgeClass = 'buzz-row__badge--other';
            let badgeText = `#${item.rank}`;

            if (item.rank === 1) {
              rowClass = 'buzz-row--rank-1';
              badgeClass = 'buzz-row__badge--1';
              badgeText = '1ST';
            } else if (item.rank === 2) {
              rowClass = 'buzz-row--rank-2';
              badgeClass = 'buzz-row__badge--2';
              badgeText = '2ND';
            } else if (item.rank === 3) {
              rowClass = 'buzz-row--rank-3';
              badgeClass = 'buzz-row__badge--3';
              badgeText = '3RD';
            }

            return (
              <div
                key={`${item.name}-${item.rank}`}
                className={`buzz-row fade-in ${rowClass}`}
              >
                <div className="buzz-row__content">
                  <span className={`buzz-row__badge ${badgeClass}`}>
                    {badgeText}
                  </span>
                  <span className="buzz-row__name">{item.name}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
