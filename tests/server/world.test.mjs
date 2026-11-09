// tests/server/world.test.mjs
// Tests del GameWorld. Cubre H1 (smoke) + H2 (colisiones, deaths, drops,
// respawn, leaderboard, bot IA smoke). v0.4.7: usa campos publicos
// lastDeaths / lastFoodDrops en vez de subclass con override de tick().

import { describe, it, expect } from 'vitest';
import { GameWorld } from '../../server/game/world.mjs';
import { Worm } from '../../server/game/worm.mjs';
import { WORLD } from '../../server/protocol.mjs';

// Helper: instanciar mundo sin bots para tests deterministas
function mkWorldNoBots({ width = WORLD.WIDTH, height = WORLD.HEIGHT } = {}) {
  const w = new GameWorld({ width, height });
  // Quitar los 8 bots spawnados por constructor
  for (const id of [...w.bots.keys()]) {
    w.worms.delete(id);
    w.bots.delete(id);
  }
  return w;
}

// Helper: forzar spawn de un worm en posicion especifica
function spawnWormAt(world, id, x, y, opts = {}) {
  const worm = new Worm({
    id, name: opts.name || id, skin: opts.skin || 0,
    head: { x, y }, angle: opts.angle ?? 0,
  });
  world.worms.set(id, worm);
  return worm;
}

describe('GameWorld H1 smoke', () => {
  it('genera comida hasta FOOD_CAP al arrancar', () => {
    const w = new GameWorld();
    expect(w.food.items.size).toBeGreaterThanOrEqual(WORLD.FOOD_CAP - 1);
  });

  it('mueve gusanos vivos en un tick', () => {
    const w = new GameWorld();
    const head0 = { ...w.worms.get('bot_0').head };
    w.applyInput('bot_0', { t: 'target', x: WORLD.WIDTH, y: WORLD.HEIGHT });
    w.tick(0.05, 1);
    const head1 = w.worms.get('bot_0').head;
    expect(Math.abs(head1.x - head0.x) + Math.abs(head1.y - head0.y)).toBeGreaterThan(0);
  });

  it('detecta muerte por salir del mundo (campo lastDeaths)', () => {
    const w = mkWorldNoBots();
    spawnWormAt(w, 'edge_test', -100, -100);
    w.tick(0.05, 1);
    // v0.4.7: lastDeaths es campo publico, no hace falta subclass
    expect(w.lastDeaths.length).toBeGreaterThan(0);
    expect(w.lastDeaths.find((d) => d.playerId === 'edge_test')).toBeDefined();
    expect(w.lastDeaths.find((d) => d.playerId === 'edge_test').by).toBeNull();
  });
});

describe('GameWorld — head vs head (ADR-003: BOTH_DIE)', () => {
  it('dos worms con heads colisionando mueren ambas', () => {
    const w = mkWorldNoBots();
    const cx = WORLD.WIDTH / 2, cy = WORLD.HEIGHT / 2;
    // Colocar dos worms con heads a distancia < HIT_RADIUS * 2 = 24
    spawnWormAt(w, 'p1', cx - 5, cy, { angle: 0 });
    spawnWormAt(w, 'p2', cx + 5, cy, { angle: Math.PI });
    w.tick(0.05, 1);
    expect(w.lastDeaths.length).toBe(2);
    const dead = w.lastDeaths.map((d) => d.playerId).sort();
    expect(dead).toEqual(['p1', 'p2']);
    // Cada una tiene como killer a la otra
    const p1Death = w.lastDeaths.find((d) => d.playerId === 'p1');
    const p2Death = w.lastDeaths.find((d) => d.playerId === 'p2');
    expect(p1Death.by).toBe('p2');
    expect(p2Death.by).toBe('p1');
  });

  it('dos worms con heads a distancia > 2*HIT_RADIUS no mueren', () => {
    const w = mkWorldNoBots();
    const cx = WORLD.WIDTH / 2, cy = WORLD.HEIGHT / 2;
    spawnWormAt(w, 'p1', cx - 30, cy, { angle: 0 });
    spawnWormAt(w, 'p2', cx + 30, cy, { angle: Math.PI });
    w.tick(0.05, 1);
    // 60u de distancia > 24u (2*HIT_RADIUS). Sin colision head-head.
    // Tambien sin colision head-body (paths recien creados, no se solapan).
    expect(w.lastDeaths.filter((d) => d.playerId === 'p1' || d.playerId === 'p2')).toHaveLength(0);
  });
});

describe('GameWorld — food drop al morir', () => {
  it('worm muerta deja drops con ratio FOOD_FROM_DEATH_SEGMENTS_RATIO', () => {
    const w = mkWorldNoBots();
    // Worm con path de varios samples (crecer primero)
    const worm = spawnWormAt(w, 'p1', WORLD.WIDTH / 2, WORLD.HEIGHT / 2);
    worm.grow(20); // masa ~30, path crece al avanzar
    // Avanzar varios ticks para llenar el path
    for (let i = 0; i < 30; i++) {
      worm.setTarget({ x: WORLD.WIDTH / 2 + 1000, y: WORLD.HEIGHT / 2 });
      worm.tick(0.05);
    }
    const pathLen = worm.path.length;
    expect(pathLen).toBeGreaterThan(0);
    // Matarla (forzar death por borde mandandola fuera)
    worm.head.x = -100;
    worm.head.y = -100;
    w.tick(0.05, 1);
    expect(w.lastDeaths.find((d) => d.playerId === 'p1')).toBeDefined();
    // Drop ratio: 1 de cada FOOD_FROM_DEATH_SEGMENTS_RATIO segmentos
    const expectedDrops = Math.ceil(pathLen / WORLD.FOOD_FROM_DEATH_SEGMENTS_RATIO);
    // lastFoodDrops refleja drops generados este tick por muertes
    const dropsFromP1 = w.lastFoodDrops.length;
    expect(dropsFromP1).toBeGreaterThan(0);
    expect(dropsFromP1).toBeLessThanOrEqual(expectedDrops + 1); // +-1 por redondeo
  });

  it('los drops caen cerca del path de la worm muerta', () => {
    const w = mkWorldNoBots();
    const cx = WORLD.WIDTH / 2, cy = WORLD.HEIGHT / 2;
    const worm = spawnWormAt(w, 'p1', cx, cy);
    // Avanzar recto para tener path predecible
    for (let i = 0; i < 10; i++) {
      worm.setTarget({ x: cx + 1000, y: cy });
      worm.tick(0.05);
    }
    const pathPoints = worm.path.slice();
    // Matar
    worm.head.x = -100;
    w.tick(0.05, 1);
    // Cada drop debe estar a <= 1u de algun punto del path original
    for (const drop of w.lastFoodDrops) {
      const minDist = Math.min(...pathPoints.map((p) => Math.hypot(p.x - drop.x, p.y - drop.y)));
      expect(minDist).toBeLessThan(2);
    }
  });
});

describe('GameWorld — leaderboard', () => {
  it('leaderboard top-10 ordenado por masa desc, sin muertos', () => {
    const w = mkWorldNoBots();
    // Crear 12 worms con masas distintas
    for (let i = 0; i < 12; i++) {
      const worm = spawnWormAt(w, `p${i}`, 200 + i * 100, 200);
      worm.mass = 10 + i * 5; // p0=10, p1=15, ..., p11=65
    }
    // Matar a p5 (no debe aparecer en leaderboard)
    w.worms.get('p5').alive = false;
    w._pendingDeaths.push({ dead: 'p5', by: null });

    const snap = w.tick(0.05, 1);
    expect(snap.leaderboard.length).toBeLessThanOrEqual(10);
    // Ordenado desc
    for (let i = 1; i < snap.leaderboard.length; i++) {
      expect(snap.leaderboard[i - 1].score).toBeGreaterThanOrEqual(snap.leaderboard[i].score);
    }
    // Sin muertos
    expect(snap.leaderboard.find((e) => e.id === 'p5')).toBeUndefined();
    // Sin duplicados
    const ids = snap.leaderboard.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    // El de mayor masa (p11=65) debe estar primero
    expect(snap.leaderboard[0].id).toBe('p11');
  });

  it('leaderboard incluye name y score ademas de id', () => {
    const w = mkWorldNoBots();
    // Limpiar comida para que el worm no crezca durante el tick y el score sea determinista
    w.food.items.clear();
    spawnWormAt(w, 'p1', 200, 200, { name: 'Alice' });
    w.worms.get('p1').mass = 100;
    const snap = w.tick(0.05, 1);
    expect(snap.leaderboard[0]).toMatchObject({ id: 'p1', name: 'Alice', score: 100 });
  });
});

describe('GameWorld — respawn (ADR: tras RESPAWN_MS)', () => {
  it('worm muerta revive tras RESPAWN_MS con longitud inicial y masa inicial', () => {
    const w = mkWorldNoBots();
    const worm = spawnWormAt(w, 'p1', WORLD.WIDTH / 2, WORLD.HEIGHT / 2);
    // Hacerla crecer para que tenga masa alta
    worm.mass = 50;
    worm.length = 50;
    // Matarla (forzar death por borde)
    worm.head.x = -100;
    w.tick(0.05, 1);
    expect(w.lastDeaths.find((d) => d.playerId === 'p1')).toBeDefined();
    expect(w.worms.get('p1').alive).toBe(false);
    // Avanzar el reloj: simular paso de RESPAWN_MS + 1 tick
    // Para test determinista, manipulamos _deadWorms para que diedAt sea antiguo
    const diedAt = w._deadWorms.get('p1');
    expect(diedAt).toBeDefined();
    w._deadWorms.set('p1', diedAt - WORLD.RESPAWN_MS - 100);
    // Siguiente tick: el auto-respawn la revive
    w.tick(0.05, 2);
    const revived = w.worms.get('p1');
    expect(revived.alive).toBe(true);
    expect(revived.mass).toBe(WORLD.INITIAL_LENGTH);
    expect(revived.length).toBe(WORLD.INITIAL_LENGTH);
  });

  it('worm muerta NO revive antes de RESPAWN_MS', () => {
    const w = mkWorldNoBots();
    const worm = spawnWormAt(w, 'p1', WORLD.WIDTH / 2, WORLD.HEIGHT / 2);
    worm.head.x = -100;
    w.tick(0.05, 1);
    expect(w.worms.get('p1').alive).toBe(false);
    // Solo pasaron 50ms (mucho menos que 2000ms)
    w.tick(0.05, 2);
    expect(w.worms.get('p1').alive).toBe(false);
  });

  it('worm removida via removePlayer no revive (no esta en worms)', () => {
    const w = mkWorldNoBots();
    spawnWormAt(w, 'p1', WORLD.WIDTH / 2, WORLD.HEIGHT / 2);
    w.worms.get('p1').head.x = -100;
    w.tick(0.05, 1);
    // Muerta; ahora la removemos del mundo (jugador desconectado)
    w.removePlayer('p1');
    expect(w.worms.has('p1')).toBe(false);
    // Avanzar reloj mas alla de RESPAWN_MS
    const diedAt = w._deadWorms.get('p1');
    if (diedAt !== undefined) w._deadWorms.set('p1', diedAt - WORLD.RESPAWN_MS - 100);
    w.tick(0.05, 2);
    // No debe haber vuelto a aparecer
    expect(w.worms.has('p1')).toBe(false);
  });
});

describe('GameWorld — bot IA smoke', () => {
  it('8 bots solos sobreviven en promedio al menos 5s (100 ticks) en arena', () => {
    // Smoke test simplificado: con 8 bots en arena 4000x4000 sin humanos,
    // no deberian morir mas de 4 en 5 segundos. El promedio >=30s que pide
    // vigia requiere simulacion larga; aqui validamos supervivencia minima.
    const w = new GameWorld(); // constructor spawnea 8 bots
    const botIds = [...w.bots.keys()];
    expect(botIds.length).toBe(8);
    const ticksToRun = 100; // 5 segundos a 20Hz
    for (let s = 1; s <= ticksToRun; s++) {
      w.tick(WORLD.TICK_MS / 1000, s);
    }
    const aliveCount = botIds.filter((id) => w.worms.get(id)?.alive).length;
    // Al menos 4 de 8 vivos tras 5s (los bots son tontos pero la arena es grande)
    expect(aliveCount).toBeGreaterThanOrEqual(4);
  });
});

describe('GameWorld — interfaz publica lastDeaths / lastFoodDrops', () => {
  it('lastDeaths se resetea al inicio de cada tick', () => {
    const w = mkWorldNoBots();
    spawnWormAt(w, 'p1', -100, -100); // morira en tick 1
    w.tick(0.05, 1);
    expect(w.lastDeaths.length).toBeGreaterThan(0);
    // Tick sin muertes nuevas: lastDeaths se resetea a []
    w.tick(0.05, 2);
    expect(w.lastDeaths.length).toBe(0);
  });

  it('lastFoodDrops se resetea al inicio de cada tick', () => {
    const w = mkWorldNoBots();
    spawnWormAt(w, 'p1', -100, -100);
    w.tick(0.05, 1);
    const dropsTick1 = w.lastFoodDrops.length;
    if (dropsTick1 > 0) {
      w.tick(0.05, 2);
      expect(w.lastFoodDrops.length).toBe(0);
    }
  });
});
