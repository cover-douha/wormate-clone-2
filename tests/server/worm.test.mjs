// tests/server/worm.test.mjs
// Tests unitarios del modelo Worm del servidor.
import { describe, it, expect } from 'vitest';
import { Worm } from '../../server/game/worm.mjs';
import { WORLD } from '../../server/protocol.mjs';

function mkWorm(overrides = {}) {
  return new Worm({
    id: 'w1', name: 'P1', skin: 0,
    head: { x: 1000, y: 1000 }, angle: 0,
    ...overrides,
  });
}

describe('Worm — construccion', () => {
  it('inicializa con longitud y masa iniciales', () => {
    const w = mkWorm();
    expect(w.length).toBe(WORLD.INITIAL_LENGTH);
    expect(w.mass).toBe(WORLD.INITIAL_LENGTH);
    expect(w.alive).toBe(true);
    expect(w.boost).toBe(false);
  });

  it('inicializa path con un sample en la posicion de la cabeza', () => {
    const w = mkWorm({ head: { x: 200, y: 300 } });
    expect(w.path.length).toBe(1);
    expect(w.path[0]).toEqual({ x: 200, y: 300 });
  });
});

describe('Worm — input', () => {
  it('setTarget actualiza el target', () => {
    const w = mkWorm();
    w.setTarget({ x: 500, y: 500 });
    expect(w.target).toEqual({ x: 500, y: 500 });
  });

  it('setBoost requiere masa > INITIAL_LENGTH', () => {
    const w = mkWorm();
    w.setBoost(true);
    expect(w.boost).toBe(false); // sin masa extra, no se activa
    w.mass = WORLD.INITIAL_LENGTH + 5;
    w.setBoost(true);
    expect(w.boost).toBe(true);
  });
});

describe('Worm — tick movimiento', () => {
  it('mueve la cabeza en direccion del angulo', () => {
    const w = mkWorm({ head: { x: 1000, y: 1000 }, angle: 0 });
    const x0 = w.head.x;
    w.tick(0.05); // 1 tick = 50ms
    expect(w.head.x).toBeGreaterThan(x0);
    expect(w.head.y).toBeCloseTo(1000, 1);
  });

  it('gira hacia el target dentro del limite angular', () => {
    const w = mkWorm({ head: { x: 1000, y: 1000 }, angle: 0 });
    w.setTarget({ x: 1000, y: 1100 }); // target abajo → angulo objetivo π/2
    w.tick(0.05);
    // maxTurn = 4 * dt = 0.2 rad; π/2 ≈ 1.57, no llega en un tick
    expect(w.angle).toBeGreaterThan(0);
    expect(w.angle).toBeLessThan(Math.PI / 2);
  });

  it('no gira si target == head', () => {
    const w = mkWorm({ head: { x: 1000, y: 1000 }, angle: 0.5 });
    w.setTarget({ x: 1000, y: 1000 });
    const a0 = w.angle;
    w.tick(0.05);
    expect(w.angle).toBeCloseTo(a0, 6);
  });
});

describe('Worm — bordes', () => {
  it('muere si la cabeza sale del mundo', () => {
    const w = mkWorm({ head: { x: WORLD.WIDTH - 1, y: 1000 }, angle: 0 });
    w.tick(0.05);
    expect(w.alive).toBe(false);
  });

  it('no mueve ni cambia path si esta muerto', () => {
    const w = mkWorm();
    w.alive = false;
    const head0 = { ...w.head };
    const pathLen0 = w.path.length;
    w.tick(0.05);
    expect(w.head).toEqual(head0);
    expect(w.path.length).toBe(pathLen0);
  });
});

describe('Worm — path sampling', () => {
  it('agrega un sample al path cuando la cabeza se mueve >= ~SEG_SPACING/2', () => {
    const w = mkWorm({ head: { x: 1000, y: 1000 }, angle: 0 });
    const initialPathLen = w.path.length;
    // Velocidad = BASE_SPEED * dt = 120 * 0.05 = 6 u por tick (~< SEG_SPACING/2 = 4)
    // Necesitamos varios ticks para que se agregue un sample
    for (let i = 0; i < 10; i++) w.tick(0.05);
    expect(w.path.length).toBeGreaterThan(initialPathLen);
  });

  it('trunca el path a maxPathLen = ceil(length * SEG_SPACING * 1.5)', () => {
    const w = mkWorm({ head: { x: 1000, y: 1000 }, angle: 0 });
    // Forzar path muy largo creciendo mucho
    w.grow(100);
    for (let i = 0; i < 500; i++) w.tick(0.05);
    const maxLen = Math.ceil(w.length * WORLD.SEG_SPACING * 1.5);
    expect(w.path.length).toBeLessThanOrEqual(maxLen);
  });
});

describe('Worm — boost', () => {
  it('consume masa cuando el acumulador llega a 1', () => {
    const w = mkWorm({ head: { x: 1000, y: 1000 }, angle: 0 });
    w.mass = WORLD.INITIAL_LENGTH + 10;
    w.setBoost(true);
    const mass0 = w.mass;
    // 2 segundos de boost = acumula ~1 unidad
    for (let i = 0; i < 40; i++) w.tick(0.05); // 40 * 0.05 = 2s
    expect(w.mass).toBeLessThan(mass0);
  });

  it('desactiva boost si masa baja a INITIAL_LENGTH', () => {
    const w = mkWorm({ head: { x: 1000, y: 1000 }, angle: 0 });
    w.mass = WORLD.INITIAL_LENGTH + 1;
    w.setBoost(true);
    // Consumir hasta bajar masa
    for (let i = 0; i < 100; i++) w.tick(0.05);
    expect(w.boost).toBe(false);
  });
});

describe('Worm — grow/die/snapshot', () => {
  it('grow incrementa length y mass', () => {
    const w = mkWorm();
    const l0 = w.length, m0 = w.mass;
    w.grow(3);
    expect(w.length).toBe(l0 + 3);
    expect(w.mass).toBe(m0 + 3);
  });

  it('die marca alive=false y devuelve array de comida', () => {
    const w = mkWorm({ head: { x: 1000, y: 1000 }, angle: 0 });
    // Avanzar un poco para tener path con varios samples
    for (let i = 0; i < 5; i++) w.tick(0.05);
    const drops = w.die();
    expect(w.alive).toBe(false);
    expect(Array.isArray(drops)).toBe(true);
    expect(drops.length).toBeGreaterThan(0);
    expect(drops[0]).toHaveProperty('x');
    expect(drops[0]).toHaveProperty('y');
    expect(drops[0]).toHaveProperty('value');
  });

  it('snapshot tiene la forma esperada', () => {
    const w = mkWorm();
    const s = w.snapshot();
    expect(s).toMatchObject({
      id: 'w1', name: 'P1', skin: 0,
      length: WORLD.INITIAL_LENGTH, mass: WORLD.INITIAL_LENGTH,
      boost: false, alive: true,
    });
    expect(s.head).toEqual({ x: 1000, y: 1000 });
  });
});
