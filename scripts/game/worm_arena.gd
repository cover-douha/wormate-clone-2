# scripts/game/worm_arena.gd
# Reemplaza a maze_world.gd. Arena libre 2D 4000x4000, camara sigue al jugador, comida dispersa.
# H1: single-player con bots locales. H2: conecta al servidor Node via ws.
extends Node2D
class_name WormArena

signal score_changed(score: int)
signal died

const WormType := preload("res://scripts/entities/worm.gd")
const FoodType := preload("res://scripts/entities/food.gd")

const WORLD_W := 4000
const WORLD_H := 4000
const FOOD_CAP := 500
const INITIAL_LENGTH := 10
const BASE_SPEED := 120.0
const RESPAWN_MS := 2000.0

var player: Worm = null
var bots: Array[Worm] = []
var food_items: Dictionary = {}  # id -> Food
var score := 0
var elapsed_seconds := 0.0
var _camera: Camera2D
var _world_root: Node2D
var _input_enabled := true
var _simulation_active := true

# Stub: el binding real al servidor WebSocket se anade en H2.
# Para H1, el cliente es autoritativo localmente (single-player).

func setup() -> void:
	_world_root = Node2D.new()
	_world_root.name = "WorldRoot"
	add_child(_world_root)
	_camera = Camera2D.new()
	_camera.make_current()
	add_child(_camera)
	_spawn_player()
	_spawn_initial_food()
	set_process(true)

func _spawn_player() -> void:
	player = WormType.new()
	player.setup("player", "Player", 0, Vector2(WORLD_W / 2, WORLD_H / 2), 0.0)
	_world_root.add_child(player)

func _spawn_initial_food() -> void:
	for i in range(FOOD_CAP):
		var f := FoodType.new()
		f.setup(i, i % 4, 1)
		f.set_position(Vector2(randf() * WORLD_W, randf() * WORLD_H))
		_world_root.add_child(f)
		food_items[i] = f

func _process(delta: float) -> void:
	if not _simulation_active or not _input_enabled:
		return
	elapsed_seconds += delta
	if player and player.alive:
		# El target ya lo setea main.gd con la posicion del raton.
		player.update_local(delta, BASE_SPEED)
		_camera.position = player.head
		_check_food_collision()

func set_player_target(world_pos: Vector2) -> void:
	if player and player.alive:
		player.set_target(world_pos)

func set_player_boost(on: bool) -> void:
	if player:
		player.set_boost(on)

func _check_food_collision() -> void:
	if not player:
		return
	var to_remove := []
	for id in food_items:
		var f = food_items[id]
		var d := player.head.distance_to(f.position)
		if d < HIT_RADIUS + 4:
			to_remove.append(id)
			player._on_eat(1)  # placeholder; en H2 lo emite el servidor
			score += 1
			score_changed.emit(score)
	for id in to_remove:
		var f = food_items[id]
		if is_instance_valid(f):
			f.queue_free()
		food_items.erase(id)

const HIT_RADIUS := 12.0
