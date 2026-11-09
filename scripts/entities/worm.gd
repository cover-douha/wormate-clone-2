# scripts/entities/worm.gd
# Gusano del cliente. Cabeza + segmentos. Sigue snapshots del servidor (modo online)
# o se mueve localmente (modo single-player H1).
# Reemplaza conceptualmente a runner.gd; no deriva de el.
extends Node2D
class_name Worm

signal ate_food
signal died

const SEG_SPACING := 8.0
const HIT_RADIUS := 12.0

var id: String = ""
var name: String = ""
var skin: int = 0
var head: Vector2 = Vector2.ZERO
var angle: float = 0.0
var length: int = 10
var mass: float = 10.0
var boost: bool = false
var alive: bool = true
var target: Vector2 = Vector2.ZERO

var _segments: Array = []  # Array[Vector2]
var _segment_nodes: Array = []  # Array[Sprite2D]

# Stub visual: el sprite real vendra del catalogo de skins. Por ahora un circulo ColorRect.
static func make_segment_visual() -> Node2D:
	var n := Node2D.new()
	var c := ColorRect.new()
	c.size = Vector2(SEG_SPACING, SEG_SPACING)
	c.position = -c.size / 2
	c.color = Color(0.2, 0.7, 0.4)
	n.add_child(c)
	return n

func setup(p_id: String, p_name: String, p_skin: int, p_head: Vector2, p_angle: float) -> void:
	id = p_id
	name = p_name
	skin = p_skin
	head = p_head
	angle = p_angle
	target = p_head
	_rebuild_segments()

func _rebuild_segments() -> void:
	for s in _segment_nodes:
		if is_instance_valid(s):
			s.queue_free()
	_segment_nodes.clear()
	_segments.clear()
	for i in range(length):
		_segments.append(head - Vector2(cos(angle), sin(angle)) * SEG_SPACING * i)
		var node := make_segment_visual()
		node.position = _segments[i]
		add_child(node)
		_segment_nodes.append(node)

func set_target(p_target: Vector2) -> void:
	target = p_target

func set_boost(on: bool) -> void:
	boost = on

func update_local(dt: float, speed: float) -> void:
	# Movimiento local (single-player H1 o prediccion cliente).
	var dx := target.x - head.x
	var dy := target.y - head.y
	if dx != 0.0 or dy != 0.0:
		var target_angle := atan2(dy, dx)
		var max_turn := 4.0 * dt
		var diff := target_angle - angle
		while diff > PI: diff -= TAU
		while diff < -PI: diff += PI
		angle += clamp(diff, -max_turn, max_turn)
	var v := speed
	if boost: v *= 1.8
	head.x += cos(angle) * v * dt
	head.y += sin(angle) * v * dt
	_rebuild_segments()  # H1: simple; H2 usar interpolacion con path.

func reconcile_from_snapshot(s: Dictionary) -> void:
	# Recibe el estado autoritativo del servidor y lo aplica.
	# ADR-006: solo head+angle+length; reconstruir segmentos.
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
	if _segments.size() != length:
		_rebuild_segments()

func die() -> void:
	alive = false
	died.emit()
