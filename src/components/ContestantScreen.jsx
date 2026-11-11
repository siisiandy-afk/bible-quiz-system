import React, { useState, useEffect } from 'react';
import './ContestantScreen.css';
import { playElectricBell, initAudio } from '../services/audio';
import { publishMessage } from '../services/mqtt';
import { roomService } from '../services/supabase';

export default function ContestantScreen({ playerName, roomCode, onLeave, mqttEvents }) {
  const [buzzerState, setBuzzerState] = useState('WAITING'); // 'WAITING' | 'OPEN' | 'LOCKED' | 'BUZZED'

  useEffect(() => {
    if (!mqttEvents) return;
    const { type, payload } = mqttEvents;

    if (type === 'status') {
      if (payload === 'OPEN') {
        setBuzzerState('OPEN');
      } else if (payload === 'LOCKED') {
        setBuzzerState('LOCKED');
      }
    } else if (type === 'reset') {
      setBuzzerState('LOCKED');
    } else if (type === 'ping') {
      publishMessage(roomCode, 'pong', `${payload}|${playerName}`);
    }
  }, [mqttEvents, roomCode, playerName]);

  const handleBuzz = () => {
    if (buzzerState !== 'OPEN') return;
    initAudio();
    playElectricBell(playerName);
    publishMessage(roomCode, 'buzz', playerName);
    setBuzzerState('BUZZED');

    // Record in Supabase database for authoritative audit log
    roomService.recordBuzz(roomCode, playerName);
  };

  // Determine button styling and text based on state
  let btnClass = 'contestant-screen__buzzer-btn--locked';
  let textClass = 'contestant-screen__buzz-text--locked';
  let btnText = 'WAIT';
  let isDisabled = true;
  let statusText = 'Waiting for Quiz Master...';
  let statusClass = 'contestant-screen__status--waiting';

  if (buzzerState === 'LOCKED') {
    btnClass = 'contestant-screen__buzzer-btn--locked';
    textClass = 'contestant-screen__buzz-text--locked';
    btnText = 'LOCKED';
    isDisabled = true;
    statusText = 'Eyes on host...';
    statusClass = 'contestant-screen__status--locked';
  } else if (buzzerState === 'OPEN') {
    btnClass = 'contestant-screen__buzzer-btn--open';
    textClass = 'contestant-screen__buzz-text--open';
    btnText = 'BUZZ!';
    isDisabled = false;
    statusText = 'GO! TAP NOW!';
    statusClass = 'contestant-screen__status--open';
  } else if (buzzerState === 'BUZZED') {
    btnClass = 'contestant-screen__buzzer-btn--buzzed';
    textClass = 'contestant-screen__buzz-text--buzzed';
    btnText = 'SENT';
    isDisabled = true;
    statusText = 'Buzz Recorded!';
    statusClass = 'contestant-screen__status--buzzed';
  }

  return (
    <div id="screen-player" className="contestant-screen">
      <div className="contestant-screen__header">
        <span id="player-display-name">{playerName}</span>
        <span id="player-room-code">Room {roomCode}</span>
      </div>

      <div className="contestant-screen__buzzer-container">
        <button
          id="btn-buzz"
          type="button"
          onClick={handleBuzz}
          disabled={isDisabled}
          className={`contestant-screen__buzzer-btn ${btnClass}`}
        >
          <span
            id="buzz-text"
            className={`contestant-screen__buzz-text ${textClass}`}
          >
            {btnText}
          </span>
        </button>
      </div>

      <div
        id="player-status"
        className={`contestant-screen__status ${statusClass}`}
      >
        {statusText}
      </div>

      <button
        type="button"
        onClick={onLeave}
        className="contestant-screen__leave-btn"
      >
        Leave Room
      </button>
    </div>
  );
}
