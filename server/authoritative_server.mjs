// server/authoritative_server.mjs
// Entrypoint del servidor autoritativo (ADR-005).
// Escucha WebSocket en 0.0.0.0:8080 (override con PORT env).
// Validacion minima de mensajes del cliente.

import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.mjs';
import { PROTOCOL_VERSION } from './protocol.mjs';

const PORT = Number(process.env.PORT || 8080);

const manager = new RoomManager();
const wss = new WebSocketServer({ port: PORT, path: '/ws' });

console.log(`[worm-server] listening on :${PORT}/ws (protocol v${PROTOCOL_VERSION})`);

wss.on('connection', (socket, req) => {
  let playerId = null;
  let room = null;
  let lastInputAt = 0;

  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch {
      return; // mensaje malformado: ignorar
    }

    if (msg.t === 'hello') {
      if (!msg.name || typeof msg.name !== 'string' || msg.name.length > 16) return;
      if (typeof msg.skin !== 'number') return;
      const joined = manager.joinOrCreate({ socket, name: msg.name, skin: msg.skin });
      room = joined.room;
      playerId = joined.playerId;
      if (!playerId) {
        socket.send(JSON.stringify({ t: 'error', code: 'ROOM_FULL' }));
        socket.close();
        return;
      }
      socket.send(JSON.stringify({
        t: 'welcome',
        playerId,
        protocol: PROTOCOL_VERSION,
        world: { width: 4000, height: 4000, tickHz: 20 },
      }));
      return;
    }

    if (!playerId || !room) return; // resto requiere haber hecho hello

    // Rate limit basico: 60 msgs/seg por socket
    const now = Date.now();
    if (now - lastInputAt < 16) return;
    lastInputAt = now;

    switch (msg.t) {
      case 'target':
        if (typeof msg.x !== 'number' || typeof msg.y !== 'number') return;
        room.applyInput(playerId, { t: 'target', x: msg.x, y: msg.y });
        break;
      case 'boost_start':
      case 'boost_stop':
      case 'respawn':
        room.applyInput(playerId, { t: msg.t });
        break;
      case 'ack':
        // El cliente confirma hasta que seq; el servidor podria usarlo para delta.
        break;
      default:
        // tipo desconocido: ignorar
    }
  });

  socket.on('close', () => {
    if (playerId && room) room.removePlayer(playerId);
  });

  socket.on('error', (err) => {
    console.error('[ws] error:', err.message);
  });
});

// Health endpoint via http GET /health (cuando se monte detras de proxy).
// Para H1/H2 basta con el ws. En H4 se anade express o http minimal.
