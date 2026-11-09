# scripts/net/connection.gd
# H2: conexión WebSocket al servidor Node autoritativo (ADR-005).
# v0.4.12 ADR-011: detecta y decodifica snapshots binarios (magic 0x57 + header
# + JSON body + CRC16) además de JSON texto para mensajes de control.
#
# Protocolo:
#   Cliente → Servidor (JSON texto, ~50 bytes):
#     {t:'hello', name, skin}, {t:'target', x, y}, {t:'boost_start/stop'},
#     {t:'respawn'}, {t:'ack', seq}
#   Servidor → Cliente:
#     JSON texto: {t:'welcome', playerId, protocol, world}, {t:'error', code}
#     Binario (magic 0x57): snapshot delta según ADR-006 v2 / ADR-011
#       Header (10 bytes): magic(1) + version(1) + seq(4 BE) + lastAck(4 BE)
#       Body: JSON UTF-8 (players[], food[], deaths[], leaderboard[])
#       Trailer: CRC16 (2 bytes BE) sobre header+body
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
const MAGIC: int = 0x57  # 'W' — ADR-006 v2

var url: String = DEFAULT_URL
var _peer: WebSocketPeer
var _state: String = "idle"  # "idle" | "connecting" | "open" | "closed"
var _reconnect_at: int = 0
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
	var ok := _send_json({ "t": "hello", "name": name, "skin": skin })
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
	if pkt.size() == 0:
		return
	# ADR-011: distinguir binario (magic 0x57 primer byte) de JSON texto ('{').
	var first_byte := pkt[0]
	if first_byte == MAGIC:
		_handle_binary_snapshot(pkt)
	elif _peer.was_string_packet():
		_handle_json_text(pkt)
	else:
		# Binario sin magic — paquete desconocido, ignorar
		pass

func _handle_json_text(pkt: PackedByteArray) -> void:
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
			# Backward compat: servidor viejo enviaba snapshot como JSON texto.
			# Asegurar seq presente.
			snapshot.emit(msg)
		"error":
			push_warning("[connection] server error: %s" % msg.get("code", "UNKNOWN"))
		_:
			pass

func _handle_binary_snapshot(pkt: PackedByteArray) -> void:
	# ADR-006 v2 / ADR-011:
	#   Header (10 bytes): magic(0x57) + version(1) + seq(4 BE) + lastAck(4 BE)
	#   Body: JSON UTF-8
	#   Trailer: CRC16 (2 bytes BE) sobre header+body
	if pkt.size() < 12:
		push_warning("[connection] binary snapshot too short: %d bytes" % pkt.size())
		return
	var version := pkt[1]
	if version != PROTOCOL_VERSION:
		push_warning("[connection] unsupported protocol version: %d" % version)
		return
	var seq := _read_u32_be(pkt, 2)
	var last_ack := _read_u32_be(pkt, 6)
	var body_end := pkt.size() - 2
	var expected_crc := _read_u16_be(pkt, body_end)
	var actual_crc := _crc16_range(pkt, 0, body_end)
	if expected_crc != actual_crc:
		push_warning("[connection] snapshot CRC mismatch: expected=%d actual=%d" % [expected_crc, actual_crc])
		return
	# Extraer body JSON
	var body_bytes := pkt.slice(10, body_end)
	var body_text := body_bytes.get_string_from_utf8()
	var parsed: Variant = JSON.parse_string(body_text)
	if parsed == null or not parsed is Dictionary:
		push_warning("[connection] snapshot body JSON parse failed")
		return
	var snap: Dictionary = parsed
	snap["seq"] = seq
	snap["lastAck"] = last_ack
	snapshot.emit(snap)

func _read_u32_be(buf: PackedByteArray, offset: int) -> int:
	return (buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]

func _read_u16_be(buf: PackedByteArray, offset: int) -> int:
	return (buf[offset] << 8) | buf[offset + 1]

func _crc16_range(buf: PackedByteArray, start: int, end: int) -> int:
	# CRC-CCITT, polinomio 0x1021, init 0xFFFF. Igual que server/protocol.mjs::crc16.
	var crc := 0xFFFF
	for i in range(start, end):
		crc ^= buf[i] << 8
		for _j in range(8):
			if (crc & 0x8000) != 0:
				crc = ((crc << 1) ^ 0x1021) & 0xFFFF
			else:
				crc = (crc << 1) & 0xFFFF
	return crc

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
