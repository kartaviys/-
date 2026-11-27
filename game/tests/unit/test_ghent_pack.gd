extends GutTest
## The shipped Ghent pack (schematic until the OSM pipeline runs).

const GHENT_DIR: String = "res://data/maps/ghent"


func test_ghent_pack_is_valid() -> void:
	var pack := MapPack.load_from_dir(GHENT_DIR)
	assert_true(pack.is_valid(), "errors: %s" % [pack.errors])
	assert_eq(pack.landmarks.size(), 26)
	assert_eq(pack.landmark_rules.size(), 26)
	assert_eq(pack.starts.size(), 5)


func test_every_name_key_is_translated() -> void:
	var pack := MapPack.load_from_dir(GHENT_DIR)
	TranslationServer.set_locale("ru")
	for t: Dictionary in pack.territories:
		assert_ne(tr(t.name_key), t.name_key, "missing ru string %s" % t.name_key)
	TranslationServer.set_locale("en")


func test_ai_game_runs_on_ghent() -> void:
	var rules := GameRules.load_default()
	var pack := MapPack.load_from_dir(GHENT_DIR)
	var factions: Array = []
	for fid: String in pack.starts:
		factions.append({"id": fid, "controller": "ai", "difficulty": "normal"})
	var g := Game.create(rules, pack, {"seed": 3, "factions": factions})
	for i in 5 * 15:
		if g.is_over():
			break
		SimpleAi.play_turn(g)
		g.end_turn()
	var owned: int = 0
	for fid: String in pack.starts:
		owned += g.territories_of(fid).size()
	assert_gt(owned, 5, "AIs expand beyond their starts")
