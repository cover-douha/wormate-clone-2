// server/game/worm.mjs
// Modelo de gusano del servidor. Cabeza + path + crecimiento + muerte.
// No es autoritativo en colisiones (eso lo hace GameWorld con Grid); solo se mueve y crece.

import { WORLD } from '../protocol.mjs';

export class Worm {
  constructor({ id, name, skin, head, angle }) {
    this.id = id;
    this.name = name;
    this.skin = skin;
    this.head = head;
    this.angle = angle;
    this.path = [{ ...head }]; // historial de posiciones de la cabeza
    this.length = WORLD.INITIAL_LENGTH;
    this.mass = WORLD.INITIAL_LENGTH;
    this.boost = false;
    this.alive = true;
    this.target = { ...head };
    this._boostAccumulator = 0;
  }

  setTarget(target) {
    this.target = { x: target.x, y: target.y };
  }

  setBoost(on) {
    this.boost = on && this.mass > WORLD.INITIAL_LENGTH;
  }

  tick(dt) {
    if (!this.alive) return;

    // Velocidad
    const speed = this.boost ? WORLD.BASE_SPEED * WORLD.BOOST_SPEED_MULT : WORLD.BASE_SPEED;

    // Angulo hacia target
    const dx = this.target.x - this.head.x;
    const dy = this.target.y - this.head.y;
    if (dx !== 0 || dy !== 0) {
      const targetAngle = Math.atan2(dy, dx);
      // Girar suavemente (no instantaneo) — limite angular por tick
      const maxTurn = 4 * dt; // rad/s
      let diff = targetAngle - this.angle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      this.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
    }

    // Mover cabeza
    this.head.x += Math.cos(this.angle) * speed * dt;
    this.head.y += Math.sin(this.angle) * speed * dt;

    // Wrap o clamp por bordes
    if (this.head.x < 0 || this.head.x > WORLD.WIDTH || this.head.y < 0 || this.head.y > WORLD.HEIGHT) {
      this.alive = false;
      return;
    }

    // Path: insertar nueva cabeza; recortar a length * SEG_SPACING distancia
    this.path.unshift({ x: this.head.x, y: this.head.y });
    const maxPathLen = Math.ceil(this.length * WORLD.SEG_SPACING * 1.5);
    if (this.path.length > maxPathLen) this.path.length = maxPathLen;

    // Boost consume masa
    if (this.boost) {
      this._boostAccumulator += WORLD.BOOST_MASS_COST_PER_SEC * dt;
      if (this._boostAccumulator >= 1) {
        const lost = Math.floor(this._boostAccumulator);
        this.mass -= lost;
        this._boostAccumulator -= lost;
        this.length = Math.max(WORLD.INITIAL_LENGTH, this.length - lost);
        // TODO H3: drop de comida en el rastro
        if (this.mass <= WORLD.INITIAL_LENGTH) this.boost = false;
      }
    }
  }

  grow(amount = 1) {
    this.length += amount;
    this.mass += amount;
  }

  die() {
    this.alive = false;
    // GameWorld recogera el path para soltar comida (onDeath en GDD)
    return this.path.map((p) => ({ x: p.x, y: p.y, value: 1 }));
  }

  snapshot() {
    return {
      id: this.id,
      head: { x: this.head.x, y: this.head.y },
      angle: this.angle,
      length: this.length,
      mass: this.mass,
      boost: this.boost,
      alive: this.alive,
      skin: this.skin,
      name: this.name,
    };
  }
}
