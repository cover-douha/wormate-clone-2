# scripts/entities/food.gd
# Comida del cliente. Solo visual; la autoridad de spawn/eat esta en el servidor.
extends Node2D
class_name Food

const KIND_COLORS := [
	Color(1.0, 0.4, 0.6),  # 0 - rosa
	Color(0.9, 0.6, 0.3),  # 1 - naranja
	Color(0.95, 0.85, 0.4), # 2 - amarillo
	Color(0.4, 0.9, 0.7),  # 3 - verde claro
	Color(0.7, 0.7, 0.7),  # 4 - drop (gris)
]

var id: int = 0
var kind: int = 0
var value: int = 1
var _visual: ColorRect

func setup(p_id: int, p_kind: int, p_value: int) -> void:
	id = p_id
	kind = p_kind
	value = p_value
	_visual = ColorRect.new()
	_visual.size = Vector2(8, 8)
	_visual.position = -_visual.size / 2
	_visual.color = KIND_COLORS[p_kind % KIND_COLORS.size()]
	add_child(_visual)

func set_position(p: Vector2) -> void:
	position = p
