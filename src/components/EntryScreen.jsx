import React, { useState, useRef, useEffect } from 'react';
import './EntryScreen.css';
import { playElectricBell, initAudio } from '../services/audio';

export default function EntryScreen({
  onStartHost,
  onJoinGame,
  onOpenDisplay,
  onOpenAdminModal,
}) {
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [previewText, setPreviewText] = useState('Type name to test bell...');
  const [errorMsg, setErrorMsg] = useState('');
  const soundDebounceRef = useRef(null);

  // Clear pending debounce timer on unmount
  useEffect(() => {
    return () => {
      if (soundDebounceRef.current) {
        clearTimeout(soundDebounceRef.current);
      }
    };
  }, []);

  const handleNameChange = (e) => {
    const name = e.target.value;
    setPlayerName(name);
    setErrorMsg('');

    if (name.length > 2) {
      setPreviewText('Testing bell...');
      if (soundDebounceRef.current) clearTimeout(soundDebounceRef.current);
      soundDebounceRef.current = setTimeout(() => {
        playElectricBell(name);
        setPreviewText('Type name to test bell...');
      }, 600);
    } else {
      setPreviewText('Type name to test bell...');
    }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    initAudio();
    if (!roomCode.trim() || !playerName.trim()) {
      setErrorMsg('Enter Code and Name to join as contestant');
      return;
    }
    onJoinGame(roomCode.trim(), playerName.trim());
  };

  const handleDisplay = () => {
    initAudio();
    if (!roomCode.trim()) {
      setErrorMsg('Enter Room Code to view Public Display');
      return;
    }
    if (onOpenDisplay) {
      onOpenDisplay(roomCode.trim());
    }
  };

  return (
    <div id="screen-setup" className="entry-screen">
      <h1 className="entry-screen__title">QUIZ BUZZER</h1>
      <p className="entry-screen__subtitle">Professional Edition 🏆</p>

      <div className="entry-screen__content">
        {/* HOST BUTTON (LOCKED) */}
        <button
          type="button"
          onClick={onOpenAdminModal}
          className="entry-screen__host-btn btn-push"
        >
          <div className="entry-screen__lock-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="entry-screen__host-text">
            <h3 className="entry-screen__host-title">Create Room</h3>
            <p className="entry-screen__host-desc">Quiz Master Only</p>
          </div>
        </button>

        {/* JOIN / DISPLAY FORM */}
        <form onSubmit={handleJoin} className="entry-screen__join-card">
          <input
            id="join-code"
            type="number"
            placeholder="Room Code"
            value={roomCode}
            onChange={(e) => {
              setRoomCode(e.target.value);
              setErrorMsg('');
            }}
            className="entry-screen__input entry-screen__input--code"
          />
          <input
            id="join-name"
            type="text"
            placeholder="Your Name (for contestants)"
            value={playerName}
            onChange={handleNameChange}
            className="entry-screen__input"
          />

          <div id="sound-preview-text" className="entry-screen__sound-preview">
            {previewText}
          </div>

          {errorMsg && <div className="entry-screen__error">{errorMsg}</div>}

          <button
            type="submit"
            className="entry-screen__join-btn btn-push"
          >
            JOIN ROOM
          </button>

          <button
            type="button"
            onClick={handleDisplay}
            className="entry-screen__display-btn btn-push"
          >
            📺 PUBLIC DISPLAY (SPECTATOR)
          </button>
        </form>
      </div>
    </div>
  );
}
