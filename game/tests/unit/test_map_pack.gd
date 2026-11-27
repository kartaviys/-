extends GutTest

const MINI_DIR: String = "res://tests/fixtures/maps/mini"


func _load_mini_json() -> Array[Dictionary]:
	var pack: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(MINI_DIR.path_join("pack.json")))
	var map: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(MINI_DIR.path_join("map.json")))
	return [pack, map]


## Parses mutated copies of the fixture without touching disk.
func _pack_from(pack_json: Dictionary, map_json: Dictionary) -> MapPack:
	var pack := MapPack.new()
	pack._parse(pack_json, map_json)
	pack._validate()
	return pack


func test_fixture_loads_and_is_valid() -> void:
	var pack := MapPack.load_from_dir(MINI_DIR)
	assert_true(pack.is_valid(), "errors: %s" % [pack.errors])
	assert_eq(pack.id, "mini")
	assert_eq(pack.territories.size(), 5)
	assert_eq(pack.crown_towers.size(), 3)


func test_neighbors_respect_edge_types() -> void:
	var pack := MapPack.load_from_dir(MINI_DIR)
	var ground: PackedStringArray = pack.neighbors("t4")
	ground.sort()
	assert_eq(ground, PackedStringArray(["t2", "t3"]))
	assert_eq(pack.neighbors("t4", PackedStringArray(["water"])), PackedStringArray(["t5"]))


func test_missing_dir_reports_errors() -> void:
	var pack := MapPack.load_from_dir("res://tests/fixtures/maps/does_not_exist")
	assert_false(pack.is_valid())


func test_two_landmarks_in_one_territory_rejected() -> void:
	var docs := _load_mini_json()
	docs[1].landmarks[1].territory = "t1"
	assert_false(_pack_from(docs[0], docs[1]).is_valid())


func test_bridge_without_name_rejected() -> void:
	var docs := _load_mini_json()
	docs[1].edges[4].erase("name")
	assert_false(_pack_from(docs[0], docs[1]).is_valid())


func test_water_only_link_is_disconnected_for_ground() -> void:
	var docs := _load_mini_json()
	docs[1].edges.remove_at(4)
	var pack := _pack_from(docs[0], docs[1])
	assert_false(pack.is_valid())
	assert_string_contains(" ".join(pack.errors), "disconnected")


func test_crown_towers_must_be_three_distinct() -> void:
	var docs := _load_mini_json()
	docs[0].crown_towers = ["tower_a", "tower_a", "tower_b"]
	assert_false(_pack_from(docs[0], docs[1]).is_valid())


func test_shared_start_rejected() -> void:
	var docs := _load_mini_json()
	docs[0].starts.sky_weavers = "station"
	assert_false(_pack_from(docs[0], docs[1]).is_valid())


func test_wrong_format_version_rejected() -> void:
	var docs := _load_mini_json()
	docs[1].format_version = 99
	assert_false(_pack_from(docs[0], docs[1]).is_valid())
