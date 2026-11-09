# scripts/game/skin_catalog.gd
# Catálogo de skins cosméticos (F8). Mínimo 4 MVP; 8 para variedad.
# Cada skin define body_color + head_color + accent (para detalle opcional).
# CRÍTICO: skin NO afecta hitbox — todos los worms usan HIT_RADIUS=12 sin
# importar el skin elegido. La validación está en worm_arena.gd que usa
# HIT_RADIUS de WormConstants, no del skin.
extends RefCounted
class_name SkinCatalog

# 8 skins. Paleta inspirada en visual-spec.md pero extendida.
# Jugador puede elegir cualquiera; bots reciben skin por índice.
const SKINS := [
	{
		"id": 0, "name": "Limón",
		"body": Color(1.00, 0.80, 0.30),   # #FFCC4D amarillo cálido (default jugador)
		"head": Color(1.00, 0.95, 0.65),   # #FFF1A6
		"accent": Color(0.50, 0.40, 0.10)
	},
	{
		"id": 1, "name": "Menta",
		"body": Color(0.38, 0.90, 0.69),   # #61E6B0
		"head": Color(0.84, 1.00, 0.94),   # #D7FFF0
		"accent": Color(0.10, 0.40, 0.30)
	},
	{
		"id": 2, "name": "Frutilla",
		"body": Color(0.84, 0.36, 0.49),   # #D75B7D rosa rojizo (default rival)
		"head": Color(1.00, 0.44, 0.36),   # #FF705C
		"accent": Color(0.40, 0.10, 0.20)
	},
	{
		"id": 3, "name": "Cielo",
		"body": Color(0.36, 0.67, 0.91),   # #5CABE8
		"head": Color(0.78, 0.92, 1.00),
		"accent": Color(0.10, 0.30, 0.45)
	},
	{
		"id": 4, "name": "Lava",
		"body": Color(1.00, 0.42, 0.29),   # #FF6B4A
		"head": Color(1.00, 0.78, 0.20),
		"accent": Color(0.45, 0.10, 0.05)
	},
	{
		"id": 5, "name": "Violeta",
		"body": Color(0.58, 0.38, 0.85),
		"head": Color(0.85, 0.75, 1.00),
		"accent": Color(0.25, 0.10, 0.45)
	},
	{
		"id": 6, "name": "Carbón",
		"body": Color(0.32, 0.32, 0.36),
		"head": Color(0.62, 0.62, 0.68),
		"accent": Color(0.95, 0.95, 0.95)
	},
	{
		"id": 7, "name": "Bambú",
		"body": Color(0.65, 0.85, 0.30),
		"head": Color(0.90, 1.00, 0.60),
		"accent": Color(0.25, 0.40, 0.10)
	}
]

static func count() -> int:
	return SKINS.size()

static func get_skin(id: int) -> Dictionary:
	return SKINS[id % SKINS.size()]

static func body_color(id: int) -> Color:
	return get_skin(id).body

static func head_color(id: int) -> Color:
	return get_skin(id).head

static func accent_color(id: int) -> Color:
	return get_skin(id).accent

static func name_of(id: int) -> String:
	return get_skin(id).name

static func all_ids() -> Array:
	var ids: Array = []
	for s in SKINS:
		ids.append(s.id)
	return ids
