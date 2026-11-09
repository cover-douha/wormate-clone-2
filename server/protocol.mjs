// server/protocol.mjs
// Codificación/decodificación binaria del snapshot delta (ADR-006).
// Implementación mínima: header + secciones + CRC16. Suficiente para H1 (offline) y H2 (lan).
// No usar JSON en el hot path.

// Constantes del juego (espejo de autoload/tuning_store.gd; sincronizar con tools/sync_constants.mjs)
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
  HEAD_VS_HEAD: 'BOTH_DIE', // | 'NOBODY_DIES'
};

export const PROTOCOL_VERSION = 1;

// Codificación simple con DataView. No óptima; suficiente para H1/H2.
// Optimización con bit-packing en H3 si el benchmark lo requiere.

export function encodeSnapshot(snapshot) {
  // TODO H2: implementar encoding binario real según ADR-006.
  // Por ahora, JSON para tener algo funcional en H1 single-player.
  return Buffer.from(JSON.stringify(snapshot), 'utf8');
}

export function decodeSnapshot(buf) {
  return JSON.parse(buf.toString('utf8'));
}

export function encodeInput(input) {
  return Buffer.from(JSON.stringify(input), 'utf8');
}

export function decodeInput(buf) {
  return JSON.parse(buf.toString('utf8'));
}

// Tipos de mensaje cliente -> servidor
// { t: 'hello', name: string, skin: number }
// { t: 'target', x: number, y: number }
// { t: 'boost_start' }
// { t: 'boost_stop' }
// { t: 'respawn' }
// { t: 'ack', seq: number }

// Tipos de mensaje servidor -> cliente
// { t: 'welcome', playerId: string, world: {...} }
// { t: 'snapshot', ... (ver ADR-006) }
// { t: 'death', playerId: string, by: string|null }
// { t: 'leaderboard', entries: [{id, score}] }

export function crc16(buf) {
  // CRC-CCITT (0x1021), polinomio estandar. Suficiente para detectar corrupcion.
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
