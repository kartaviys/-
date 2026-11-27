extends Control
## Main menu with match setup (spec 8.2, compact until phase 6).

const GAME_SCENE: String = "res://src/ui/game_screen.tscn"
const DIFFICULTIES: PackedStringArray = ["easy", "normal", "hard"]
const MIN_TAP: Vector2 = Vector2(0, 56)

var _rules: GameRules
var _pack: MapPack
var _faction_ids: PackedStringArray = []
var _faction_pick: OptionButton
var _opponents: SpinBox
var _difficulty: OptionButton


func _ready() -> void:
	%Title.text = tr("GAME_TITLE")
	%Attribution.text = tr("OSM_ATTRIBUTION")
	_rules = GameRules.load_default()
	_pack = MapPack.load_from_dir(Session.map_dir(Session.DEFAULT_MAP))
	for fid: String in _pack.starts:
		_faction_ids.append(fid)
	_build()


func _build() -> void:
	var box := VBoxContainer.new()
	box.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	box.custom_minimum_size = Vector2(520, 0)
	box.position -= Vector2(260, 200)
	box.add_theme_constant_override("separation", 14)
	add_child(box)

	box.add_child(_label(tr("MAP_GHENT"), 32))
	box.add_child(_label(tr("SETUP_FACTION")))
	_faction_pick = OptionButton.new()
	_faction_pick.custom_minimum_size = MIN_TAP
	for fid: String in _faction_ids:
		_faction_pick.add_item(tr(_rules.faction(fid).name_key))
	box.add_child(_faction_pick)

	box.add_child(_label(tr("SETUP_OPPONENTS")))
	_opponents = SpinBox.new()
	_opponents.min_value = 1
	_opponents.max_value = _faction_ids.size() - 1
	_opponents.value = _faction_ids.size() - 1
	_opponents.custom_minimum_size = MIN_TAP
	box.add_child(_opponents)

	box.add_child(_label(tr("SETUP_DIFFICULTY")))
	_difficulty = OptionButton.new()
	_difficulty.custom_minimum_size = MIN_TAP
	for d: String in DIFFICULTIES:
		_difficulty.add_item(tr("DIFF_" + d.to_upper()))
	_difficulty.select(1)
	box.add_child(_difficulty)

	var start := Button.new()
	start.text = tr("MENU_NEW_GAME")
	start.custom_minimum_size = MIN_TAP
	start.pressed.connect(_start_vs_ai)
	box.add_child(start)

	var hotseat := Button.new()
	hotseat.text = tr("MENU_HOTSEAT")
	hotseat.tooltip_text = tr("SETUP_HOTSEAT_HINT")
	hotseat.custom_minimum_size = MIN_TAP
	hotseat.pressed.connect(_start_hotseat)
	box.add_child(hotseat)

	var quit := Button.new()
	quit.text = tr("MENU_QUIT")
	quit.custom_minimum_size = MIN_TAP
	quit.pressed.connect(func() -> void: get_tree().quit())
	box.add_child(quit)


func _label(text: String, size: int = 20) -> Label:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", Color(0.35, 0.24, 0.17))
	return l


func _start_vs_ai() -> void:
	var human: String = _faction_ids[_faction_pick.selected]
	var difficulty: String = DIFFICULTIES[_difficulty.selected]
	var factions: Array = [{"id": human, "controller": Game.CONTROLLER_HUMAN}]
	for fid: String in _faction_ids:
		if fid != human and factions.size() <= int(_opponents.value):
			factions.append({"id": fid, "controller": Game.CONTROLLER_AI, "difficulty": difficulty})
	_launch(factions)


## Hotseat: the chosen faction plus as many human rivals as the opponents box says.
func _start_hotseat() -> void:
	var first: String = _faction_ids[_faction_pick.selected]
	var factions: Array = [{"id": first, "controller": Game.CONTROLLER_HUMAN}]
	for fid: String in _faction_ids:
		if fid != first and factions.size() <= int(_opponents.value):
			factions.append({"id": fid, "controller": Game.CONTROLLER_HUMAN})
	_launch(factions)


func _launch(factions: Array) -> void:
	Session.setup = {"map": Session.DEFAULT_MAP, "seed": int(Time.get_unix_time_from_system()), "factions": factions}
	get_tree().change_scene_to_file(GAME_SCENE)
