extends Node
## Campaign map screen: map, HUD, orders and the turn loop (spec 8.2–8.3).
##
## Turns player intents into simulation commands and lets AI factions play
## between human turns. Placeholder layout until the phase 6 UI pass.

const MENU_SCENE: String = "res://src/ui/main_menu.tscn"
const AI_TURN_DELAY_S: float = 0.35
const LOG_LINES: int = 6
const MIN_TAP: Vector2 = Vector2(56, 56)
const PANEL_WIDTH: float = 400.0

var rules: GameRules
var pack: MapPack
var game: Game

var _map: MapView
var _camera: MapCamera
var _viewer: String = ""
var _selected: String = ""
var _target: String = ""
var _send_count: int = 0
var _log: PackedStringArray = []
var _busy: bool = false

var _faction_label: Label
var _day_label: Label
var _gold_label: Label
var _mana_label: Label
var _crown_label: Label
var _info: RichTextLabel
var _recruit_box: GridContainer
var _order_box: VBoxContainer
var _order_label: Label
var _count_label: Label
var _log_label: Label
var _status_label: Label
var _end_turn: Button
var _overlay: PanelContainer
var _overlay_label: Label
var _overlay_button: Button


func _ready() -> void:
	rules = GameRules.load_default()
	var setup: Dictionary = Session.setup
	if setup.is_empty():
		setup = _default_setup()
	pack = MapPack.load_from_dir(Session.map_dir(str(setup.get("map", Session.DEFAULT_MAP))))
	if not pack.is_valid() or not rules.is_valid():
		push_error("cannot start: %s %s" % [pack.errors, rules.errors])
		return
	game = Game.create(rules, pack, setup)
	game.event.connect(_on_game_event)
	_build_world()
	_build_hud()
	_begin_turn()


func _default_setup() -> Dictionary:
	var factions: Array = []
	var pack_starts: MapPack = MapPack.load_from_dir(Session.map_dir(Session.DEFAULT_MAP))
	for fid: String in pack_starts.starts:
		factions.append({"id": fid, "controller": Game.CONTROLLER_HUMAN if factions.is_empty() else Game.CONTROLLER_AI})
	return {"map": Session.DEFAULT_MAP, "seed": 1, "factions": factions}


# --------------------------------------------------------------- turn loop

func _humans() -> PackedStringArray:
	var out: PackedStringArray = []
	for fid: String in game.state.order:
		if game.faction_state(fid).controller == Game.CONTROLLER_HUMAN:
			out.append(fid)
	return out


func _begin_turn() -> void:
	_clear_selection()
	if game.is_over():
		_show_victory()
		return
	var fid: String = game.current_faction()
	var humans: PackedStringArray = _humans()
	if game.faction_state(fid).controller == Game.CONTROLLER_AI:
		_busy = true
		if _viewer == "" and humans.size() == 1:
			_viewer = humans[0]
		_status_label.text = tr("HUD_AI_THINKING").format({"faction": _faction_name(fid)})
		_refresh()
		await get_tree().create_timer(AI_TURN_DELAY_S).timeout
		SimpleAi.play_turn(game)
		game.end_turn()
		_begin_turn()
		return
	_busy = false
	_status_label.text = tr("HUD_SELECT_HINT")
	if humans.size() > 1:
		# Hotseat: hide the map until the next player takes the device.
		_viewer = ""
		_show_overlay(tr("HUD_HOTSEAT_PASS").format({"faction": _faction_name(fid)}), tr("HUD_CONTINUE"), func() -> void:
			_viewer = fid
			_hide_overlay()
			_select_first_army()
			_refresh())
		_refresh()
		return
	_viewer = fid
	_select_first_army()
	_refresh()


func _on_end_turn() -> void:
	if _busy or game.is_over() or not _is_human_turn():
		return
	game.end_turn()
	_begin_turn()


func _is_human_turn() -> bool:
	return not game.is_over() and game.faction_state(game.current_faction()).controller == Game.CONTROLLER_HUMAN \
			and _viewer == game.current_faction() and not _overlay.visible


# --------------------------------------------------------------- input

func _on_map_tapped(world: Vector2) -> void:
	var tid: String = _map.territory_at(world)
	if tid == "":
		_clear_selection()
		_refresh()
		return
	if _is_human_turn() and _selected != "" and tid != _selected \
			and game.owner_of(_selected) == game.current_faction() \
			and game.move_targets(game.current_faction(), _selected).has(tid):
		_target = tid
		_send_count = game.ready_units(_selected)
	else:
		_selected = tid
		_target = ""
	_refresh()


func _unhandled_key_input(ev: InputEvent) -> void:
	if not (ev is InputEventKey and ev.pressed and not ev.echo):
		return
	match ev.keycode:
		KEY_ENTER, KEY_KP_ENTER:
			if _target != "":
				_confirm_order()
			else:
				_on_end_turn()
		KEY_ESCAPE:
			_clear_selection()
			_refresh()
		KEY_SPACE:
			_select_next_army()
			_refresh()


func _confirm_order() -> void:
	if not _is_human_turn() or _target == "" or _send_count <= 0:
		return
	var result: Dictionary = game.move(_selected, _target, _send_count)
	if not result.ok:
		_status_label.text = tr(result.error)
	var dest: String = _target
	_target = ""
	if result.ok and game.owner_of(dest) == game.current_faction():
		_selected = dest
	if game.is_over():
		_show_victory()
	_refresh()


func _change_count(delta: int) -> void:
	_send_count = clampi(_send_count + delta, 1, maxi(1, game.ready_units(_selected)))
	_refresh()


func _recruit(unit_id: String) -> void:
	if not _is_human_turn():
		return
	var result: Dictionary = game.recruit(_selected, unit_id)
	if not result.ok:
		_status_label.text = tr(result.error)
	_refresh()


func _clear_selection() -> void:
	_selected = ""
	_target = ""


func _select_first_army() -> void:
	_selected = ""
	_select_next_army(false)


func _select_next_army(center_camera: bool = true) -> void:
	if not _is_human_turn():
		return
	var own: PackedStringArray = game.territories_of(game.current_faction())
	var start: int = own.find(_selected) + 1
	for i in own.size():
		var tid: String = own[(start + i) % own.size()]
		if game.ready_units(tid) > 0:
			_selected = tid
			_target = ""
			if center_camera:
				_camera.position = _map.centroid(tid)
			return


func _on_game_event(info: Dictionary) -> void:
	var line: String = ""
	match str(info.type):
		"capture":
			line = tr("LOG_CAPTURE").format({"faction": _faction_name(info.faction), "target": _territory_name(info.to)})
		"battle":
			var key: String = "LOG_BATTLE_WON" if info.winner == Combat.ATTACKER else "LOG_BATTLE_LOST"
			line = tr(key).format({"faction": _faction_name(info.faction), "target": _territory_name(info.to),
					"lost": int(info.attacker_before) - int(info.attacker_after)})
		"bound":
			line = tr("LOG_BOUND").format({"faction": _faction_name(info.faction), "landmark": tr(_landmark_name(info.landmark))})
		"eliminated":
			line = tr("LOG_ELIMINATED").format({"faction": _faction_name(info.faction)})
	if line == "":
		return
	# Do not leak fogged moves of rivals to the watching player.
	if _viewer != "" and info.has("to") and info.faction != _viewer \
			and not game.visible_territories(_viewer).has(info.to):
		return
	_log.append(line)
	if _log.size() > LOG_LINES:
		_log = _log.slice(_log.size() - LOG_LINES)


# --------------------------------------------------------------- view

func _refresh() -> void:
	var targets: PackedStringArray = []
	if _is_human_turn() and _selected != "" and game.owner_of(_selected) == game.current_faction() \
			and game.ready_units(_selected) > 0:
		targets = game.move_targets(game.current_faction(), _selected)
	_map.refresh(game, _viewer, _selected, targets)
	_refresh_top_bar()
	_refresh_info()
	_refresh_recruit()
	_refresh_order()
	_log_label.text = "\n".join(_log)
	_end_turn.disabled = not _is_human_turn()


func _refresh_top_bar() -> void:
	var fid: String = game.current_faction()
	_faction_label.text = _faction_name(fid)
	_faction_label.add_theme_color_override("font_color", _map.faction_color(fid).lightened(0.35))
	var time_key: String = "HUD_NIGHT" if game.is_night() else "HUD_DAYTIME"
	_day_label.text = "%s, %s" % [tr("HUD_DAY").format({"day": int(game.state.day)}), tr(time_key)]
	var shown: String = _viewer if _viewer != "" else fid
	var fs: Dictionary = game.faction_state(shown)
	_gold_label.text = tr("HUD_GOLD").format({"gold": int(fs.gold), "income": game.income_of(shown), "upkeep": game.upkeep_of(shown)})
	var parts: PackedStringArray = []
	for s: Dictionary in rules.schools:
		parts.append("%s %d" % [tr(s.name_key).substr(0, 3), int(fs.mana.get(s.id, 0))])
	_mana_label.text = "  ".join(parts)
	var crown_text: String = ""
	for f: String in game.state.crown_days:
		if int(game.state.crown_days[f]) > 0:
			crown_text = tr("HUD_CROWN_HOLD").format({"faction": _faction_name(f),
					"days": int(game.state.crown_days[f]), "total": int(rules.num("victory.crown_hold_days"))})
	_crown_label.text = crown_text


func _refresh_info() -> void:
	if _selected == "":
		_info.text = tr("HUD_SELECT_HINT")
		return
	var t: Dictionary = game.territory(_selected)
	var lines: PackedStringArray = []
	lines.append("[b]%s[/b]" % _territory_name(_selected))
	var owner_name: String = tr("HUD_NEUTRAL") if t.owner == Game.NEUTRAL else _faction_name(t.owner)
	lines.append(tr("HUD_OWNER").format({"owner": owner_name}))
	var lid: String = pack.landmark_in(_selected)
	if lid != "":
		var ls: Dictionary = game.state.landmarks[lid]
		var status: String = tr("HUD_LANDMARK_FREE")
		if ls.controller != Game.NEUTRAL:
			status = tr("HUD_LANDMARK_BOUND").format({"owner": _faction_name(ls.controller)})
		elif ls.binder != Game.NEUTRAL:
			status = tr("HUD_LANDMARK_RITUAL").format({"owner": _faction_name(ls.binder),
					"progress": int(ls.progress), "total": int(rules.num("capture.ritual_turns"))})
		var crown: String = " ★ %s" % tr("HUD_CROWN") if pack.crown_towers.has(lid) else ""
		lines.append(tr("HUD_LANDMARK").format({"name": tr(_landmark_name(lid))}) + crown)
		lines.append("  " + status)
		var mana: Dictionary = pack.landmark_rules.get(lid, {}).get("mana", {})
		for school: String in mana:
			lines.append("  +%d %s" % [int(mana[school]), tr("SCHOOL_" + school.to_upper())])
	var visible: bool = _viewer == "" or game.visible_territories(_viewer).has(_selected)
	if not visible:
		lines.append(tr("HUD_HIDDEN"))
	else:
		lines.append(tr("HUD_UNITS").format({"count": t.units.size(), "ready": game.ready_units(_selected)}))
		lines.append(tr("HUD_MORALE").format({"morale": int(t.morale)}))
		var counts: Dictionary = {}
		for u: Dictionary in t.units:
			counts[u.type] = int(counts.get(u.type, 0)) + 1
		for unit_id: String in rules.unit_ids():
			if counts.has(unit_id):
				lines.append("  %s × %d" % [tr(rules.unit(unit_id).name_key), counts[unit_id]])
	_info.text = "\n".join(lines)


func _refresh_recruit() -> void:
	var can_show: bool = _is_human_turn() and _selected != "" and game.is_recruit_site(game.current_faction(), _selected)
	_recruit_box.visible = can_show
	if not can_show:
		return
	for b: Node in _recruit_box.get_children():
		var unit_id: String = b.get_meta("unit")
		(b as Button).disabled = game.check_recruit(_selected, unit_id) != ""


func _refresh_order() -> void:
	_order_box.visible = _target != "" and _is_human_turn()
	if not _order_box.visible:
		return
	_send_count = clampi(_send_count, 1, maxi(1, game.ready_units(_selected)))
	var target_name: String = _territory_name(_target)
	if game.owner_of(_target) == game.current_faction() or game.territory(_target).units.is_empty():
		_order_label.text = tr("HUD_ORDER_MOVE").format({"count": _send_count, "target": target_name})
	else:
		var chance: int = int(round(game.preview_attack(_selected, _target, _send_count) * 100.0))
		_order_label.text = tr("HUD_ORDER_ATTACK").format({"target": target_name, "count": _send_count, "chance": chance})
	_count_label.text = tr("HUD_COUNT").format({"count": _send_count})


func _show_victory() -> void:
	_busy = true
	_viewer = ""
	var title: String = tr("VICTORY_TITLE").format({"faction": _faction_name(game.state.winner)})
	var kind: String = tr("VICTORY_" + str(game.state.victory).to_upper())
	_show_overlay("%s\n%s" % [title, kind], tr("HUD_MENU"), func() -> void:
		get_tree().change_scene_to_file(MENU_SCENE))
	_refresh()


func _show_overlay(text: String, button: String, action: Callable) -> void:
	_overlay_label.text = text
	_overlay_button.text = button
	for c: Dictionary in _overlay_button.pressed.get_connections():
		_overlay_button.pressed.disconnect(c.callable)
	_overlay_button.pressed.connect(action)
	_overlay.visible = true


func _hide_overlay() -> void:
	_overlay.visible = false


func _faction_name(fid: String) -> String:
	return tr(rules.faction(fid).name_key)


func _territory_name(tid: String) -> String:
	return tr(pack.get_territory(tid).name_key)


func _landmark_name(lid: String) -> String:
	return str(pack.landmark_rules.get(lid, {}).get("name_key", lid))


# --------------------------------------------------------------- building

func _build_world() -> void:
	var bg := CanvasLayer.new()
	bg.layer = -10
	var bg_rect := ColorRect.new()
	bg_rect.color = MapView.PARCHMENT.darkened(0.25)
	bg_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bg.add_child(bg_rect)
	add_child(bg)
	_map = MapView.new()
	add_child(_map)
	_map.setup(pack, rules)
	_camera = MapCamera.new()
	add_child(_camera)
	_camera.make_current()
	_camera.zoom_changed.connect(func(z: float) -> void: _map.set_ui_scale(1.0 / z))
	_camera.fit(Rect2(Vector2.ZERO, _map.map_size()), PANEL_WIDTH)
	_camera.tapped.connect(_on_map_tapped)


func _build_hud() -> void:
	var hud := CanvasLayer.new()
	add_child(hud)
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(root)

	# Top bar: faction, day, treasury, mana, crown countdown.
	var top := PanelContainer.new()
	top.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	root.add_child(top)
	var top_row := HBoxContainer.new()
	top_row.add_theme_constant_override("separation", 28)
	top.add_child(top_row)
	_faction_label = _hud_label(top_row, 24)
	_day_label = _hud_label(top_row)
	_gold_label = _hud_label(top_row)
	_mana_label = _hud_label(top_row, 16)
	_crown_label = _hud_label(top_row)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_row.add_child(spacer)
	var menu := Button.new()
	menu.text = tr("HUD_MENU")
	menu.custom_minimum_size = MIN_TAP
	menu.pressed.connect(func() -> void: get_tree().change_scene_to_file(MENU_SCENE))
	top_row.add_child(menu)

	# Right panel: territory card, recruitment, pending order.
	var side := PanelContainer.new()
	side.anchor_left = 1.0
	side.anchor_right = 1.0
	side.anchor_top = 0.0
	side.anchor_bottom = 1.0
	side.offset_left = -PANEL_WIDTH
	side.offset_top = 70
	side.offset_bottom = -110
	root.add_child(side)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	side.add_child(col)
	_info = RichTextLabel.new()
	_info.bbcode_enabled = true
	_info.fit_content = true
	_info.scroll_active = false
	_info.add_theme_font_size_override("normal_font_size", 18)
	_info.add_theme_font_size_override("bold_font_size", 22)
	col.add_child(_info)

	_recruit_box = GridContainer.new()
	_recruit_box.columns = 2
	col.add_child(_recruit_box)
	for unit_id: String in rules.unit_ids():
		var spec: Dictionary = rules.unit(unit_id)
		var b := Button.new()
		var mana: String = " +%d✦" % int(spec.mana_cost) if spec.has("mana_cost") else ""
		b.text = "%s %d%s" % [tr(spec.name_key), int(spec.cost), mana]
		b.custom_minimum_size = MIN_TAP
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.set_meta("unit", unit_id)
		b.pressed.connect(_recruit.bind(unit_id))
		_recruit_box.add_child(b)

	_order_box = VBoxContainer.new()
	col.add_child(_order_box)
	_order_label = Label.new()
	_order_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_order_label.add_theme_font_size_override("font_size", 18)
	_order_box.add_child(_order_label)
	var count_row := HBoxContainer.new()
	_order_box.add_child(count_row)
	count_row.add_child(_button("−", _change_count.bind(-1)))
	_count_label = Label.new()
	_count_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_count_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	count_row.add_child(_count_label)
	count_row.add_child(_button("+", _change_count.bind(1)))
	var order_row := HBoxContainer.new()
	_order_box.add_child(order_row)
	var confirm := _button(tr("HUD_CONFIRM"), _confirm_order)
	confirm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	order_row.add_child(confirm)
	var cancel := _button(tr("HUD_CANCEL"), func() -> void:
		_target = ""
		_refresh())
	cancel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	order_row.add_child(cancel)

	# Bottom: event log, status line, attribution, end turn.
	_log_label = Label.new()
	_log_label.anchor_top = 1.0
	_log_label.anchor_bottom = 1.0
	_log_label.offset_left = 16
	_log_label.offset_top = -200
	_log_label.offset_right = 900
	_log_label.offset_bottom = -40
	_log_label.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	_log_label.add_theme_color_override("font_color", MapView.INK)
	_log_label.add_theme_font_size_override("font_size", 18)
	_log_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(_log_label)
	_status_label = Label.new()
	_status_label.anchor_top = 1.0
	_status_label.anchor_bottom = 1.0
	_status_label.offset_left = 16
	_status_label.offset_top = -36
	_status_label.offset_right = 1100
	_status_label.offset_bottom = -8
	_status_label.add_theme_color_override("font_color", MapView.INK)
	_status_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(_status_label)
	var attribution := Label.new()
	attribution.text = "%s · %s" % [tr("OSM_ATTRIBUTION"), tr("MAP_SCHEMATIC")] if pack.view_hints.get("schematic", false) else tr("OSM_ATTRIBUTION")
	attribution.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	attribution.offset_left = -1000
	attribution.offset_right = -PANEL_WIDTH - 16
	attribution.offset_top = -30
	attribution.offset_bottom = -6
	attribution.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	attribution.add_theme_font_size_override("font_size", 13)
	attribution.add_theme_color_override("font_color", Color(MapView.INK, 0.8))
	attribution.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(attribution)
	_end_turn = Button.new()
	_end_turn.text = tr("HUD_END_TURN")
	_end_turn.add_theme_font_size_override("font_size", 26)
	_end_turn.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	_end_turn.offset_left = -PANEL_WIDTH
	_end_turn.offset_top = -96
	_end_turn.offset_right = -12
	_end_turn.offset_bottom = -12
	_end_turn.pressed.connect(_on_end_turn)
	root.add_child(_end_turn)

	# Centre overlay: hotseat hand-over and victory.
	_overlay = PanelContainer.new()
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_overlay.custom_minimum_size = Vector2(620, 240)
	_overlay.position -= Vector2(310, 120)
	_overlay.visible = false
	root.add_child(_overlay)
	var ov := VBoxContainer.new()
	ov.alignment = BoxContainer.ALIGNMENT_CENTER
	ov.add_theme_constant_override("separation", 24)
	_overlay.add_child(ov)
	_overlay_label = Label.new()
	_overlay_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_overlay_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_overlay_label.add_theme_font_size_override("font_size", 30)
	ov.add_child(_overlay_label)
	_overlay_button = Button.new()
	_overlay_button.custom_minimum_size = Vector2(240, 64)
	_overlay_button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	ov.add_child(_overlay_button)


func _hud_label(parent: Node, size: int = 20) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", size)
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	parent.add_child(l)
	return l


func _button(text: String, action: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = MIN_TAP
	b.pressed.connect(action)
	return b
