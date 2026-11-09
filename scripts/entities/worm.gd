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

# v0.4.11 ADR-010: estado de reconciliación
# _reconcile_state: "idle" = sin blend pendiente, "blending" = blend suave,
#   "snap_soft" = tween 100ms hacia target
var _reconcile_state: String = "idle"
var _reconcile_target: Vector2 = Vector2.ZERO
var _snap_soft_start: Vector2 = Vector2.ZERO
var _snap_soft_timer: float = 0.0
const SNAP_SOFT_DURATION: float = 0.1  # 100 ms
const SNAP_UMBRAL: float = 18.0       # u — de ADR-006 v2
const SNAP_SOFT_UMBRAL: float = 100.0 # u — de ADR-010 §3

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

func reconcile_from_snapshot(s: Dictionary, dt: float = 0.016) -> void:
	# v0.4.11 ADR-010 §3: reconciliación con 3 umbrales.
	# delta < 18u → blend suave (1 - exp(-dt/0.10))
	# 18u ≤ delta < 100u → snap suave 100ms
	# delta ≥ 100u → snap duro
	# §5: cliente nunca mata — solo marca alive=false si server dice alive=false.
	if not s.get("alive", true):
		if alive:
			died.emit()
		alive = false
		return
	var server_head := Vector2(
		float(s.get("head", {}).get("x", head.x)),
		float(s.get("head", {}).get("y", head.y))
	)
	# Aplicar angle, mass, boost directamente (no necesitan reconciliación)
	angle = float(s.get("angle", angle))
	mass = float(s.get("mass", mass))
	boost = bool(s.get("boost", false))
	var new_length := int(s.get("length", length))
	# §3: umbrales sobre delta de head
	var delta: float = head.distance_to(server_head)
	if delta < SNAP_UMBRAL:
		# Blend suave frame-rate independent
		# Si dt == 0 (snapshot sin contexto), usar 0.15 (default 60 FPS)
		var blend_factor: float = 0.15 if dt <= 0.0 else (1.0 - exp(-dt / 0.10))
		head = head.lerp(server_head, blend_factor)
		_reconcile_state = "blending"
		_reconcile_target = server_head
	elif delta < SNAP_SOFT_UMBRAL:
		# Snap suave 100ms
		_reconcile_state = "snap_soft"
		_snap_soft_start = head
		_reconcile_target = server_head
		_snap_soft_timer = 0.0
	else:
		# Snap duro: teleport
		head = server_head
		_reconcile_state = "idle"
	# Length cambió → reconstruct path
	if new_length != length:
		length = new_length
		reconstruct_path()
	else:
		# Si head cambió (cualquier tier), actualizar segmentos visualmente
		reconstruct_path()

func _process_reconciliation(dt: float) -> void:
	# Llamado desde arena._process para cada worm en modo H2.
	# Continúa blend/snap_soft pendientes.
	if _reconcile_state == "snap_soft":
		_snap_soft_timer += dt
		var t: float = clampf(_snap_soft_timer / SNAP_SOFT_DURATION, 0.0, 1.0)
		head = _snap_soft_start.lerp(_reconcile_target, t)
		if t >= 1.0:
			_reconcile_state = "idle"
		reconstruct_path()
	elif _reconcile_state == "blending":
		head = head.lerp(_reconcile_target, 1.0 - exp(-dt / 0.10))
		if head.distance_to(_reconcile_target) < 1.0:
			_reconcile_state = "idle"
		reconstruct_path()

func reconstruct_path() -> void:
	# ADR-010 §4: reconstruir _segments desde head+angle+length a SEG_SPACING.
	# Reemplaza _rebuild_segments follow-the-leader (era H1 only).
	while _segment_nodes.size() < length:
		var node := make_segment_visual(_body_color, 1.0 if _segment_nodes.size() == 0 else 0.85)
		add_child(node)
		_segment_nodes.append(node)
	while _segment_nodes.size() > length:
		var node = _segment_nodes.pop_back()
		if is_instance_valid(node):
			node.queue_free()
	_segments.resize(length)
	if _segments.size() > 0:
		_segments[0] = head
	for i in range(1, length):
		_segments[i] = head - Vector2(cos(angle), sin(angle)) * SEG_SPACING * float(i)
	for i in range(min(_segment_nodes.size(), _segments.size())):
		if is_instance_valid(_segment_nodes[i]):
			_segment_nodes[i].position = _segments[i]
