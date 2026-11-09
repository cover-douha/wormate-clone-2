// server/rooms.mjs
// Gestion de salas y asientos. Sala unica para H2; multi-sala en stretch (H5).
// Una sala es responsable de:
//   - mantener la lista de jugadores y sus sockets
//   - delegar simulacion a GameWorld
//   - enviar snapshots a 20 Hz
//   - validar mensajes del cliente (forma, rate, miembros)

import { GameWorld } from './game/world.mjs';
import { WORLD } from './protocol.mjs';

export class Room {
  constructor({ id, capacity = 30, tickMs = WORLD.TICK_MS }) {
    this.id = id;
    this.capacity = capacity;
    this.tickMs = tickMs;
    this.players = new Map(); // playerId -> { socket, name, skin, seat }
    this.world = new GameWorld({ width: WORLD.WIDTH, height: WORLD.HEIGHT });
    this.seq = 0;
    this._tickTimer = null;
  }

  start() {
    if (this._tickTimer) return;
    this._tickTimer = setInterval(() => this._tick(), this.tickMs);
  }

  stop() {
    if (this._tickTimer) clearInterval(this._tickTimer);
    this._tickTimer = null;
  }

  hasCapacity() {
    return this.players.size < this.capacity;
  }

  addPlayer({ socket, name, skin }) {
    if (!this.hasCapacity()) return null;
    const playerId = `p_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    this.players.set(playerId, { socket, name, skin, seat: this.players.size });
    this.world.addPlayer({ playerId, name, skin });
    return playerId;
  }

  removePlayer(playerId) {
    if (!this.players.has(playerId)) return;
    this.players.delete(playerId);
    this.world.removePlayer(playerId);
  }

  applyInput(playerId, input) {
    this.world.applyInput(playerId, input);
  }

  _tick() {
    this.seq += 1;
    const snapshot = this.world.tick(this.tickMs / 1000, this.seq);
    for (const { socket } of this.players.values()) {
      if (socket.readyState === 1 /* OPEN */) {
        socket.send(encode(snapshot));
      }
    }
  }
}

function encode(snapshot) {
  // Usa protocol.mjs cuando el binario este listo; mientras, JSON.
  return JSON.stringify({ t: 'snapshot', ...snapshot });
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  joinOrCreate({ socket, name, skin }) {
    let room = this._findRoomWithCapacity();
    if (!room) {
      room = new Room({ id: `r_${this.rooms.size + 1}` });
      room.start();
      this.rooms.set(room.id, room);
    }
    const playerId = room.addPlayer({ socket, name, skin });
    return { room, playerId };
  }

  _findRoomWithCapacity() {
    for (const r of this.rooms.values()) {
      if (r.hasCapacity()) return r;
    }
    return null;
  }
}
