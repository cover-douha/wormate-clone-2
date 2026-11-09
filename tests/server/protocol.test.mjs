// tests/server/protocol.test.mjs
// Tests del protocolo binario ADR-006 v2: header, crc, idTable, round-trip.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  encodeSnapshot, decodeSnapshot, crc16,
  PlayerIdTable, MAGIC, PROTOCOL_VERSION, KILLER_WORLD,
} from '../../server/protocol.mjs';

describe('crc16', () => {
  it('CRC-CCITT es determinista', () => {
    const a = crc16(Buffer.from('123456789', 'utf8'));
    const b = crc16(Buffer.from('123456789', 'utf8'));
    expect(a).toBe(b);
  });

  it('CRC detecta corrupcion', () => {
    const original = Buffer.from('wormzilla', 'utf8');
    const corrupted = Buffer.from('wormzillb', 'utf8'); // 1 byte cambiado
    expect(crc16(original)).not.toBe(crc16(corrupted));
  });
});

describe('PlayerIdTable', () => {
  let t;
  beforeEach(() => { t = new PlayerIdTable(); });

  it('registra y devuelve el mismo u16 para el mismo string', () => {
    const h1 = t.register('player_1');
    const h2 = t.register('player_1');
    expect(h1).toBe(h2);
    expect(h1).toBe(1);
  });

  it('lookup devuelve el string original', () => {
    const h = t.register('abc');
    expect(t.lookup(h)).toBe('abc');
  });

  it('lookup devuelve null para IDs desconocidos', () => {
    expect(t.lookup(999)).toBeNull();
  });
});

describe('encodeSnapshot / decodeSnapshot round-trip', () => {
  let table;
  beforeEach(() => { table = new PlayerIdTable(); });

  it('codifica y decodifica un snapshot basico', () => {
    const snap = {
      seq: 42,
      lastAck: 0,
      players: [
        { id: 'p1', head: { x: 100, y: 200 }, angle: 1.5, length: 12, mass: 12, boost: false, alive: true, skin: 0 },
      ],
      food: [{ id: 1, x: 50, y: 60, value: 1, kind: 2 }],
      deaths: [],
      leaderboard: [{ id: 'p1', score: 12, name: 'P1' }],
    };
    const buf = encodeSnapshot(snap, table, null);
    expect(buf.readUInt8(0)).toBe(MAGIC);
    expect(buf.readUInt8(1)).toBe(PROTOCOL_VERSION);
    expect(buf.readUInt32BE(2)).toBe(42);
    const decoded = decodeSnapshot(buf, table);
    expect(decoded.seq).toBe(42);
    expect(decoded.players.length).toBe(1);
    expect(decoded.players[0].id).toBe('p1');
    expect(decoded.players[0].head.x).toBe(100);
    expect(decoded.food.length).toBe(1);
  });

  it('lanza error si magic es incorrecto', () => {
    const snap = { seq: 1, players: [], food: [], deaths: [], leaderboard: [] };
    const buf = encodeSnapshot(snap, table, null);
    buf.writeUInt8(0xFF, 0); // corromper magic
    expect(() => decodeSnapshot(buf, table)).toThrow('bad magic');
  });

  it('lanza error si CRC no coincide', () => {
    const snap = { seq: 1, players: [], food: [], deaths: [], leaderboard: [] };
    const buf = encodeSnapshot(snap, table, null);
    buf.writeUInt16BE(0x0000, buf.length - 2); // corromper crc
    expect(() => decodeSnapshot(buf, table)).toThrow('crc mismatch');
  });

  it('snapshot con death por borde (by: null)', () => {
    const snap = {
      seq: 5,
      players: [{ id: 'p2', head: { x: -10, y: 0 }, angle: 0, length: 10, mass: 10, boost: false, alive: false, skin: 0 }],
      food: [],
      deaths: [{ playerId: 'p2', by: null }],
      leaderboard: [],
    };
    const buf = encodeSnapshot(snap, table, null);
    const decoded = decodeSnapshot(buf, table);
    expect(decoded.deaths.length).toBe(1);
    expect(decoded.deaths[0].by).toBeNull();
    expect(decoded.players[0].alive).toBe(false);
  });

  it('snapshot con death por killer identificado', () => {
    const snap = {
      seq: 7,
      players: [],
      food: [],
      deaths: [{ playerId: 'p3', by: 'p4' }],
      leaderboard: [],
    };
    const buf = encodeSnapshot(snap, table, null);
    const decoded = decodeSnapshot(buf, table);
    expect(decoded.deaths[0].by).toBe('p4');
  });
});
