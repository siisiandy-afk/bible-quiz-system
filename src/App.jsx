import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import StatusBar from './components/StatusBar';
import EntryScreen from './components/EntryScreen';
import AdminLogin from './components/AdminLogin';
import HostDashboard from './components/HostDashboard';
import ContestantScreen from './components/ContestantScreen';
import PublicDisplay from './components/PublicDisplay';
import ConnectionState from './components/ConnectionState';
import { connectMQTT, disconnectMQTT } from './services/mqtt';
import { roomService } from './services/supabase';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('setup'); // 'setup' | 'host' | 'player' | 'display'
  const [connectionStatus, setConnectionStatus] = useState('idle'); // 'idle' | 'connecting' | 'error'
  const [connectionError, setConnectionError] = useState('');
  const [pendingSession, setPendingSession] = useState(null); // { mode, roomCode, playerName }
  const [isOnline, setIsOnline] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [mqttEvents, setMqttEvents] = useState(null);

  const pendingSessionRef = useRef(null);
  pendingSessionRef.current = pendingSession;

  // Handle incoming MQTT message dispatch
  const handleMqttMessage = useCallback((type, payload, topic) => {
    setMqttEvents({ type, payload, topic, timestamp: Date.now() });
  }, []);

  // Initiate real MQTT connection and only transition upon verified success
  const initiateConnection = useCallback(
    ({ mode, code, name }) => {
      const session = { mode, roomCode: code, playerName: name };
      setPendingSession(session);
      setConnectionStatus('connecting');
      setConnectionError('');
      setIsOnline(false);

      connectMQTT({
        roomCode: code,
        isHost: mode === 'host',
        playerName: name,
        timeoutMs: 10000,
        onStatusChange: (online) => {
          setIsOnline(online);
        },
        onConnect: () => {
          setConnectionStatus('idle');
          setRoomCode(code);
          setPlayerName(name);
          setCurrentScreen(mode);
          setIsOnline(true);
        },
        onError: (err) => {
          setIsOnline(false);
          setConnectionStatus('error');
          setConnectionError(
            err?.message || 'Failed to establish WebSocket connection with MQTT broker.'
          );
        },
        onMessage: handleMqttMessage,
      });
    },
    [handleMqttMessage]
  );

  // Handle Host Start (Quiz Master)
  const handleStartHost = async (authenticatedUser) => {
    setIsAdminModalOpen(false);
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    // Register room in Supabase (if configured)
    await roomService.createRoom({
      roomCode: code,
      hostId: authenticatedUser?.id || null,
      gameMode: 'standard',
    });

    initiateConnection({ mode: 'host', code, name: '' });
  };

  // Handle Player Join with Room Verification
  const handleJoinGame = async (code, name) => {
    setPendingSession({ mode: 'player', roomCode: code, playerName: name });
    setConnectionStatus('connecting');
    setConnectionError('');

    // Verify room existence in Supabase before connecting
    const verifyRes = await roomService.verifyRoom(code);
    if (!verifyRes.exists) {
      setConnectionStatus('error');
      setConnectionError(
        verifyRes.error || `Room #${code} does not exist or has ended. Please check with your Quiz Master.`
      );
      return;
    }

    // Register contestant in database
    const sessionId = 'session_' + Math.random().toString(16).substring(2, 10);
    await roomService.registerContestant(code, name, sessionId);

    initiateConnection({ mode: 'player', code, name });
  };

  // Handle Public Display (Spectator / Projector) with Room Verification
  const handleOpenDisplay = async (code) => {
    setPendingSession({ mode: 'display', roomCode: code, playerName: '' });
    setConnectionStatus('connecting');
    setConnectionError('');

    // Verify room existence before opening display
    const verifyRes = await roomService.verifyRoom(code);
    if (!verifyRes.exists) {
      setConnectionStatus('error');
      setConnectionError(
        verifyRes.error || `Room #${code} does not exist or has ended.`
      );
      return;
    }

    initiateConnection({ mode: 'display', code, name: '' });
  };

  // Handle Retry
  const handleRetryConnection = () => {
    if (pendingSessionRef.current) {
      const { mode, roomCode: code, playerName: name } = pendingSessionRef.current;
      if (mode === 'player') {
        handleJoinGame(code, name);
      } else if (mode === 'display') {
        handleOpenDisplay(code);
      } else {
        initiateConnection({ mode, code, name });
      }
    }
  };

  // Cancel pending connection attempt
  const handleCancelConnection = () => {
    disconnectMQTT();
    setConnectionStatus('idle');
    setConnectionError('');
    setPendingSession(null);
    setIsOnline(false);
  };

  // Handle Exit / Leave Room
  const handleExit = () => {
    if (currentScreen === 'host') {
      roomService.closeRoom(roomCode);
    }
    disconnectMQTT(roomCode, playerName, currentScreen === 'host');
    setCurrentScreen('setup');
    setConnectionStatus('idle');
    setConnectionError('');
    setPendingSession(null);
    setRoomCode('');
    setPlayerName('');
    setIsOnline(false);
    setMqttEvents(null);
  };

  // Check URL parameters for direct public display entry (e.g. ?display=1234)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const displayRoom = params.get('display') || params.get('screen');
      if (displayRoom && displayRoom.trim()) {
        handleOpenDisplay(displayRoom.trim());
      }
    } catch {
      // ignore
    }
  }, []);

  // Handle window unload cleanup
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentScreen === 'host' && roomCode) {
        roomService.closeRoom(roomCode);
      }
      if (currentScreen === 'player' && playerName && roomCode) {
        disconnectMQTT(roomCode, playerName, false);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentScreen, playerName, roomCode]);

  return (
    <div className="app-container">
      <StatusBar isOnline={isOnline} />

      <main className="app-main">
        {connectionStatus !== 'idle' ? (
          <ConnectionState
            status={connectionStatus}
            mode={pendingSession?.mode}
            roomCode={pendingSession?.roomCode}
            errorMessage={connectionError}
            onRetry={handleRetryConnection}
            onCancel={handleCancelConnection}
          />
        ) : (
          <>
            {currentScreen === 'setup' && (
              <EntryScreen
                onStartHost={handleStartHost}
                onJoinGame={handleJoinGame}
                onOpenDisplay={handleOpenDisplay}
                onOpenAdminModal={() => setIsAdminModalOpen(true)}
              />
            )}

            {currentScreen === 'host' && (
              <HostDashboard
                roomCode={roomCode}
                onExit={handleExit}
                onOpenDisplay={() => handleOpenDisplay(roomCode)}
                mqttEvents={mqttEvents}
              />
            )}

            {currentScreen === 'player' && (
              <ContestantScreen
                playerName={playerName}
                roomCode={roomCode}
                onLeave={handleExit}
                mqttEvents={mqttEvents}
              />
            )}

            {currentScreen === 'display' && (
              <PublicDisplay
                roomCode={roomCode}
                mqttEvents={mqttEvents}
                onExit={handleExit}
              />
            )}
          </>
        )}
      </main>

      <AdminLogin
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onSuccess={handleStartHost}
      />
    </div>
  );
}
