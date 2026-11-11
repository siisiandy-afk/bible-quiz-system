import mqtt from 'mqtt';

const BROKER = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC_PREFIX = 'quizApp_v18';

let client = null;
let connectionTimeoutId = null;

export function connectMQTT({
  roomCode,
  isHost,
  playerName,
  onConnect,
  onError,
  onStatusChange,
  onMessage,
  timeoutMs = 10000,
}) {
  // Disconnect any existing client before establishing a new session
  if (client) {
    disconnectMQTT();
  }

  const cleanRoomCode = String(roomCode).trim();
  const cleanPlayerName = playerName ? String(playerName).trim() : '';
  const clientId = 'quiz_' + Math.random().toString(16).substring(2, 10);

  const will = isHost || !cleanPlayerName ? null : {
    topic: `${TOPIC_PREFIX}/${cleanRoomCode}/leave`,
    payload: cleanPlayerName,
    qos: 0,
    retain: false,
  };

  let hasConnectedOnce = false;

  try {
    client = mqtt.connect(BROKER, {
      clientId,
      clean: true,
      will,
      keepalive: 30,
      connectTimeout: timeoutMs,
      reconnectPeriod: 2000,
    });
  } catch (err) {
    if (onError) onError(err);
    if (onStatusChange) onStatusChange(false);
    return null;
  }

  // Set safety timeout for initial connection attempt
  connectionTimeoutId = setTimeout(() => {
    if (!hasConnectedOnce && client && !client.connected) {
      const timeoutErr = new Error('Connection timed out. Unable to reach MQTT broker.');
      if (onError) onError(timeoutErr);
      if (onStatusChange) onStatusChange(false);
      try {
        client.end(true);
      } catch {
        // ignore
      }
      client = null;
    }
  }, timeoutMs);

  client.on('connect', () => {
    hasConnectedOnce = true;
    if (connectionTimeoutId) {
      clearTimeout(connectionTimeoutId);
      connectionTimeoutId = null;
    }

    if (onStatusChange) onStatusChange(true);
    if (onConnect) onConnect();

    client.subscribe(`${TOPIC_PREFIX}/${cleanRoomCode}/#`, (err) => {
      if (err && console) {
        console.error('MQTT subscription error:', err);
      }
    });

    if (!isHost && cleanPlayerName) {
      setTimeout(() => {
        publishMessage(cleanRoomCode, 'join', cleanPlayerName);
      }, 500);
    }
  });

  client.on('offline', () => {
    if (onStatusChange) onStatusChange(false);
  });

  client.on('close', () => {
    if (onStatusChange) onStatusChange(false);
  });

  client.on('error', (err) => {
    if (console) console.error('MQTT connection error:', err);
    if (onStatusChange) onStatusChange(false);

    // If initial connection failed, trigger error callback
    if (!hasConnectedOnce) {
      if (connectionTimeoutId) {
        clearTimeout(connectionTimeoutId);
        connectionTimeoutId = null;
      }
      if (onError) onError(err);
    }
  });

  client.on('message', (topic, message) => {
    const msg = message ? message.toString() : '';
    const type = topic.split('/').pop();
    if (onMessage) {
      onMessage(type, msg, topic);
    }
  });

  return client;
}

export function publishMessage(roomCode, type, payload) {
  if (client && client.connected) {
    const cleanRoomCode = String(roomCode).trim();
    client.publish(`${TOPIC_PREFIX}/${cleanRoomCode}/${type}`, String(payload));
  }
}

export function disconnectMQTT(roomCode, playerName, isHost) {
  if (connectionTimeoutId) {
    clearTimeout(connectionTimeoutId);
    connectionTimeoutId = null;
  }

  if (!client) return;

  const cleanRoomCode = roomCode ? String(roomCode).trim() : '';
  const cleanPlayerName = playerName ? String(playerName).trim() : '';

  if (client.connected && cleanRoomCode) {
    if (!isHost && cleanPlayerName) {
      try {
        client.publish(`${TOPIC_PREFIX}/${cleanRoomCode}/leave`, cleanPlayerName);
      } catch {
        // ignore
      }
    }

    try {
      client.unsubscribe(`${TOPIC_PREFIX}/${cleanRoomCode}/#`);
    } catch {
      // ignore
    }
  }

  try {
    client.end(true);
  } catch {
    // ignore
  }
  client = null;
}
