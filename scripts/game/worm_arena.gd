# scripts/game/worm_arena.gd
# Arena Wormzilla 2D 4000x4000. H1: single-player con bots locales.
# H2: reemplazar _process por recv de snapshots del servidor Node via WebSocket.
#
# v0.4.8: arena completa para H1:
# - Player worm controlada por ratón (target) + click/Space (boost)
# - 6 bots con FSM mínima WANDER/SEEK_FOOD
# - Comida procedural dispersa (FOOD_CAP items)
# - Colisiones: head vs borde (muerte), head vs body ajeno (muerte),
#   head vs head (BOTH_DIE según ADR-003)
# - Food drop al morir (1 de cada 3 segmentos → pellet)
# - Respawn automático tras RESPAWN_MS
# - HUD signal: score_changed, length_changed, game_state_changed
extends Node2D
class_name WormArena

signal score_changed(score: int)
signal length_changed(length: int)
signal game_state_changed(state: String)  # "playing" | "dead" | "paused"

const WormType := preload("res://scripts/entities/worm.gd")
const FoodType := preload("res://scripts/entities/food.gd")
const WormConstants := preload("res://scripts/game/worm_constants.gd")

# v0.4.9 fix #11: usar WormConstants (synced de protocol.mjs) en vez de hardcoded
const WORLD_W := WormConstants.WIDTH
const WORLD_H := WormConstants.HEIGHT
const FOOD_CAP := WormConstants.FOOD_CAP
const INITIAL_LENGTH := WormConstants.INITIAL_LENGTH
const BASE_SPEED := WormConstants.BASE_SPEED
const RESPAWN_MS := WormConstants.RESPAWN_MS
const HIT_RADIUS := WormConstants.HIT_RADIUS
const FOOD_FROM_DEATH_RATIO := WormConstants.FOOD_FROM_DEATH_SEGMENTS_RATIO
const BOT_COUNT := 6
const MAX_BOT_TARGETS := 5

var player: Worm = null
var bots: Array = []  # Array[Worm]
var food_items: Dictionary = {}  # id -> Food
var _food_id_counter: int = 0
var score: int = 0
var elapsed_seconds: float = 0.0
var game_state: String = "playing"

var _world_root: Node2D
var _camera: Camera2D
var _input_enabled: bool = true
var _dead_timer: float = 0.0  # cuenta atrás para respawn del player
var _bot_fsm: Dictionary = {}  # bot_id -> { state, timer }

# v0.4.11 ADR-010 §6: modo H2 (servidor autoritativo).
# En H2: no spawneamos bots ni food localmente, no corremos colisiones,
# no matamos localmente. Todo viene del snapshot.
var _online_mode: bool = false
var _connection: Node = null  # WormConnection instance
var _remote_worms: Dictionary = {}  # id -> Worm (worms ajenos)
var _last_seq: int = 0
var _process_dt: float = 0.016  # último dt para pasar a reconcile

# ─── Setup ──────────────────────────────────────────────────────────────
func setup() -> void:
	# Modo H1 (local, single-player con bots).
	_online_mode = false
	_world_root = Node2D.new()
	_world_root.name = "WorldRoot"
	add_child(_world_root)
	_camera = Camera2D.new()
	_camera.make_current()
	_camera.limit_left = 0
	_camera.limit_top = 0
	_camera.limit_right = WORLD_W
	_camera.limit_bottom = WORLD_H
	add_child(_camera)
	_spawn_player()
	_spawn_bots(BOT_COUNT)
	_spawn_initial_food()
	set_process(true)
	game_state_changed.emit("playing")

func setup_online(connection: Node) -> void:
	# Modo H2 (servidor autoritativo). ADR-010 §6.
	# No spawneamos bots ni food localmente — todo viene del snapshot.
	# Player se spawnea cuando llega el welcome con playerId.
	_online_mode = true
	_connection = connection
	_world_root = Node2D.new()
	_world_root.name = "WorldRoot"
	add_child(_world_root)
	_camera = Camera2D.new()
	_camera.make_current()
	_camera.limit_left = 0
	_camera.limit_top = 0
	_camera.limit_right = WORLD_W
	_camera.limit_bottom = WORLD_H
	add_child(_camera)
	# Conectar señales del connection
	_connection.welcome.connect(_on_welcome)
	_connection.snapshot.connect(_on_snapshot)
	_connection.disconnected.connect(_on_disconnect)
	set_process(true)
	game_state_changed.emit("playing")

func _on_welcome(player_id: String, world_info: Dictionary) -> void:
	# Spawn del player con el id asignado por el servidor.
	player = WormType.new()
	player.setup(player_id, "Player", 0, Vector2(WORLD_W / 2.0, WORLD_H / 2.0), 0.0, false)
	player.died.connect(_on_player_died)
	_world_root.add_child(player)
	length_changed.emit(player.length)
	# Enviar primer input (target inicial = spawn)
	_connection.send_target(player.head.x, player.head.y)

func _on_disconnect(_reason: String) -> void:
	# El connection se reconecta solo. Aquí solo actualizamos UI.
	game_state_changed.emit("paused")

func _on_snapshot(snap: Dictionary) -> void:
	# ADR-010 §5-6: cliente nunca mata, nunca come, nunca colisiona.
	# Solo aplica snapshots a worms.
	_last_seq = int(snap.get("seq", 0))
	var players_arr: Array = snap.get("players", [])
	var my_id: String = _connection.player_id() if _connection else ""
	# Aplicar a cada worm del snapshot
	var seen_ids: Dictionary = {}
	for p in players_arr:
		var pid: String = String(p.get("id", ""))
		seen_ids[pid] = true
		if pid == my_id:
			if player:
				player.reconcile_from_snapshot(p, _process_dt)
		else:
			if not _remote_worms.has(pid):
				var w := WormType.new()
				w.setup(pid, String(p.get("name", pid)), int(p.get("skin", 0)), Vector2(WORLD_W / 2.0, WORLD_H / 2.0), 0.0, true)
				_world_root.add_child(w)
				_remote_worms[pid] = w
			_remote_worms[pid].reconcile_from_snapshot(p, _process_dt)
	# Eliminar worms remotos que ya no están en el snapshot
	for pid in _remote_worms.keys():
		if not seen_ids.has(pid):
			var w = _remote_worms[pid]
			if is_instance_valid(w):
				w.queue_free()
			_remote_worms.erase(pid)
	# Deaths: §5 — solo animar, no decidir
	var deaths: Array = snap.get("deaths", [])
	for d in deaths:
		var dead_id: String = String(d.get("playerId", ""))
		if dead_id == my_id and player and player.alive:
			player.die()
		elif _remote_worms.has(dead_id) and _remote_worms[dead_id].alive:
			_remote_worms[dead_id].die()
	# Leaderboard: emitir señal para HUD
	# (H2: el leaderboard viene del snapshot, no lo calculamos localmente)
	var lb: Array = snap.get("leaderboard", [])
	if lb.size() > 0:
		# Reusar score_changed signal con el score del player desde el leaderboard
		for entry in lb:
			if String(entry.get("id", "")) == my_id:
				score = int(entry.get("score", score))
				score_changed.emit(score)
				break
	# Ack al servidor
	if _connection and _connection.is_open():
		_connection.send_ack(_last_seq)

func _spawn_player() -> void:
	player = WormType.new()
	player.setup("player", "Player", 0, Vector2(WORLD_W / 2.0, WORLD_H / 2.0), 0.0, false)
	player.died.connect(_on_player_died)
	_world_root.add_child(player)
	length_changed.emit(player.length)

func _spawn_bots(n: int) -> void:
	for i in range(n):
		var bot := WormType.new()
		var spawn := _random_spawn()
		bot.setup("bot_%d" % i, "Bot%d" % (i + 1), i % 4, spawn, randf() * TAU, true)
		bot.died.connect(_on_bot_died.bind(bot))
		_world_root.add_child(bot)
		bots.append(bot)
		_bot_fsm[bot.id] = { "state": "WANDER", "timer": 0.0 }

func _spawn_initial_food() -> void:
	for i in range(FOOD_CAP):
		_spawn_food(_random_spawn(), i % 4)

func _spawn_food(pos: Vector2, kind: int = 0) -> Food:
	var f := FoodType.new()
	f.setup(_food_id_counter, kind, 1)
	f.set_position(pos)
	_world_root.add_child(f)
	food_items[_food_id_counter] = f
	_food_id_counter += 1
	return f

func _random_spawn() -> Vector2:
	var margin := 200.0
	return Vector2(
		margin + randf() * (WORLD_W - margin * 2.0),
		margin + randf() * (WORLD_H - margin * 2.0)
	)

# ─── Input ──────────────────────────────────────────────────────────────
func set_player_target(world_pos: Vector2) -> void:
	if player and player.alive:
		player.set_target(world_pos)

func set_player_boost(on: bool) -> void:
	if player:
		player.set_boost(on)

# ─── Tick ───────────────────────────────────────────────────────────────
func _process(delta: float) -> void:
	_process_dt = delta
	if game_state == "paused":
		return
	elapsed_seconds += delta
	if game_state == "dead":
		_dead_timer -= delta
		if _dead_timer <= 0.0:
			# En H2 el respawn lo dicta el servidor; en H1 local.
			if not _online_mode:
				_respawn_player()
			else:
				# Solicitar respawn al servidor
				if _connection and _connection.is_open():
					_connection.send_respawn()
		return
	if not _input_enabled:
		return
	if _online_mode:
		_process_online(delta)
	else:
		_process_local(delta)

func _process_local(delta: float) -> void:
	# H1: simulación local completa (player + bots + food + colisiones).
	if player and player.alive:
		player.update_local(delta, BASE_SPEED)
		_camera.position = player.head
		_check_eat(player)
		_check_collisions_for_worm(player)
	for bot in bots:
		if not bot.alive:
			continue
		_update_bot_fsm(bot, delta)
		bot.update_local(delta, BASE_SPEED)
		_check_eat(bot)
		_check_collisions_for_worm(bot)
	length_changed.emit(player.length if player else 0)

func _process_online(delta: float) -> void:
	# H2 ADR-010 §1: predicción local SOLO del gusano propio.
	# Worms ajenos se actualizan vía _on_snapshot + _process_reconciliation.
	if player and player.alive:
		player.update_local(delta, BASE_SPEED)
		_camera.position = player.head
		player._process_reconciliation(delta)
	# Worms remotos: procesar reconciliación pendiente (blend/snap_soft)
	for pid in _remote_worms:
		_remote_worms[pid]._process_reconciliation(delta)
	length_changed.emit(player.length if player else 0)

# ─── Bot FSM ────────────────────────────────────────────────────────────
func _update_bot_fsm(bot: Worm, delta: float) -> void:
	var state_info: Dictionary = _bot_fsm.get(bot.id, { "state": "WANDER", "timer": 0.0 })
	state_info.timer -= delta
	if state_info.timer <= 0.0:
		var states := ["WANDER", "SEEK_FOOD", "SEEK_FOOD", "WANDER"]  # buscar comida más frecuente
		state_info.state = states[randi() % states.size()]
		state_info.timer = 1.0 + randf() * 2.0
	if state_info.state == "WANDER":
		bot.set_target(Vector2(
			clampf(bot.head.x + (randf() - 0.5) * 400.0, 50.0, WORLD_W - 50.0),
			clampf(bot.head.y + (randf() - 0.5) * 400.0, 50.0, WORLD_H - 50.0)
		))
	elif state_info.state == "SEEK_FOOD":
		# Encontrar comida más cercana
		var nearest: Vector2 = bot.target
		var nearest_dist: float = INF
		for id in food_items:
			var f = food_items[id]
			var d := bot.head.distance_squared_to(f.position)
			if d < nearest_dist:
				nearest_dist = d
				nearest = f.position
		bot.set_target(nearest)
	_bot_fsm[bot.id] = state_info

# ─── Comida ─────────────────────────────────────────────────────────────
func _check_eat(worm: Worm) -> void:
	var to_remove: Array = []
	for id in food_items:
		var f = food_items[id]
		if worm.head.distance_to(f.position) < HIT_RADIUS + 4.0:
			to_remove.append(id)
			worm.grow(f.value)
			if worm == player:
				score += f.value
				score_changed.emit(score)
	for id in to_remove:
		var f = food_items[id]
		if is_instance_valid(f):
			f.queue_free()
		food_items.erase(id)
	# Mantener FOOD_CAP items
	while food_items.size() < FOOD_CAP:
		_spawn_food(_random_spawn(), randi() % 4)

# ─── Colisiones ─────────────────────────────────────────────────────────
func _check_collisions_for_worm(worm: Worm) -> void:
	if not worm.alive:
		return
	# Borde
	if worm.head.x <= 0.0 or worm.head.x >= WORLD_W or worm.head.y <= 0.0 or worm.head.y >= WORLD_H:
		_kill_worm(worm, null)
		return
	# Head vs body ajeno
	var all_worms: Array = [player] + bots
	var killer_id: String = ""
	for other in all_worms:
		if other == worm or not other.alive:
			continue
		for seg in other.segments():
			if worm.head.distance_to(seg) < HIT_RADIUS:
				killer_id = other.id
				break
		if killer_id != "":
			break
	if killer_id != "":
		_kill_worm(worm, killer_id)
		return
	# Head vs head (BOTH_DIE)
	for other in all_worms:
		if other == worm or not other.alive:
			continue
		if worm.head.distance_to(other.head) < HIT_RADIUS * 2.0:
			_kill_worm(worm, other.id)
			_kill_worm(other, worm.id)
			break

func _kill_worm(worm: Worm, killer_id: Variant) -> void:
	worm.die()
	_drop_worm_food(worm)

func _drop_worm_food(worm: Worm) -> void:
	var segs: Array = worm.segments()
	var i: int = 0
	for seg in segs:
		if i % FOOD_FROM_DEATH_RATIO == 0:
			_spawn_food(seg, 4)  # kind=4 = drop (gris)
		i += 1

# ─── Respawn ────────────────────────────────────────────────────────────
func _on_player_died() -> void:
	game_state = "dead"
	_dead_timer = float(RESPAWN_MS) / 1000.0
	game_state_changed.emit("dead")

func _on_bot_died(bot: Worm) -> void:
	# Respawn del bot tras RESPAWN_MS — usar Timer o _process acumulando
	# Para H1 simple: respawn inmediato en spawn alejado
	bot.alive = true
	var new_spawn := _random_spawn()
	bot.head = new_spawn
	bot.target = new_spawn
	bot.angle = randf() * TAU
	bot.length = INITIAL_LENGTH
	bot.mass = float(INITIAL_LENGTH)
	# Reset segments
	for s in bot._segment_nodes:
		if is_instance_valid(s):
			s.queue_free()
	bot._segment_nodes.clear()
	bot._segments.clear()
	bot._init_segments()
	_bot_fsm[bot.id] = { "state": "WANDER", "timer": 0.0 }

func _respawn_player() -> void:
	player.alive = true
	var new_spawn := _random_spawn()
	player.head = new_spawn
	player.target = new_spawn
	player.angle = randf() * TAU
	player.length = INITIAL_LENGTH
	player.mass = float(INITIAL_LENGTH)
	for s in player._segment_nodes:
		if is_instance_valid(s):
			s.queue_free()
	player._segment_nodes.clear()
	player._segments.clear()
	player._init_segments()
	game_state = "playing"
	game_state_changed.emit("playing")
	length_changed.emit(player.length)

# ─── Pausa ──────────────────────────────────────────────────────────────
func pause() -> void:
	if game_state == "playing":
		game_state = "paused"
		game_state_changed.emit("paused")

func resume() -> void:
	if game_state == "paused":
		game_state = "playing"
		game_state_changed.emit("playing")

# ─── F7 stubs: leaderboard + minimap (H2 los consumirá desde snapshots servidor)
func leaderboard() -> Array:
	# Top-10 worms vivas ordenadas por masa desc.
	var all: Array = []
	if player and player.alive:
		all.append({ "id": player.id, "name": player.worm_name, "score": int(player.mass) })
	for bot in bots:
		if bot.alive:
			all.append({ "id": bot.id, "name": bot.worm_name, "score": int(bot.mass) })
	all.sort_custom(func(a, b): return a.score > b.score)
	return all.slice(0, min(10, all.size()))

func minimap_data() -> Dictionary:
	# Posiciones normalizadas a [0,1] para render del minimap.
	# H2: el cliente puede renderizar esto en un Control esquina inferior derecha.
	var data := { "player": null, "bots": [], "food_sample": [] }
	if player:
		data.player = {
			"x": player.head.x / float(WORLD_W),
			"y": player.head.y / float(WORLD_H),
			"alive": player.alive
		}
	for bot in bots:
		data.bots.append({
			"x": bot.head.x / float(WORLD_W),
			"y": bot.head.y / float(WORLD_H),
			"alive": bot.alive
		})
	# Sample de comida (20 items para no mandar 500 al minimap)
	var food_arr: Array = food_items.values()
	var step := max(1, food_arr.size() / 20)
	for i in range(0, food_arr.size(), step):
		var f = food_arr[i]
		data.food_sample.append({ "x": f.position.x / float(WORLD_W), "y": f.position.y / float(WORLD_H) })
	return data
