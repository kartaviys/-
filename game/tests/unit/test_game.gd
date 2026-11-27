extends GutTest
## Phase 3 core: turns, income, movement, capture, rituals and victory.

const MINI_DIR: String = "res://tests/fixtures/maps/mini"

var rules: GameRules
var pack: MapPack


func before_all() -> void:
	rules = GameRules.load_default()
	pack = MapPack.load_from_dir(MINI_DIR)


func _new_game(seed_value: int = 1) -> Game:
	return Game.create(rules, pack, {"seed": seed_value, "factions": [
		{"id": "iron_syndicate", "controller": "human"},
		{"id": "sky_weavers", "controller": "human"},
	]})


func _set_units(g: Game, tid: String, composition: Dictionary) -> void:
	var units: Array = []
	for id: String in composition:
		for i in int(composition[id]):
			units.append({"type": id, "hp": float(rules.unit(id).hp), "moved": false})
	g.territory(tid).units = units


func test_mini_pack_and_landmark_rules_load() -> void:
	assert_true(pack.is_valid(), "errors: %s" % [pack.errors])
	assert_eq(pack.landmark_rules.size(), 5)


func test_starts_are_owned_and_bound() -> void:
	var g := _new_game()
	assert_eq(g.owner_of("t5"), "iron_syndicate")
	assert_eq(g.owner_of("t4"), "sky_weavers")
	assert_eq(g.landmarks_of("iron_syndicate"), PackedStringArray(["station"]))
	assert_eq(g.owner_of("t1"), Game.NEUTRAL)
	assert_false(g.territory("t1").units.is_empty(), "neutral guardians present")


func test_income_and_mana_on_turn_start() -> void:
	var g := _new_game()
	var fs: Dictionary = g.faction_state("iron_syndicate")
	var expected: int = int(rules.num("economy.start_gold")) + g.income_of("iron_syndicate") - g.upkeep_of("iron_syndicate")
	assert_eq(int(fs.gold), expected)
	assert_eq(int(fs.mana.steel), 5)


func test_cannot_act_on_foreign_territory() -> void:
	var g := _new_game()
	assert_eq(g.check_move("t4", "t2"), Game.ERR_NOT_OWNER)
	assert_eq(g.check_move("t5", "t1"), Game.ERR_NOT_ADJACENT)


func test_water_edge_is_not_a_ground_route() -> void:
	var g := _new_game()
	assert_false(g.move_targets("iron_syndicate", "t5").has("t4"))
	assert_true(g.move_targets("iron_syndicate", "t5").has("t2"))


func test_empty_territory_is_captured_on_entry() -> void:
	var g := _new_game()
	g.territory("t2").units = []
	var r: Dictionary = g.move("t5", "t2", 2)
	assert_true(r.ok)
	assert_eq(r.kind, "capture")
	assert_eq(g.owner_of("t2"), "iron_syndicate")
	assert_eq(g.territory("t2").units.size(), 2)
	assert_eq(g.ready_units("t2"), 0, "moved units cannot move again this turn")


func test_winning_battle_captures_and_starts_ritual() -> void:
	var g := _new_game()
	_set_units(g, "t5", {"knight": 10})
	_set_units(g, "t2", {"militia": 1})
	var r: Dictionary = g.move("t5", "t2")
	assert_eq(r.kind, "battle")
	assert_true(r.captured)
	assert_eq(g.owner_of("t2"), "iron_syndicate")
	var ls: Dictionary = g.state.landmarks.tower_b
	assert_eq(ls.controller, Game.NEUTRAL, "site is neutral during the ritual")
	assert_eq(ls.binder, "iron_syndicate")


func test_ritual_binds_after_configured_turns() -> void:
	var g := _new_game()
	_set_units(g, "t5", {"knight": 10})
	_set_units(g, "t2", {"militia": 1})
	g.move("t5", "t2")
	var turns: int = int(rules.num("capture.ritual_turns"))
	for i in turns:
		assert_false(g.landmarks_of("iron_syndicate").has("tower_b"))
		g.end_turn()  # iron ends: ritual advances
		g.end_turn()  # sky ends
	assert_true(g.landmarks_of("iron_syndicate").has("tower_b"))


func test_lost_battle_returns_survivors() -> void:
	var g := _new_game()
	_set_units(g, "t5", {"militia": 1})
	_set_units(g, "t2", {"knight": 6})
	var r: Dictionary = g.move("t5", "t2")
	assert_false(r.captured)
	assert_eq(g.owner_of("t2"), Game.NEUTRAL)
	assert_eq(g.owner_of("t5"), "iron_syndicate")


func test_recruit_needs_bound_site_and_gold() -> void:
	var g := _new_game()
	assert_eq(g.check_recruit("t5", "militia"), "")
	var gold: int = int(g.faction_state("iron_syndicate").gold)
	assert_true(g.recruit("t5", "militia").ok)
	assert_eq(int(g.faction_state("iron_syndicate").gold), gold - 20)
	g.faction_state("iron_syndicate").gold = 0
	assert_eq(g.check_recruit("t5", "militia"), Game.ERR_NO_GOLD)


func test_battle_mage_costs_school_mana() -> void:
	var g := _new_game()
	g.faction_state("iron_syndicate").gold = 1000
	g.faction_state("iron_syndicate").mana.steel = 0
	assert_eq(g.check_recruit("t5", "battle_mage"), Game.ERR_NO_MANA)


func test_stack_limit_is_enforced() -> void:
	var g := _new_game()
	_set_units(g, "t5", {"militia": int(rules.num("army.stack_limit"))})
	g.faction_state("iron_syndicate").gold = 1000
	assert_eq(g.check_recruit("t5", "militia"), Game.ERR_STACK_FULL)


func test_turn_order_and_day_counter() -> void:
	var g := _new_game()
	assert_eq(g.current_faction(), "iron_syndicate")
	g.end_turn()
	assert_eq(g.current_faction(), "sky_weavers")
	assert_eq(int(g.state.day), 1)
	g.end_turn()
	assert_eq(g.current_faction(), "iron_syndicate")
	assert_eq(int(g.state.day), 2)


func test_domination_victory() -> void:
	var g := _new_game()
	for tid: String in ["t1", "t2", "t3"]:
		g.territory(tid).owner = "iron_syndicate"
	g.end_turn()
	assert_eq(g.state.winner, "iron_syndicate")
	assert_eq(g.state.victory, Game.VICTORY_DOMINATION)


func test_elimination_victory() -> void:
	var g := _new_game()
	_set_units(g, "t5", {"knight": 12})
	g.territory("t2").owner = "iron_syndicate"
	g.territory("t2").units = []
	g.end_turn()
	g.end_turn()
	_set_units(g, "t2", {"knight": 12})
	_set_units(g, "t4", {"militia": 1})
	var r: Dictionary = g.move("t2", "t4")
	assert_true(r.captured)
	assert_eq(g.state.winner, "iron_syndicate")
	assert_eq(g.state.victory, Game.VICTORY_ELIMINATION)


func test_crown_towers_victory_after_hold_days() -> void:
	var g := _new_game()
	for lid: String in pack.crown_towers:
		g.state.landmarks[lid].controller = "sky_weavers"
	var days: int = int(rules.num("victory.crown_hold_days"))
	for d in days:
		assert_false(g.is_over())
		g.end_turn()
		g.end_turn()
	assert_eq(g.state.winner, "sky_weavers")
	assert_eq(g.state.victory, Game.VICTORY_CROWN)


func test_fog_shows_own_and_adjacent() -> void:
	var g := _new_game()
	var seen: Dictionary = g.visible_territories("iron_syndicate")
	assert_true(seen.has("t5"))
	assert_true(seen.has("t2"))
	assert_true(seen.has("t4"), "water edges reveal too")
	assert_false(seen.has("t1"))


func test_save_and_load_continue_identically() -> void:
	var a := _ai_game(4, 6)
	var text: String = JSON.stringify(a.save_data())
	var b := Game.load_from(rules, pack, JSON.parse_string(text))
	for g: Game in [a, b]:
		_play(g, 6)
	assert_eq(_norm(a.state), _norm(b.state))


func _norm(d: Dictionary) -> String:
	return JSON.stringify(JSON.parse_string(JSON.stringify(d)))


func test_same_seed_same_game() -> void:
	var a := _ai_game(9)
	var b := _ai_game(9)
	assert_eq(JSON.stringify(a.state), JSON.stringify(b.state))


func _ai_game(seed_value: int, turns: int = 20) -> Game:
	var g := Game.create(rules, pack, {"seed": seed_value, "factions": [
		{"id": "iron_syndicate", "controller": "ai"},
		{"id": "sky_weavers", "controller": "ai"},
	]})
	_play(g, turns)
	return g


func _play(g: Game, turns: int) -> void:
	for i in turns:
		if g.is_over():
			break
		SimpleAi.play_turn(g)
		g.end_turn()
