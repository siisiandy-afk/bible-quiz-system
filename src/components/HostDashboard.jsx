import React, { useState, useEffect, useRef } from 'react';
import './HostDashboard.css';
import {
  initAudio,
  enableAudio,
  playElectricBell,
  playTimeUpSound,
  playDisconnectSound,
} from '../services/audio';
import { publishMessage } from '../services/mqtt';
import { roomService } from '../services/supabase';

export default function HostDashboard({ roomCode, onExit, onOpenDisplay, mqttEvents }) {
  const [audioOverlayVisible, setAudioOverlayVisible] = useState(true);
  const [timerDisplay, setTimerDisplay] = useState('--');
  const [timerWarning, setTimerWarning] = useState(false);
  const [timerBlink, setTimerBlink] = useState(false);
  const [gameMode, setGameMode] = useState('standard');
  const [isLocked, setIsLocked] = useState(true);
  const [buzzList, setBuzzList] = useState([]);
  const [connectedPlayers, setConnectedPlayers] = useState(new Map());
  const [notification, setNotification] = useState({ text: '', type: '' });

  const timerIntervalRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const roundStartTimeRef = useRef(0);
  const notifTimeoutRef = useRef(null);
  const buzzesRef = useRef([]);
  const isLockedRef = useRef(true);
  const gameModeRef = useRef('standard');

  // Keep refs in sync for message handlers
  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

  useEffect(() => {
    gameModeRef.current = gameMode;
  }, [gameMode]);

  // Handle Audio Overlay
  const handleEnableAudio = () => {
    enableAudio();
    setAudioOverlayVisible(false);
  };

  // Notification helper
  const showNotification = (text, type = 'success') => {
    if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
    setNotification({ text, type });
    notifTimeoutRef.current = setTimeout(() => {
      setNotification({ text: '', type: '' });
    }, 3000);
  };

  // Start ping interval
  useEffect(() => {
    pingIntervalRef.current = setInterval(() => {
      publishMessage(roomCode, 'ping', Date.now().toString());
    }, 3000);

    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
    };
  }, [roomCode]);

  // Listen to incoming MQTT events dispatched by parent
  useEffect(() => {
    if (!mqttEvents) return;
    const { type, payload } = mqttEvents;

    if (type === 'buzz') {
      const name = payload;
      if (isLockedRef.current) return;
      if (buzzesRef.current.includes(name)) return;

      playElectricBell(name);
      buzzesRef.current = [...buzzesRef.current, name];

      let diffStr = '';
      if (roundStartTimeRef.current > 0) {
        const diff = ((Date.now() - roundStartTimeRef.current) / 1000).toFixed(3);
        diffStr = `+${diff}s`;
      }

      setConnectedPlayers((prev) => {
        const lat = prev.get(name) || 0;
        setBuzzList((prevList) => [
          ...prevList,
          {
            name,
            rank: prevList.length + 1,
            timeDiff: diffStr,
            latency: lat,
          },
        ]);
        return prev;
      });
    } else if (type === 'join') {
      const name = payload;
      setConnectedPlayers((prev) => {
        if (!prev.has(name)) {
          const updated = new Map(prev);
          updated.set(name, 0);
          playElectricBell(name);
          showNotification(`${name} joined!`, 'success');
          return updated;
        }
        return prev;
      });
    } else if (type === 'leave') {
      const name = payload;
      setConnectedPlayers((prev) => {
        if (prev.has(name)) {
          const updated = new Map(prev);
          updated.delete(name);
          playDisconnectSound();
          showNotification(`${name} left!`, 'danger');
          return updated;
        }
        return prev;
      });
    } else if (type === 'pong') {
      const parts = payload.split('|');
      if (parts.length >= 2) {
        const sentTime = parseInt(parts[0], 10);
        const pName = parts[1];
        const latency = Math.max(0, Date.now() - sentTime);
        setConnectedPlayers((prev) => {
          const updated = new Map(prev);
          updated.set(pName, latency);
          return updated;
        });
      }
    }
  }, [mqttEvents]);

  // Timer function
  const startTimer = (seconds) => {
    initAudio();
    buzzesRef.current = [];
    setBuzzList([]);
    publishMessage(roomCode, 'reset', 'TRUE');

    setIsLocked(false);
    roundStartTimeRef.current = Date.now();
    publishMessage(roomCode, 'status', 'OPEN');
    roomService.updateRoomStatus(roomCode, 'OPEN');

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    let timeLeft = seconds;
    setTimerDisplay(String(timeLeft));
    setTimerWarning(false);
    setTimerBlink(false);

    timerIntervalRef.current = setInterval(() => {
      timeLeft -= 1;
      setTimerDisplay(String(timeLeft));

      if (timeLeft <= 3 && timeLeft > 0) {
        setTimerWarning(true);
      }

      if (timeLeft <= 0) {
        clearInterval(timerIntervalRef.current);
        setTimerBlink(true);
        playTimeUpSound();
        setIsLocked(true);
        publishMessage(roomCode, 'status', 'LOCKED');
        roomService.updateRoomStatus(roomCode, 'LOCKED');
      }
    }, 1000);
  };

  // Lock / Unlock toggle
  const toggleLock = () => {
    initAudio();
    const nextLocked = !isLocked;
    setIsLocked(nextLocked);

    if (!nextLocked) {
      roundStartTimeRef.current = Date.now();
    }

    if (nextLocked && timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      setTimerDisplay('--');
      setTimerWarning(false);
      setTimerBlink(false);
    }

    publishMessage(roomCode, 'status', nextLocked ? 'LOCKED' : 'OPEN');
    roomService.updateRoomStatus(roomCode, nextLocked ? 'LOCKED' : 'OPEN');
  };

  // Reset board
  const resetBuzzers = () => {
    initAudio();
    buzzesRef.current = [];
    setBuzzList([]);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setTimerDisplay('--');
    setTimerWarning(false);
    setTimerBlink(false);

    publishMessage(roomCode, 'reset', 'TRUE');

    if (gameMode === 'speed') {
      setIsLocked(false);
      roundStartTimeRef.current = Date.now();
      publishMessage(roomCode, 'status', 'OPEN');
      roomService.updateRoomStatus(roomCode, 'OPEN');
    } else {
      setIsLocked(true);
      publishMessage(roomCode, 'status', 'LOCKED');
      roomService.updateRoomStatus(roomCode, 'LOCKED');
    }
  };

  // Mode switcher
  const handleModeChange = (mode) => {
    setGameMode(mode);
    if (mode === 'speed') {
      // Switch to speed race
      buzzesRef.current = [];
      setBuzzList([]);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setTimerDisplay('--');
      setTimerWarning(false);
      setTimerBlink(false);
      publishMessage(roomCode, 'reset', 'TRUE');
      setIsLocked(false);
      roundStartTimeRef.current = Date.now();
      publishMessage(roomCode, 'status', 'OPEN');
      roomService.updateRoomStatus(roomCode, 'OPEN');
    } else {
      // Standard mode
      buzzesRef.current = [];
      setBuzzList([]);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setTimerDisplay('--');
      setTimerWarning(false);
      setTimerBlink(false);
      publishMessage(roomCode, 'reset', 'TRUE');
      setIsLocked(true);
      publishMessage(roomCode, 'status', 'LOCKED');
      roomService.updateRoomStatus(roomCode, 'LOCKED');
    }
  };

  // Calculate average latency
  const playerLatencies = Array.from(connectedPlayers.values());
  const avgLatency =
    playerLatencies.length > 0
      ? Math.round(playerLatencies.reduce((a, b) => a + b, 0) / playerLatencies.length)
      : null;

  const latencyText =
    avgLatency !== null ? `${avgLatency}ms` : 'Checking...';

  const getSigClass = (latency) => {
    if (latency > 500) return 'sig-bad';
    if (latency > 200) return 'sig-fair';
    return 'sig-good';
  };

  return (
    <div id="screen-host" className="host-screen">
      {/* AUDIO ENABLER OVERLAY */}
      {audioOverlayVisible && (
        <div id="audio-enable-overlay" className="host-screen__audio-overlay">
          <button
            type="button"
            onClick={handleEnableAudio}
            className="host-screen__audio-btn"
          >
            🔊 CLICK HERE TO ENABLE SOUND
          </button>
          <p className="host-screen__audio-desc">Browser requires this permission</p>
        </div>
      )}

      {/* Header */}
      <div className="host-screen__header">
        <div>
          <div className="host-screen__label">Room</div>
          <div id="host-room-code" className="host-screen__room-code">
            {roomCode}
          </div>
        </div>

        <div
          id="timer-display"
          className={`host-screen__timer ${
            timerBlink
              ? 'blink-red'
              : timerWarning
              ? 'host-screen__timer--warning'
              : ''
          }`}
        >
          {timerDisplay}
        </div>

        <div className="host-screen__latency-block">
          <div className="host-screen__label">Latency</div>
          <div id="network-health" className="host-screen__latency-value">
            {latencyText}
          </div>
        </div>
      </div>

      {/* MODE SWITCHER */}
      <div className="host-screen__mode-switcher">
        <label className="host-screen__mode-label">
          <input
            type="radio"
            name="gamemode"
            value="standard"
            checked={gameMode === 'standard'}
            onChange={() => handleModeChange('standard')}
            className="host-screen__mode-radio host-screen__mode-radio--standard"
          />
          <span className="host-screen__mode-text">Standard</span>
        </label>
        <label className="host-screen__mode-label">
          <input
            type="radio"
            name="gamemode"
            value="speed"
            checked={gameMode === 'speed'}
            onChange={() => handleModeChange('speed')}
            className="host-screen__mode-radio host-screen__mode-radio--speed"
          />
          <span className="host-screen__mode-text host-screen__mode-text--speed">
            Speed Race
          </span>
        </label>
      </div>

      {/* Timer Controls */}
      <div className="host-screen__timer-grid">
        <button
          type="button"
          onClick={() => startTimer(3)}
          className="host-screen__timer-btn host-screen__timer-btn--highlight btn-push"
        >
          3s
        </button>
        <button
          type="button"
          onClick={() => startTimer(5)}
          className="host-screen__timer-btn btn-push"
        >
          5s
        </button>
        <button
          type="button"
          onClick={() => startTimer(10)}
          className="host-screen__timer-btn btn-push"
        >
          10s
        </button>
        <button
          type="button"
          onClick={() => startTimer(15)}
          className="host-screen__timer-btn btn-push"
        >
          15s
        </button>
        <button
          type="button"
          onClick={() => startTimer(20)}
          className="host-screen__timer-btn btn-push"
        >
          20s
        </button>
        <button
          type="button"
          onClick={() => startTimer(25)}
          className="host-screen__timer-btn btn-push"
        >
          25s
        </button>
        <button
          type="button"
          onClick={() => startTimer(30)}
          className="host-screen__timer-btn btn-push"
        >
          30s
        </button>
      </div>

      {/* Manual Controls */}
      <div className="host-screen__manual-grid">
        <button
          id="btn-lock"
          type="button"
          onClick={toggleLock}
          className={`host-screen__lock-btn btn-push ${
            isLocked
              ? 'host-screen__lock-btn--locked'
              : 'host-screen__lock-btn--unlocked'
          }`}
        >
          {isLocked ? 'UNLOCK' : 'LOCK'}
        </button>
        <button
          id="btn-reset"
          type="button"
          onClick={resetBuzzers}
          className={`host-screen__reset-btn btn-push ${
            gameMode === 'speed'
              ? 'host-screen__reset-btn--speed'
              : 'host-screen__reset-btn--standard'
          }`}
        >
          {gameMode === 'speed' ? 'NEXT QUESTION (Live)' : 'RESET BOARD'}
        </button>
      </div>

      {/* Notifications */}
      <div
        id="notifications"
        className={`host-screen__notif-bar ${
          notification.text ? 'host-screen__notif-bar--visible' : ''
        } ${
          notification.type === 'danger'
            ? 'host-screen__notif-bar--danger'
            : 'host-screen__notif-bar--success'
        }`}
      >
        {notification.text}
      </div>

      {/* Buzz List */}
      <div className="host-screen__buzz-container">
        <div className="host-screen__buzz-header">
          <h3 className="host-screen__buzz-title">Buzz Order</h3>
          <div className="host-screen__buzz-actions">
            {onOpenDisplay && (
              <button
                type="button"
                onClick={onOpenDisplay}
                className="host-screen__display-btn"
                title="Open Public Projector Display"
              >
                Projector View
              </button>
            )}
            <button
              type="button"
              onClick={onExit}
              className="host-screen__exit-btn"
            >
              Exit
            </button>
          </div>
        </div>

        <div id="buzz-list" className="host-screen__buzz-list">
          {buzzList.map((item) => {
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

            const sigClass = getSigClass(item.latency);

            return (
              <div
                key={`${item.name}-${item.rank}`}
                className={`buzz-row fade-in ${rowClass}`}
              >
                <div className="buzz-row__content">
                  <span className={`buzz-row__badge ${badgeClass}`}>
                    {badgeText}
                  </span>
                  <div
                    className={`signal-dot ${sigClass}`}
                    title={`Latency: ${item.latency}ms`}
                  />
                  <span className="buzz-row__name">{item.name}</span>
                  {item.timeDiff && (
                    <span className="buzz-row__time">{item.timeDiff}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Player List (Footer) */}
      <div id="connected-list" className="host-screen__connected-footer">
        {Array.from(connectedPlayers.entries()).map(([name, latency]) => (
          <div key={name} className="host-screen__player-pill">
            <div
              className={`signal-dot ${getSigClass(latency)}`}
              title={`${latency}ms`}
            />
            <span>{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
