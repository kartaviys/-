class_name GameRules
extends RefCounted
## Shared balance data: data/rules/{balance,factions,schools}.json.
##
## Every tunable number is read from JSON; simulation code must not hardcode
## balance. `errors` collects problems instead of throwing.

const RULES_DIR: String = "res://data/rules"

var balance: Dictionary = {}
var factions: Array[Dictionary] = []
var schools: Array[Dictionary] = []
var errors: PackedStringArray = []

var _units: Dictionary[String, Dictionary] = {}
var _factions: Dictionary[String, Dictionary] = {}


static func load_default() -> GameRules:
	return load_from_dir(RULES_DIR)


static func load_from_dir(dir: String) -> GameRules:
	var rules := GameRules.new()
	var b: Variant = _read(dir.path_join("balance.json"), rules.errors)
	var f: Variant = _read(dir.path_join("factions.json"), rules.errors)
	var s: Variant = _read(dir.path_join("schools.json"), rules.errors)
	if b is Dictionary:
		rules.balance = b
		for u: Variant in b.get("units", []):
			rules._units[str(u.id)] = u
	if f is Dictionary:
		for fac: Variant in f.get("factions", []):
			rules.factions.append(fac)
			rules._factions[str(fac.id)] = fac
	if s is Dictionary:
		for sc: Variant in s.get("schools", []):
			rules.schools.append(sc)
	return rules


func is_valid() -> bool:
	return errors.is_empty()


## Number from balance.json by dotted path, e.g. "combat.max_rounds".
func num(path: String) -> float:
	return float(value(path))


func value(path: String) -> Variant:
	var cur: Variant = balance
	for part: String in path.split("."):
		if not (cur is Dictionary and cur.has(part)):
			push_error("balance.json has no '%s'" % path)
			return 0
		cur = cur[part]
	return cur


func unit(unit_id: String) -> Dictionary:
	return _units[unit_id]


func has_unit(unit_id: String) -> bool:
	return _units.has(unit_id)


func unit_ids() -> PackedStringArray:
	var ids: PackedStringArray = []
	for u: Dictionary in balance.get("units", []):
		ids.append(str(u.id))
	return ids


func faction(faction_id: String) -> Dictionary:
	return _factions[faction_id]


func school_ids() -> PackedStringArray:
	var ids: PackedStringArray = []
	for s: Dictionary in schools:
		ids.append(str(s.id))
	return ids


static func _read(path: String, errors: PackedStringArray) -> Variant:
	if not FileAccess.file_exists(path):
		errors.append("missing file %s" % path)
		return null
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not data is Dictionary:
		errors.append("%s: invalid JSON object" % path)
		return null
	return data
