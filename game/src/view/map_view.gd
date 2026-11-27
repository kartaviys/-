class_name MapView
extends Node2D
## Draws a map pack and the game state on top of it (spec 3.4, placeholder art).
##
## Reads the simulation, never changes it. Polygons are converted once and
## cached; `refresh()` only stores what to highlight and queues a redraw.

const PARCHMENT: Color = Color(0.91, 0.85, 0.69)
const INK: Color = Color(0.35, 0.24, 0.17)
const WATER: Color = Color(0.45, 0.62, 0.72)
const NEUTRAL_FILL: Color = Color(0.82, 0.76, 0.6)
const FOG: Color = Color(0.42, 0.39, 0.34)
const SELECT: Color = Color(1.0, 0.95, 0.4)
const TARGET: Color = Color(0.95, 0.45, 0.2)
const FILL_ALPHA: float = 0.55
## Territory names appear once the camera is zoomed in this far (ui_scale = 1 / zoom).
const LABEL_MAX_SCALE: float = 2.2

var pack: MapPack
var rules: GameRules
var game: Game
var viewer: String = ""
var selected: String = ""
var targets: PackedStringArray = []
## Screen-constant sizing: markers and text are multiplied by this (1 / camera zoom).
var ui_scale: float = 1.0

var _polys: Dictionary[String, PackedVector2Array] = {}
var _centroids: Dictionary[String, Vector2] = {}
var _faction_colors: Dictionary[String, Color] = {}
var _school_colors: Dictionary[String, Color] = {}
var _font: Font


func setup(map_pack: MapPack, game_rules: GameRules) -> void:
	pack = map_pack
	rules = game_rules
	_font = ThemeDB.fallback_font
	for t: Dictionary in pack.territories:
		var pts := PackedVector2Array()
		for p: Variant in t.polygon:
			pts.append(Vector2(float(p[0]), float(p[1])))
		_polys[t.id] = pts
		_centroids[t.id] = Vector2(float(t.centroid[0]), float(t.centroid[1]))
	for f: Dictionary in rules.factions:
		_faction_colors[f.id] = Color(f.color)
	for s: Dictionary in rules.schools:
		_school_colors[s.id] = Color(s.color)
	queue_redraw()


func refresh(current_game: Game, viewer_faction: String, selected_tid: String, target_tids: PackedStringArray) -> void:
	game = current_game
	viewer = viewer_faction
	selected = selected_tid
	targets = target_tids
	queue_redraw()


func set_ui_scale(value: float) -> void:
	ui_scale = value
	queue_redraw()


func map_size() -> Vector2:
	var s: Variant = pack.view_hints.get("size")
	if s is Array:
		return Vector2(float(s[0]), float(s[1]))
	var r := Rect2()
	for pts: PackedVector2Array in _polys.values():
		for p: Vector2 in pts:
			r = r.expand(p)
	return r.size


func territory_at(world: Vector2) -> String:
	for tid: String in _polys:
		if Geometry2D.is_point_in_polygon(world, _polys[tid]):
			return tid
	return ""


func centroid(tid: String) -> Vector2:
	return _centroids[tid]


func faction_color(fid: String) -> Color:
	return _faction_colors.get(fid, NEUTRAL_FILL)


func _draw() -> void:
	if pack == null:
		return
	var border: Variant = pack.view_hints.get("border")
	if border is Array:
		draw_colored_polygon(_to_points(border), PARCHMENT)
	var seen: Dictionary = game.visible_territories(viewer) if game != null and viewer != "" else {}
	for tid: String in _polys:
		draw_colored_polygon(_polys[tid], _fill(tid, seen))
	var river: Variant = pack.view_hints.get("river")
	if river is Array:
		draw_polyline(_to_points(river), WATER, maxf(22.0, 6.0 * ui_scale), true)
	for e: Dictionary in pack.edges:
		_draw_edge(e)
	for tid: String in _polys:
		var outline := _polys[tid].duplicate()
		outline.append(outline[0])
		draw_polyline(outline, Color(INK, 0.6), 1.0 * ui_scale, true)
	for tid: String in targets:
		_draw_outline(tid, TARGET, 3.0 * ui_scale)
	if selected != "":
		_draw_outline(selected, SELECT, 4.0 * ui_scale)
	for l: Dictionary in pack.landmarks:
		_draw_landmark(l)
	for tid: String in _polys:
		_draw_army(tid, seen)


func _fill(tid: String, seen: Dictionary) -> Color:
	if game == null:
		return NEUTRAL_FILL
	var owner: String = game.owner_of(tid)
	var base: Color = NEUTRAL_FILL if owner == Game.NEUTRAL else PARCHMENT.lerp(faction_color(owner), FILL_ALPHA)
	if not seen.is_empty() and not seen.has(tid):
		return base.lerp(FOG, 0.6)
	return base


func _draw_edge(e: Dictionary) -> void:
	var a: Vector2 = _centroids[e.a]
	var b: Vector2 = _centroids[e.b]
	match str(e.type):
		"bridge":
			var mid: Vector2 = (a + b) * 0.5
			var dir: Vector2 = (b - a).normalized() * 10.0 * ui_scale
			draw_line(mid - dir, mid + dir, INK, 5.0 * ui_scale, true)
			draw_line(mid - dir, mid + dir, PARCHMENT, 2.5 * ui_scale, true)
		"rail":
			draw_dashed_line(a, b, Color(INK, 0.8), 1.5 * ui_scale, 8.0 * ui_scale)


func _draw_outline(tid: String, color: Color, width: float) -> void:
	var outline := _polys[tid].duplicate()
	outline.append(outline[0])
	draw_polyline(outline, color, width, true)


func _draw_landmark(l: Dictionary) -> void:
	var pos: Vector2 = _centroids[l.territory] + Vector2(0, -16) * ui_scale
	var lm: Dictionary = pack.landmark_rules.get(l.id, {})
	var color: Color = INK
	var mana: Dictionary = lm.get("mana", {})
	if not mana.is_empty():
		color = _school_colors.get(mana.keys()[0], INK)
	var crown: bool = pack.crown_towers.has(l.id)
	var r: float = (9.0 if crown else 6.0) * ui_scale
	draw_circle(pos, r + 1.5 * ui_scale, INK)
	draw_circle(pos, r, color)
	if game != null:
		var controller: String = game.state.landmarks[l.id].controller
		if controller != Game.NEUTRAL:
			draw_arc(pos, r + 3.5 * ui_scale, 0.0, TAU, 24, faction_color(controller), 2.0 * ui_scale, true)
	if crown:
		var pts := PackedVector2Array()
		for i in 10:
			var rad: float = (5.0 if i % 2 == 0 else 2.2) * ui_scale
			var ang: float = -PI / 2.0 + TAU * float(i) / 10.0
			pts.append(pos + Vector2(cos(ang), sin(ang)) * rad)
		draw_colored_polygon(pts, Color.WHITE)


func _draw_army(tid: String, seen: Dictionary) -> void:
	if game == null:
		return
	var t: Dictionary = game.territory(tid)
	var c: Vector2 = _centroids[tid] + Vector2(0, 6) * ui_scale
	var hidden: bool = not seen.is_empty() and not seen.has(tid)
	if not hidden and not t.units.is_empty():
		var text: String = str(t.units.size())
		var ring: Color = INK if t.owner == Game.NEUTRAL else faction_color(t.owner)
		draw_circle(c, 11.0 * ui_scale, ring)
		draw_circle(c, 8.5 * ui_scale, PARCHMENT)
		_draw_text_centered(text, c + Vector2(0, 4.5) * ui_scale, int(13.0 * ui_scale), INK)
	if ui_scale <= LABEL_MAX_SCALE:
		_draw_text_centered(tr(pack.get_territory(tid).name_key), c + Vector2(0, 26) * ui_scale, int(11.0 * ui_scale), Color(INK, 0.85))


func _draw_text_centered(text: String, pos: Vector2, size: int, color: Color) -> void:
	var w: float = _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	draw_string(_font, pos - Vector2(w / 2.0, 0.0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)


static func _to_points(arr: Array) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for p: Variant in arr:
		pts.append(Vector2(float(p[0]), float(p[1])))
	return pts
