# scripts/entities/worm.gd
# Gusano del cliente. Cabeza + segmentos visuales.
# H1: simulacion local (single-player con bots).
# H2: reconcile_from_snapshot cuando conecte al servidor Node via WebSocket.
#
# v0.4.9 (fixes vigia code review):
# - #11: usa WormConstants en vez de constantes hardcoded.
# - #10: bug `diff += PI` → `diff += TAU` (normalización de ángulos).
# - #16: MAX_TURN_PER_SEC ahora viene de WormConstants (synced de protocol.mjs).
# - #2: reconcile_from_snapshot reconstruye _segments desde head+angle+length
#   (path-sampling puro, no follow-the-leader) — correcto para ADR-006 Opción 1.
# - boost cost 0.5 confirmado (synced con servidor).
extends Node2D
class_name Worm

signal ate_food(amount: int)
signal died

const WormConstants := preload("res://scripts/game/worm_constants.gd")
const SkinCatalog := preload("res://scripts/game/skin_catalog.gd")

# Alias a constantes synced para legibilidad
const SEG_SPACING := WormConstants.SEG_SPACING
const HIT_RADIUS := WormConstants.HIT_RADIUS
const MAX_TURN_PER_SEC := WormConstants.MAX_TURN_PER_SEC
const BOOST_SPEED_MULT := WormConstants.BOOST_SPEED_MULT
const BOOST_MASS_COST_PER_SEC := WormConstants.BOOST_MASS_COST_PER_SEC
const INITIAL_LENGTH := WormConstants.INITIAL_LENGTH
const BASE_SPEED := WormConstants.BASE_SPEED

var id: String = ""
var worm_name: String = ""
var skin: int = 0
var head: Vector2 = Vector2.ZERO
var angle: float = 0.0
var length: int = INITIAL_LENGTH
var mass: float = float(INITIAL_LENGTH)
var boost: bool = false
var alive: bool = true
var target: Vector2 = Vector2.ZERO
var is_bot: bool = false

var _segments: Array = []  # Array[Vector2] — posiciones del cuerpo (cabeza al final)
var _segment_nodes: Array = []  # Array[Node2D] — nodos visuales
var _boost_accumulator: float = 0.0
var _body_color: Color = Color(1.0, 0.8, 0.3)  # amarillo cálido por defecto (jugador)

# Stub visual: el sprite real vendra del catalogo de skins. Por ahora ColorRect.
static func make_segment_visual(color: Color, scale: float = 1.0) -> Node2D:
	var n := Node2D.new()
	var c := ColorRect.new()
	c.size = Vector2(SEG_SPACING * scale, SEG_SPACING * scale)
	c.position = -c.size / 2
	c.color = color
	n.add_child(c)
	return n

func setup(p_id: String, p_name: String, p_skin: int, p_head: Vector2, p_angle: float, p_is_bot: bool = false) -> void:
	id = p_id
	worm_name = p_name
	skin = p_skin
	head = p_head
	angle = p_angle
	target = p_head
	is_bot = p_is_bot
	_body_color = _color_for_role(p_is_bot, p_skin)
	_init_segments()

func _color_for_role(is_bot_arg: bool, skin_idx: int) -> Color:
	# v0.4.10: skins desde SkinCatalog (F8). 8 skins disponibles.
	# Skin NO afecta hitbox — HIT_RADIUS se lee de WormConstants en worm_arena.gd.
	return SkinCatalog.body_color(skin_idx)

func _init_segments() -> void:
	_segments.clear()
	for i in range(length):
		_segments.append(head - Vector2(cos(angle), sin(angle)) * SEG_SPACING * float(i))
	for s in _segment_nodes:
		if is_instance_valid(s):
			s.queue_free()
	_segment_nodes.clear()
	for i in range(length):
		var node := make_segment_visual(_body_color, 1.0 if i == 0 else 0.85)
		node.position = _segments[i]
		add_child(node)
		_segment_nodes.append(node)

func set_target(p_target: Vector2) -> void:
	target = p_target

func set_boost(on: bool) -> void:
	boost = on and mass > float(INITIAL_LENGTH)

func update_local(dt: float, speed: float) -> void:
	if not alive:
		return
	# Girar hacia target
	var dx := target.x - head.x
	var dy := target.y - head.y
	if dx != 0.0 or dy != 0.0:
		var target_angle := atan2(dy, dx)
		var max_turn := MAX_TURN_PER_SEC * dt
		var diff := target_angle - angle
		# FIX #10: normalización correcta con TAU (no PI)
		while diff > PI: diff -= TAU
		while diff < -PI: diff += TAU
		angle += clampf(diff, -max_turn, max_turn)
	# Mover cabeza
	var v := speed * (BOOST_SPEED_MULT if boost else 1.0)
	head.x += cos(angle) * v * dt
	head.y += sin(angle) * v * dt
	# Follow-the-leader: cada segmento sigue al anterior manteniendo SEG_SPACING.
	# Para H1 esto es suficiente; H2 usará reconcile_from_snapshot con
	# path-sampling puro (reconstruct desde head+angle+length).
	if _segments.size() > 0:
		_segments[0] = head.duplicate()
		for i in range(1, _segments.size()):
			var prev: Vector2 = _segments[i - 1]
			var cur: Vector2 = _segments[i]
			var dvec: Vector2 = cur - prev
			var dlen: float = dvec.length()
			if dlen > SEG_SPACING:
				_segments[i] = prev + dvec.normalized() * SEG_SPACING
			elif dlen < SEG_SPACING * 0.5 and dlen > 0.001:
				_segments[i] = prev + dvec.normalized() * SEG_SPACING
	# Sincronizar nodos visuales con _segments
	for i in range(min(_segment_nodes.size(), _segments.size())):
		if is_instance_valid(_segment_nodes[i]):
			_segment_nodes[i].position = _segments[i]
	# Boost consume masa (cost 0.5/s, synced con servidor)
	if boost and mass > float(INITIAL_LENGTH):
		_boost_accumulator += BOOST_MASS_COST_PER_SEC * dt
		if _boost_accumulator >= 1.0:
			var lost := int(_boost_accumulator)
			mass -= float(lost)
			_boost_accumulator -= float(lost)
			if mass <= float(INITIAL_LENGTH):
				mass = float(INITIAL_LENGTH)
				boost = false

func grow(amount: int) -> void:
	length += amount
	mass += float(amount)
	var last_pos: Vector2 = _segments.back() if _segments.size() > 0 else head
	var node := make_segment_visual(_body_color, 0.85)
	node.position = last_pos
	add_child(node)
	_segment_nodes.append(node)
	_segments.append(last_pos)
	ate_food.emit(amount)

func segments() -> Array:
	return _segments

func die() -> void:
	if alive:
		alive = false
		died.emit()

func reconcile_from_snapshot(s: Dictionary) -> void:
	# FIX #2: H2 — reconstruir _segments desde head+angle+length (path-sampling
	# puro, ADR-006 Opción 1). No conservamos el follow-the-leader state local
	# porque el servidor es autoritativo y solo manda head+angle+length.
	if not s.get("alive", true):
		if alive:
			died.emit()
		alive = false
		return
	var new_head := Vector2(
		s.get("head", {}).get("x", head.x),
		s.get("head", {}).get("y", head.y)
	)
	var new_angle: float = s.get("angle", angle)
	var new_length: int = int(s.get("length", length))
	var new_mass: float = float(s.get("mass", mass))
	var new_boost: bool = bool(s.get("boost", false))
	# Aplicar
	head = new_head
	angle = new_angle
	length = new_length
	mass = new_mass
	boost = new_boost
	# Reconstruir _segments desde cero: cabeza + N-1 segmentos hacia atrás
	# según angle (cuerpo sigue la dirección opuesta al avance).
	# Esto es una aproximación; el servidor puede enviar path completo a 1Hz
	# para corrección fina (ADR-006).
	var need_rebuild := _segments.size() != length
	if need_rebuild:
		# Ajustar nodos visuales
		while _segment_nodes.size() < length:
			var node := make_segment_visual(_body_color, 0.85)
			add_child(node)
			_segment_nodes.append(node)
		while _segment_nodes.size() > length:
			var node = _segment_nodes.pop_back()
			if is_instance_valid(node):
				node.queue_free()
		_segments.resize(length)
	# Llenar posiciones: cabeza en [0], resto hacia atrás según angle
	if _segments.size() > 0:
		_segments[0] = head
	for i in range(1, length):
		_segments[i] = head - Vector2(cos(angle), sin(angle)) * SEG_SPACING * float(i)
	# Sincronizar visuales
	for i in range(min(_segment_nodes.size(), _segments.size())):
		if is_instance_valid(_segment_nodes[i]):
			_segment_nodes[i].position = _segments[i]
