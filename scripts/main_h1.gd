# scripts/main_h1.gd
# Punto de entrada para el demo H1 single-player.
# Carga WormArena, crea HUD (labels) via código, wirea input de ratón/teclado.
# No toca scripts/main.gd (maze demo del scaffold sigue intacto).
extends Node2D

var arena: WormArena
var score_label: Label
var length_label: Label
var state_label: Label

func _ready() -> void:
	# Arena
	arena = WormArena.new()
	arena.name = "WormArena"
	add_child(arena)
	arena.setup()
	# HUD labels via código (CanvasLayer para que ignoren la cámara)
	var hud_layer := CanvasLayer.new()
	hud_layer.name = "HUD"
	add_child(hud_layer)
	score_label = _make_label("Puntaje: 0", Vector2(16, 12))
	length_label = _make_label("Longitud: 10", Vector2(16, 40))
	state_label = _make_label("", Vector2(16, 68), 600)
	hud_layer.add_child(score_label)
	hud_layer.add_child(length_label)
	hud_layer.add_child(state_label)
	# Conectar señales
	arena.score_changed.connect(func(s): score_label.text = "Puntaje: %d" % s)
	arena.length_changed.connect(func(l): length_label.text = "Longitud: %d" % l)
	arena.game_state_changed.connect(_on_state_changed)

func _make_label(text: String, pos: Vector2, width: float = 200.0) -> Label:
	var l := Label.new()
	l.text = text
	l.position = pos
	l.size = Vector2(width, 24)
	l.add_theme_font_size_override("font_size", 16)
	l.add_theme_color_override("font_color", Color(0.96, 0.97, 0.95))
	return l

func _on_state_changed(state: String) -> void:
	match state:
		"playing": state_label.text = ""
		"dead": state_label.text = "Has muerto — reapareciendo en 2s…"
		"paused": state_label.text = "Pausa (P para reanudar)"

func _process(_delta: float) -> void:
	# Mapear posición del ratón a coordenadas del mundo via la cámara
	var mouse_screen := get_viewport().get_mouse_position()
	var cam := arena._camera
	var world_pos: Vector2 = cam.get_canvas_transform().affine_inverse() * mouse_screen
	arena.set_player_target(world_pos)

func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		arena.set_player_boost(event.pressed)
	elif event is InputEventKey:
		if event.physical_keycode == KEY_SPACE:
			arena.set_player_boost(event.pressed)
		elif event.physical_keycode == KEY_P and event.pressed:
			if arena.game_state == "playing":
				arena.pause()
			elif arena.game_state == "paused":
				arena.resume()
