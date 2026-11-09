# scripts/net/connection.gd
# H2: conexión WebSocket al servidor Node autoritativo (ADR-005).
# Envoltorio sobre WebSocketPeer de Godot 4.
#
# Protocolo (JSON mientras protocol.mjs binario no se active en servidor):
#   Cliente → Servidor:
#     {t:'hello', name:String, skin:int}
#     {t:'target', x:float, y:float}
#     {t:'boost_start'} / {t:'boost_stop'}
#     {t:'respawn'}
#     {t:'ack', seq:int}
#   Servidor → Cliente:
#     {t:'welcome', playerId:String, protocol:int, world:{width,height,tickHz}}
#     {t:'snapshot', seq:int, players:[], food:[], deaths:[], leaderboard:[]}
#     {t:'error', code:String}
#
# Reconexión automática tras 2s de disconnect.
extends Node
class_name WormConnection

signal welcome(player_id: String, world: Dictionary)
signal snapshot(snap: Dictionary)
signal disconnected(reason: String)
signal connected()

const DEFAULT_URL := "ws://localhost:8080/ws"
const RECONNECT_DELAY_MS := 2000
const PROTOCOL_VERSION := 1

var url: String = DEFAULT_URL
var _peer: WebSocketPeer
var _state: String = "idle"  # "idle" | "connecting" | "open" | "closed"
var _reconnect_at: int = 0  # timestamp ms epoch para reconectar
var _player_id: String = ""
var _hello_sent: bool = false

func setup(p_url: String = DEFAULT_URL) -> void:
	url = p_url
	_peer = WebSocketPeer.new()
	_state = "idle"

func connect_to_server(p_url: String = "") -> void:
	if p_url != "":
		url = p_url
	_disconnect_internal()
	var err := _peer.connect_to_url(url)
	if err != OK:
		push_error("[connection] error connect_to_url: %d" % err)
		_schedule_reconnect()
		return
	_state = "connecting"
	_hello_sent = false

func is_open() -> bool:
	return _state == "open"

func is_connecting() -> bool:
	return _state == "connecting"

func player_id() -> String:
	return _player_id

func send_hello(name: String, skin: int) -> bool:
	if not is_open() or _hello_sent:
		return false
	var msg := { "t": "hello", "name": name, "skin": skin }
	var ok := _send_json(msg)
	if ok:
		_hello_sent = true
	return ok

func send_target(x: float, y: float) -> bool:
	return _send_json({ "t": "target", "x": x, "y": y })

func send_boost_start() -> bool:
	return _send_json({ "t": "boost_start" })

func send_boost_stop() -> bool:
	return _send_json({ "t": "boost_stop" })

func send_respawn() -> bool:
	return _send_json({ "t": "respawn" })

func send_ack(seq: int) -> bool:
	return _send_json({ "t": "ack", "seq": seq })

func close() -> void:
	_disconnect_internal()
	_state = "idle"
	_reconnect_at = 0

func _process(_delta: float) -> void:
	if _state == "idle":
		return
	_peer.poll()
	var ready_state := _peer.get_ready_state()
	match ready_state:
		WebSocketPeer.STATE_OPEN:
			if _state != "open":
				_state = "open"
				connected.emit()
			while _peer.get_available_packet_count() > 0:
				var pkt: PackedByteArray = _peer.get_packet()
				_handle_packet(pkt)
		WebSocketPeer.STATE_CONNECTING:
			pass
		WebSocketPeer.STATE_CLOSING:
			pass
		WebSocketPeer.STATE_CLOSED:
			_handle_closed()
	if _state == "closed" and _reconnect_at > 0:
		var now := Time.get_ticks_msec()
		if now >= _reconnect_at:
			_reconnect_at = 0
			connect_to_server(url)

func _handle_packet(pkt: PackedByteArray) -> void:
	var text := pkt.get_string_from_utf8()
	var parsed: Variant = JSON.parse_string(text)
	if parsed == null or not parsed is Dictionary:
		return
	var msg: Dictionary = parsed
	match msg.get("t", ""):
		"welcome":
			_player_id = String(msg.get("playerId", ""))
			var world_info: Dictionary = msg.get("world", {})
			welcome.emit(_player_id, world_info)
		"snapshot":
			snapshot.emit(msg)
		"error":
			push_warning("[connection] server error: %s" % msg.get("code", "UNKNOWN"))
		_:
			pass

func _handle_closed() -> void:
	if _state == "closed":
		return
	_state = "closed"
	_hello_sent = false
	disconnected.emit("connection closed")
	_schedule_reconnect()

func _schedule_reconnect() -> void:
	_reconnect_at = Time.get_ticks_msec() + RECONNECT_DELAY_MS

func _disconnect_internal() -> void:
	if _peer and _peer.get_ready_state() != WebSocketPeer.STATE_CLOSED:
		_peer.close()
	_state = "idle"
	_hello_sent = false

func _send_json(obj: Dictionary) -> bool:
	if not is_open():
		return false
	var text := JSON.stringify(obj)
	_peer.send_text(text)
	return true
