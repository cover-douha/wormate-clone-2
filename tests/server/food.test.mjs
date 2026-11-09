// tests/server/food.test.mjs
// Tests unitarios del FoodSystem.
import { describe, it, expect } from 'vitest';
import { FoodSystem } from '../../server/game/food.mjs';
import { WORLD } from '../../server/protocol.mjs';

describe('FoodSystem — spawn', () => {
  it('spawn llena items hasta el target', () => {
    const f = new FoodSystem();
    f.spawn(100);
    expect(f.items.size).toBe(100);
  });

  it('spawn no excede el target', () => {
    const f = new FoodSystem();
    f.spawn(50);
    f.spawn(50); // ya tiene 50, no deberia agregar
    expect(f.items.size).toBe(50);
  });

  it('spawn por defecto usa FOOD_CAP', () => {
    const f = new FoodSystem();
    f.spawn();
    expect(f.items.size).toBe(WORLD.FOOD_CAP);
  });

  it('cada item tiene id, x, y, value, kind', () => {
    const f = new FoodSystem();
    f.spawn(5);
    for (const item of f.items.values()) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('x');
      expect(item).toHaveProperty('y');
      expect(item).toHaveProperty('value');
      expect(item).toHaveProperty('kind');
      expect(typeof item.x).toBe('number');
      expect(item.kind).toBeGreaterThanOrEqual(0);
      expect(item.kind).toBeLessThanOrEqual(3);
    }
  });
});

describe('FoodSystem — addDrop', () => {
  it('addDrop agrega item con kind=4 (drop)', () => {
    const f = new FoodSystem();
    f.addDrop({ x: 100, y: 200 });
    expect(f.items.size).toBe(1);
    const item = Array.from(f.items.values())[0];
    expect(item.kind).toBe(4);
    expect(item.x).toBe(100);
    expect(item.y).toBe(200);
  });

  it('addDrop respeta value personalizado', () => {
    const f = new FoodSystem();
    f.addDrop({ x: 100, y: 200, value: 5 });
    const item = Array.from(f.items.values())[0];
    expect(item.value).toBe(5);
  });
});

describe('FoodSystem — eatAt', () => {
  it('eatAt devuelve items dentro del radio', () => {
    const f = new FoodSystem();
    f.items.set(1, { id: 1, x: 100, y: 100, value: 1, kind: 0 });
    f.items.set(2, { id: 2, x: 110, y: 100, value: 1, kind: 1 });
    const eaten = f.eatAt({ x: 100, y: 100 }, 15);
    expect(eaten.length).toBe(2);
  });

  it('eatAt elimina los items consumidos', () => {
    const f = new FoodSystem();
    f.items.set(1, { id: 1, x: 100, y: 100, value: 1, kind: 0 });
    f.eatAt({ x: 100, y: 100 }, 15);
    expect(f.items.has(1)).toBe(false);
  });

  it('eatAt no toca items fuera del radio', () => {
    const f = new FoodSystem();
    f.items.set(1, { id: 1, x: 100, y: 100, value: 1, kind: 0 });
    f.items.set(2, { id: 2, x: 500, y: 500, value: 1, kind: 0 });
    const eaten = f.eatAt({ x: 100, y: 100 }, 15);
    expect(eaten.length).toBe(1);
    expect(f.items.has(2)).toBe(true);
  });
});

describe('FoodSystem — remove/snapshot', () => {
  it('remove elimina por id', () => {
    const f = new FoodSystem();
    f.items.set(1, { id: 1, x: 0, y: 0, value: 1, kind: 0 });
    f.items.set(2, { id: 2, x: 10, y: 10, value: 1, kind: 0 });
    f.remove(1);
    expect(f.items.size).toBe(1);
    expect(f.items.has(2)).toBe(true);
  });

  it('snapshot devuelve array de items', () => {
    const f = new FoodSystem();
    f.spawn(5);
    const snap = f.snapshot();
    expect(Array.isArray(snap)).toBe(true);
    expect(snap.length).toBe(5);
  });
});
