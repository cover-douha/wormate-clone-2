# scripts/entities/worm.gd
# Gusano del cliente. Cabeza + segmentos visuales.
# H1: simulacion local (single-player con bots).
# H2: reconcile_from_snapshot cuando conecte al servidor Node via WebSocket.
#
# v0.4.8: optimizacion — los segmentos se mueven in-place (cada Node2D ya
# creado cambia su position), no se rebuildan todos los frames. Solo se
# agrega/quita un nodo cuando length cambia.
extends Node2D
class_name Worm

signal ate_food(amount: int)
signal died

const SEG_SPACING := 8.0
const HIT_RADIUS := 12.0
const MAX_TURN_PER_SEC := 4.0  # rad/s — tuneable, igual que server
const BOOST_SPEED_MULT := 1.8
const BOOST_MASS_COST_PER_SEC := 0.5
const INITIAL_LENGTH := 10
const BASE_SPEED := 120.0

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
	# Paleta de visual-spec.md: jugador #FFCC4D, rival #D75B7D.
	# Por ahora: bots usan rosa rojizo con variación por skin.
	if is_bot_arg:
		var bot_colors := [Color(0.84, 0.36, 0.49), Color(0.92, 0.43, 0.36), Color(0.78, 0.40, 0.55), Color(0.88, 0.50, 0.40)]
		return bot_colors[skin_idx % bot_colors.size()]
	return Color(1.0, 0.80, 0.30)  # jugador amarillo cálido

func _init_segments() -> void:
	_segments.clear()
	for i in range(length):
		_segments.append(head - Vector2(cos(angle), sin(angle)) * SEG_SPACING * i)
	# Crear nodos visuales
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
		while diff > PI: diff -= TAU
		while diff < -PI: diff += PI
		angle += clampf(diff, -max_turn, max_turn)
	# Mover cabeza
	var v := speed * (BOOST_SPEED_MULT if boost else 1.0)
	head.x += cos(angle) * v * dt
	head.y += sin(angle) * v * dt
	# Shift segmentos: cada segmento toma la posición del anterior, el último cae
	# Estilo "follow the leader": el segmento i se mueve hacia el segmento i-1
	# manteniendo SEG_SPACING. Más eficiente que reconstruir todo.
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
				# Estirar si está demasiado cerca
				_segments[i] = prev + dvec.normalized() * SEG_SPACING
	# Sincronizar nodos visuales con _segments
	for i in range(min(_segment_nodes.size(), _segments.size())):
		if is_instance_valid(_segment_nodes[i]):
			_segment_nodes[i].position = _segments[i]
	# Boost consume masa
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
	# Agregar un nodo visual nuevo al final
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
	# H2: recibe estado autoritativo del servidor y lo aplica.
	if not s.get("alive", true):
		if alive:
			died.emit()
		alive = false
		return
	head = Vector2(s.get("head", {}).get("x", head.x), s.get("head", {}).get("y", head.y))
	angle = s.get("angle", angle)
	length = s.get("length", length)
	mass = s.get("mass", mass)
	boost = s.get("boost", boost)
	# Reconstruir si cambió length
	while _segments.size() < length:
		_segments.append(head.duplicate())
		var node := make_segment_visual(_body_color, 0.85)
		node.position = head
		add_child(node)
		_segment_nodes.append(node)
	while _segments.size() > length:
		_segments.pop_back()
		var node = _segment_nodes.pop_back()
		if is_instance_valid(node):
			node.queue_free()
