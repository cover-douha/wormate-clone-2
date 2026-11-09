// server/rooms.mjs
// Gestion de salas y asientos. Sala unica para H2; multi-sala en stretch (H5).
// Una sala es responsable de:
//   - mantener la lista de jugadores y sus sockets
//   - delegar simulacion a GameWorld
//   - enviar snapshots a 20 Hz (binario, ADR-011)
//   - validar mensajes del cliente (forma, rate, miembros)
//   - mantener PlayerIdTable + prevSnapshot por cliente (delta encoding)

import { GameWorld } from './game/world.mjs';
import { WORLD, encodeSnapshot, PlayerIdTable } from './protocol.mjs';

const FULL_SNAPSHOT_INTERVAL_TICKS = 20; // 1 Hz a 20 Hz de tick

export class Room {
  constructor({ id, capacity = 30, tickMs = WORLD.TICK_MS, useBinary = true }) {
    this.id = id;
    this.capacity = capacity;
    this.tickMs = tickMs;
    this.useBinary = useBinary; // flag de rollback (ADR-011 §Reversión)
    this.players = new Map(); // playerId -> { socket, name, skin, seat }
    this.world = new GameWorld({ width: WORLD.WIDTH, height: WORLD.HEIGHT });
    this.seq = 0;
    this._tickTimer = null;
    this.idTable = new PlayerIdTable();
    this._prevSnapshots = new Map(); // playerId -> último snapshot enviado (para delta)
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
    this.idTable.register(playerId); // pre-registra para el primer snapshot
    return playerId;
  }

  removePlayer(playerId) {
    if (!this.players.has(playerId)) return;
    this.players.delete(playerId);
    this.world.removePlayer(playerId);
    this._prevSnapshots.delete(playerId);
    // Nota: no quitamos el ID de idTable para evitar reusar u16 de un jugador
    // recién desconectado que el cliente podría tener cacheado. La tabla crece
    // hasta 65534 jugadores por sala; para H2-H4 es suficiente.
  }

  applyInput(playerId, input) {
    this.world.applyInput(playerId, input);
  }

  _tick() {
    this.seq += 1;
    const snapshot = this.world.tick(this.tickMs / 1000, this.seq);

    // Full-state cada N ticks (1 Hz) o si el primer snapshot del cliente.
    // bit4=0 (absolute mode en ADR-006 v2) cuando prev = null.
    const isFullStateTick = this.seq % FULL_SNAPSHOT_INTERVAL_TICKS === 0;

    for (const [playerId, { socket }] of this.players.entries()) {
      if (socket.readyState !== 1 /* OPEN */) continue;

      let prev = this._prevSnapshots.get(playerId);
      if (isFullStateTick || !prev) prev = null; // fuerza absolute mode

      const payload = this.useBinary
        ? encodeSnapshot(snapshot, this.idTable, prev)
        : Buffer.from(JSON.stringify({ t: 'snapshot', ...snapshot }), 'utf8');

      // Para el cliente Godot: el primer byte es magic 0x57 si binario,
      // o '{' si JSON. connection.gd distingue por el primer byte.
      if (this.useBinary) {
        socket.send(payload, { binary: true });
      } else {
        socket.send(payload.toString('utf8'));
      }

      this._prevSnapshots.set(playerId, snapshot);
    }
  }
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
