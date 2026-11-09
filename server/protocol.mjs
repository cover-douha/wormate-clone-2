// server/protocol.mjs
// Codificacion/decodificacion binaria del snapshot delta (ADR-006 v2).
// Formato:
//   Header (10 bytes): magic(1) + version(1) + seq(4) + lastAck(4)
//   Body: Players + Food.Deltas + Food.Drops + Deaths + Leaderboard
//   Trailer: crc16(2)
//
// Input del cliente sigue en JSON (es chico, no justifica binario).

// Constantes del juego (espejo de scripts/game/worm_constants.gd; sincronizar con tools/sync_constants.mjs)
export const WORLD = {
  WIDTH: 4000, HEIGHT: 4000,
  VIEWPORT_W: 1280, VIEWPORT_H: 720,
  FOOD_CAP: 500,
  TICK_HZ: 20, TICK_MS: 50,
  INTERP_MS: 100,
  GRID_CELL: 50,
  HIT_RADIUS: 12,
  SEG_SPACING: 8,
  INITIAL_LENGTH: 10,
  BASE_SPEED: 120,
  BOOST_SPEED_MULT: 1.8,
  BOOST_MASS_COST_PER_SEC: 0.5,
  RESPAWN_MS: 2000,
  HEAD_VS_HEAD: 'BOTH_DIE',
  FOOD_FROM_DEATH_SEGMENTS_RATIO: 3, // 1 de cada N segmentos del path se vuelve comida al morir
};

// Constantes de predicción (ADR-006 v2)
export const SNAP_UMBRAL = 18;     // u (3 ticks de drift a 120 u/s × 50 ms)
export const SNAP_RESOLUTION = 16; // 1/16 u por unidad int16

export const PROTOCOL_VERSION = 1;
const MAGIC = 0x57; // 'W'
const KILLER_WORLD = 0xFFFF;

// Tabla de hash de PlayerId string -> uint16. Mantiene mapeo bidireccional por sesion.
// Reset por sala (Room crea un ProtocolContext nuevo).
export class PlayerIdTable {
  constructor() {
    this._strToU16 = new Map();
    this._u16ToStr = new Map();
    this._next = 1;
  }
  register(str) {
    if (typeof str !== 'string') throw new TypeError('PlayerId must be string');
    let h = this._strToU16.get(str);
    if (h !== undefined) return h;
    if (this._next >= KILLER_WORLD) throw new Error('PlayerIdTable full (>65534 players)');
    h = this._next++;
    this._strToU16.set(str, h);
    this._u16ToStr.set(h, str);
    return h;
  }
  lookup(u16) {
    return this._u16ToStr.get(u16) ?? null;
  }
  has(str) {
    return this._strToU16.has(str);
  }
  clear() {
    this._strToU16.clear();
    this._u16ToStr.clear();
    this._next = 1;
  }
}

// Codifica snapshot a Buffer binario.
// idTable: PlayerIdTable de la sala. Modifica estado (registra IDs nuevos).
// prev: snapshot previo del mismo cliente (para delta de coordenadas). Si null/undefined, modo absoluto.
export function encodeSnapshot(snapshot, idTable, prev = null) {
  // Para simplicidad en H1/H2 usamos JSON con un header ligero.
  // H3: migrar a DataView con el formato binario de ADR-006 v2.
  // El header + JSON permite migrar el cliente progresivamente.
  const payload = JSON.stringify(snapshot);
  const jsonBytes = Buffer.from(payload, 'utf8');
  const header = Buffer.alloc(10);
  header.writeUInt8(MAGIC, 0);
  header.writeUInt8(PROTOCOL_VERSION, 1);
  header.writeUInt32BE(snapshot.seq || 0, 2);
  header.writeUInt32BE(snapshot.lastAck || 0, 6);
  return Buffer.concat([header, jsonBytes, crc16Trailer(header, jsonBytes)]);
}

export function decodeSnapshot(buf, idTable) {
  if (buf.length < 12) throw new Error('snapshot too short');
  if (buf.readUInt8(0) !== MAGIC) throw new Error('bad magic');
  const version = buf.readUInt8(1);
  if (version !== PROTOCOL_VERSION) throw new Error(`unsupported version ${version}`);
  const seq = buf.readUInt32BE(2);
  const lastAck = buf.readUInt32BE(6);
  const jsonBytes = buf.subarray(10, buf.length - 2);
  const expectedCrc = buf.readUInt16BE(buf.length - 2);
  const actualCrc = crc16(Buffer.concat([buf.subarray(0, 10), jsonBytes]));
  if (expectedCrc !== actualCrc) throw new Error('crc mismatch');
  const snap = JSON.parse(jsonBytes.toString('utf8'));
  snap.seq = seq;
  snap.lastAck = lastAck;
  return snap;
}

// Input del cliente en JSON (chico: ~50 bytes max). No justifica binario.
export function encodeInput(input) {
  return Buffer.from(JSON.stringify(input), 'utf8');
}

export function decodeInput(buf) {
  return JSON.parse(buf.toString('utf8'));
}

export function crc16(buf) {
  // CRC-CCITT (polinomio 0x1021), init 0xFFFF.
  let crc = 0xFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i] << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc;
}

function crc16Trailer(header, jsonBytes) {
  const crc = crc16(Buffer.concat([header, jsonBytes]));
  const t = Buffer.alloc(2);
  t.writeUInt16BE(crc, 0);
  return t;
}

// Tipos de mensaje cliente -> servidor (JSON):
//   { t: 'hello', name: string, skin: number }
//   { t: 'target', x: number, y: number }
//   { t: 'boost_start' }
//   { t: 'boost_stop' }
//   { t: 'respawn' }
//   { t: 'ack', seq: number }

// Tipos de mensaje servidor -> cliente:
//   { t: 'welcome', playerId: string, protocol: number, world: {...} }
//   { t: 'snapshot', ... (binario segun ADR-006 v2) }
//   { t: 'death', playerId: string, by: string|null }
//   { t: 'leaderboard', entries: [{id, score}] }
//   { t: 'error', code: string }

export { MAGIC, KILLER_WORLD };
