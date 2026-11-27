class_name MapCamera
extends Camera2D
## Unified input layer for the map (spec 8.1): mouse and touch become the
## same intents. Drag pans, wheel/pinch zooms, a press without drag is a tap.

signal tapped(world_pos: Vector2)
signal zoom_changed(zoom_level: float)

const DRAG_THRESHOLD_PX: float = 12.0
const ZOOM_STEP: float = 1.15
const MIN_ZOOM: float = 0.15
const MAX_ZOOM: float = 3.0

var map_rect: Rect2 = Rect2()

var _touches: Dictionary[int, Vector2] = {}
var _press_pos: Vector2 = Vector2.ZERO
var _dragging: bool = false
var _mouse_down: bool = false
var _pinch_start_dist: float = 0.0
var _pinch_start_zoom: float = 1.0


## Shows the whole map in the viewport minus `right_inset` screen pixels (side panel).
func fit(rect: Rect2, right_inset: float = 0.0) -> void:
	map_rect = rect
	var view: Vector2 = get_viewport_rect().size - Vector2(right_inset, 0.0)
	var z: float = minf(view.x / rect.size.x, view.y / rect.size.y) * 0.95
	zoom = Vector2.ONE * clampf(z, MIN_ZOOM, MAX_ZOOM)
	position = rect.get_center() + Vector2(right_inset * 0.5 / zoom.x, 0.0)
	zoom_changed.emit(zoom.x)


func _unhandled_input(ev: InputEvent) -> void:
	if ev is InputEventMouseButton:
		_on_mouse_button(ev)
	elif ev is InputEventMouseMotion and _mouse_down:
		_on_drag(ev.position, ev.relative)
	elif ev is InputEventScreenTouch:
		_on_touch(ev)
	elif ev is InputEventScreenDrag:
		_on_screen_drag(ev)
	elif ev is InputEventMagnifyGesture:
		_zoom_at(ev.position, ev.factor)


func _on_mouse_button(ev: InputEventMouseButton) -> void:
	match ev.button_index:
		MOUSE_BUTTON_WHEEL_UP:
			if ev.pressed:
				_zoom_at(ev.position, ZOOM_STEP)
		MOUSE_BUTTON_WHEEL_DOWN:
			if ev.pressed:
				_zoom_at(ev.position, 1.0 / ZOOM_STEP)
		MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT, MOUSE_BUTTON_MIDDLE:
			if ev.pressed:
				_mouse_down = true
				_dragging = false
				_press_pos = ev.position
			else:
				_mouse_down = false
				if not _dragging and ev.button_index == MOUSE_BUTTON_LEFT:
					tapped.emit(_screen_to_world(ev.position))
				_dragging = false


func _on_touch(ev: InputEventScreenTouch) -> void:
	if ev.pressed:
		_touches[ev.index] = ev.position
		if _touches.size() == 1:
			_press_pos = ev.position
			_dragging = false
		elif _touches.size() == 2:
			_dragging = true
			_pinch_start_dist = _pinch_distance()
			_pinch_start_zoom = zoom.x
	else:
		var was_single: bool = _touches.size() == 1
		_touches.erase(ev.index)
		if was_single and not _dragging:
			tapped.emit(_screen_to_world(ev.position))


func _on_screen_drag(ev: InputEventScreenDrag) -> void:
	_touches[ev.index] = ev.position
	if _touches.size() >= 2:
		var d: float = _pinch_distance()
		if _pinch_start_dist > 0.0:
			var target: float = _pinch_start_zoom * d / _pinch_start_dist
			_zoom_at(ev.position, target / zoom.x)
	else:
		_on_drag(ev.position, ev.relative)


func _on_drag(pos: Vector2, relative: Vector2) -> void:
	if not _dragging and pos.distance_to(_press_pos) < DRAG_THRESHOLD_PX:
		return
	_dragging = true
	position -= relative / zoom.x
	_clamp()


func _zoom_at(screen_pos: Vector2, factor: float) -> void:
	var before: Vector2 = _screen_to_world(screen_pos)
	zoom = Vector2.ONE * clampf(zoom.x * factor, MIN_ZOOM, MAX_ZOOM)
	zoom_changed.emit(zoom.x)
	var after: Vector2 = _screen_to_world(screen_pos)
	position += before - after
	_clamp()


func _clamp() -> void:
	if map_rect.has_area():
		position = position.clamp(map_rect.position, map_rect.end)


func _pinch_distance() -> float:
	var pts: Array = _touches.values()
	return pts[0].distance_to(pts[1]) if pts.size() >= 2 else 0.0


func _screen_to_world(screen_pos: Vector2) -> Vector2:
	return get_canvas_transform().affine_inverse() * screen_pos
