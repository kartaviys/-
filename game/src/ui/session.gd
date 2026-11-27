class_name Session
extends RefCounted
## Hand-off between screens: the match the player configured in the menu.

const DEFAULT_MAP: String = "ghent"

## {map: String, seed: int, factions: [{id, controller, difficulty}]}
static var setup: Dictionary = {}


static func map_dir(map_id: String) -> String:
	return "res://data/maps/%s" % map_id
