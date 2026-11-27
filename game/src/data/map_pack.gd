class_name MapPack
extends RefCounted
## A city map pack: game/data/maps/<city_id>/{pack.json, map.json}.
##
## Loading never throws: structural problems are collected in `errors`, and a
## pack is usable only when `is_valid()` is true. The format is documented in
## docs/map_format.md and mirrored by tools/geo validation.

const FORMAT_VERSION: int = 1
const EDGE_TYPES: PackedStringArray = ["land", "bridge", "water", "rail"]
## Edge types that let ordinary ground armies move; used for connectivity.
const GROUND_EDGE_TYPES: PackedStringArray = ["land", "bridge", "rail"]
const CROWN_TOWER_COUNT: int = 3

var id: String = ""
var name_key: String = ""
var crown_towers: PackedStringArray = []
var ascension_site: String = ""
## faction_id -> landmark_id
var starts: Dictionary[String, String] = {}
var territories: Array[Dictionary] = []
var edges: Array[Dictionary] = []
var landmarks: Array[Dictionary] = []
var errors: PackedStringArray = []
## landmark_id -> entry of the optional landmarks.json (school mana, guardians, effects).
var landmark_rules: Dictionary[String, Dictionary] = {}
## Optional drawing hints from map.json: size, border, river, schematic.
var view_hints: Dictionary = {}

var _territory_index: Dictionary[String, int] = {}
var _landmark_index: Dictionary[String, int] = {}


static func load_from_dir(dir: String) -> MapPack:
	var pack := MapPack.new()
	var pack_json: Variant = _read_json(dir.path_join("pack.json"), pack.errors)
	var map_json: Variant = _read_json(dir.path_join("map.json"), pack.errors)
	if pack_json is Dictionary and map_json is Dictionary:
		pack._parse(pack_json, map_json)
		pack._validate()
	var lm_path: String = dir.path_join("landmarks.json")
	if FileAccess.file_exists(lm_path):
		var lm_json: Variant = _read_json(lm_path, pack.errors)
		if lm_json is Dictionary:
			pack._parse_landmark_rules(lm_json)
	return pack


func is_valid() -> bool:
	return errors.is_empty()


func has_territory(territory_id: String) -> bool:
	return _territory_index.has(territory_id)


func get_territory(territory_id: String) -> Dictionary:
	return territories[_territory_index[territory_id]]


func get_landmark(landmark_id: String) -> Dictionary:
	return landmarks[_landmark_index[landmark_id]]


## Neighbour territory ids reachable over the given edge types.
func neighbors(territory_id: String, edge_types: PackedStringArray = GROUND_EDGE_TYPES) -> PackedStringArray:
	var result: PackedStringArray = []
	for e: Dictionary in edges:
		if not edge_types.has(e.type):
			continue
		if e.a == territory_id:
			result.append(e.b)
		elif e.b == territory_id:
			result.append(e.a)
	return result


## Landmark id of a territory, or "" when it holds none.
func landmark_in(territory_id: String) -> String:
	for l: Dictionary in landmarks:
		if l.territory == territory_id:
			return str(l.id)
	return ""


func edge_type(a: String, b: String, edge_types: PackedStringArray = EDGE_TYPES) -> String:
	for e: Dictionary in edges:
		if edge_types.has(e.type) and ((e.a == a and e.b == b) or (e.a == b and e.b == a)):
			return str(e.type)
	return ""


func _parse_landmark_rules(lm_json: Dictionary) -> void:
	for entry: Variant in lm_json.get("landmarks", []):
		if not entry is Dictionary:
			continue
		var lid: String = str(entry.get("id", ""))
		if not _landmark_index.has(lid):
			errors.append("landmarks.json: unknown landmark '%s'" % lid)
			continue
		landmark_rules[lid] = entry


func _parse(pack_json: Dictionary, map_json: Dictionary) -> void:
	for key: String in ["size", "border", "river", "schematic"]:
		if map_json.has(key):
			view_hints[key] = map_json[key]
	for doc: Dictionary in [pack_json, map_json]:
		if int(doc.get("format_version", -1)) != FORMAT_VERSION:
			errors.append("unsupported format_version %s" % str(doc.get("format_version")))
	id = str(pack_json.get("id", ""))
	name_key = str(pack_json.get("name_key", ""))
	ascension_site = str(pack_json.get("ascension_site", ""))
	for t: Variant in pack_json.get("crown_towers", []):
		crown_towers.append(str(t))
	var raw_starts: Variant = pack_json.get("starts", {})
	if raw_starts is Dictionary:
		for faction: Variant in raw_starts:
			starts[str(faction)] = str(raw_starts[faction])
	for t: Variant in map_json.get("territories", []):
		if t is Dictionary:
			territories.append(t)
	for e: Variant in map_json.get("edges", []):
		if e is Dictionary:
			edges.append(e)
	for l: Variant in map_json.get("landmarks", []):
		if l is Dictionary:
			landmarks.append(l)


func _validate() -> void:
	if id.is_empty():
		errors.append("pack id is empty")
	_validate_territories()
	_validate_edges()
	_validate_landmarks()
	_validate_pack_refs()
	_validate_connectivity()


func _validate_territories() -> void:
	if territories.is_empty():
		errors.append("no territories")
	for i in territories.size():
		var t: Dictionary = territories[i]
		var tid: String = str(t.get("id", ""))
		if tid.is_empty():
			errors.append("territory #%d has no id" % i)
			continue
		if _territory_index.has(tid):
			errors.append("duplicate territory id '%s'" % tid)
			continue
		_territory_index[tid] = i
		var c: Variant = t.get("centroid")
		if not (c is Array and c.size() == 2):
			errors.append("territory '%s' has invalid centroid" % tid)
		var poly: Variant = t.get("polygon")
		if not (poly is Array and poly.size() >= 3):
			errors.append("territory '%s' polygon needs >= 3 points" % tid)


func _validate_edges() -> void:
	var seen: Dictionary[String, bool] = {}
	var degree: Dictionary[String, int] = {}
	for e: Dictionary in edges:
		var a: String = str(e.get("a", ""))
		var b: String = str(e.get("b", ""))
		var type: String = str(e.get("type", ""))
		if not has_territory(a) or not has_territory(b):
			errors.append("edge %s-%s references unknown territory" % [a, b])
			continue
		if a == b:
			errors.append("edge %s-%s is a self-loop" % [a, b])
			continue
		if not EDGE_TYPES.has(type):
			errors.append("edge %s-%s has unknown type '%s'" % [a, b, type])
		if type == "bridge" and str(e.get("name", "")).is_empty():
			errors.append("bridge edge %s-%s has no name" % [a, b])
		var key: String = "%s|%s|%s" % [min_str(a, b), max_str(a, b), type]
		if seen.has(key):
			errors.append("duplicate edge %s" % key)
		seen[key] = true
		degree[a] = degree.get(a, 0) + 1
		degree[b] = degree.get(b, 0) + 1
	for tid: String in _territory_index:
		if degree.get(tid, 0) == 0:
			errors.append("territory '%s' has no neighbours" % tid)


func _validate_landmarks() -> void:
	var used_territories: Dictionary[String, String] = {}
	for i in landmarks.size():
		var l: Dictionary = landmarks[i]
		var lid: String = str(l.get("id", ""))
		var tid: String = str(l.get("territory", ""))
		if lid.is_empty():
			errors.append("landmark without id")
			continue
		if _landmark_index.has(lid):
			errors.append("duplicate landmark id '%s'" % lid)
			continue
		_landmark_index[lid] = i
		if not has_territory(tid):
			errors.append("landmark '%s' references unknown territory '%s'" % [lid, tid])
		elif used_territories.has(tid):
			errors.append("territory '%s' holds landmarks '%s' and '%s'" % [tid, used_territories[tid], lid])
		else:
			used_territories[tid] = lid


func _validate_pack_refs() -> void:
	var unique_towers: Dictionary[String, bool] = {}
	for t: String in crown_towers:
		unique_towers[t] = true
		if not _landmark_index.has(t):
			errors.append("crown tower '%s' is not a landmark" % t)
	if unique_towers.size() != CROWN_TOWER_COUNT or crown_towers.size() != CROWN_TOWER_COUNT:
		errors.append("expected %d distinct crown towers" % CROWN_TOWER_COUNT)
	if not _landmark_index.has(ascension_site):
		errors.append("ascension site '%s' is not a landmark" % ascension_site)
	var start_landmarks: Dictionary[String, String] = {}
	for faction: String in starts:
		var lid: String = starts[faction]
		if not _landmark_index.has(lid):
			errors.append("start of '%s' is unknown landmark '%s'" % [faction, lid])
		elif start_landmarks.has(lid):
			errors.append("factions '%s' and '%s' share start '%s'" % [start_landmarks[lid], faction, lid])
		else:
			start_landmarks[lid] = faction


func _validate_connectivity() -> void:
	if territories.is_empty() or not errors.is_empty():
		return
	var first: String = str(territories[0].id)
	var visited: Dictionary[String, bool] = {first: true}
	var queue: Array[String] = [first]
	while not queue.is_empty():
		var cur: String = queue.pop_back()
		for n: String in neighbors(cur):
			if not visited.has(n):
				visited[n] = true
				queue.append(n)
	if visited.size() != territories.size():
		errors.append("ground graph is disconnected: %d of %d territories reachable" % [visited.size(), territories.size()])


static func min_str(a: String, b: String) -> String:
	return a if a < b else b


static func max_str(a: String, b: String) -> String:
	return b if a < b else a


static func _read_json(path: String, errors: PackedStringArray) -> Variant:
	if not FileAccess.file_exists(path):
		errors.append("missing file %s" % path)
		return null
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(path)) != OK:
		errors.append("%s:%d: %s" % [path, json.get_error_line(), json.get_error_message()])
		return null
	if not json.data is Dictionary:
		errors.append("%s: top level must be an object" % path)
		return null
	return json.data
