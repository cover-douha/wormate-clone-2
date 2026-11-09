// server/game/bots.mjs
// Reservado para IA avanzada (H3). La IA minima vive dentro de GameWorld._tickBots.
// H3: extraer aqui estados WANDER/SEEK_FOOD/AVOID_HEAD + rodear gusanos pequenos.

export const BOT_STATES = ['WANDER', 'SEEK_FOOD', 'AVOID_HEAD', 'ENCIRCLE'];

export function stepBot(bot, world, dt) {
  // TODO H3
  return bot;
}
