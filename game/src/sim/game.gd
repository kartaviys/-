class_name Game
extends RefCounted
## The turn-based simulation (spec 4.1–4.7, 4.11; phase 3 without magic).
##
## Pure logic: no nodes, scenes or rendering. All state lives in `state`, a
## JSON-compatible Dictionary, so saves, replays and networking can serialize
## it directly. Randomness comes only from the seeded SimRng.
##
## state = {
##   day, turn, order: [faction_id], winner, victory,
##   factions:    {id: {gold, mana: {school: int}, alive, controller, difficulty}},
##   territories: {id: {owner, morale, units: [{type, hp, moved}]}},
##   landmarks:   {id: {controller, binder, progress}},
##   crown_days:  {faction_id: int},
## }

signal event(info: Dictionary)

const SAVE_VERSION: int = 1
const NEUTRAL: String = ""
const CONTROLLER_HUMAN: String = "human"
const CONTROLLER_AI: String = "ai"

const VICTORY_DOMINATION: String = "domination"
const VICTORY_CROWN: String = "crown_towers"
const VICTORY_ELIMINATION: String = "elimination"

const ERR_NOT_YOUR_TURN: String = "ERR_NOT_YOUR_TURN"
const ERR_NOT_OWNER: String = "ERR_NOT_OWNER"
const ERR_NOT_ADJACENT: String = "ERR_NOT_ADJACENT"
const ERR_NO_UNITS: String = "ERR_NO_UNITS"
const ERR_STACK_FULL: String = "ERR_STACK_FULL"
const ERR_NO_GOLD: String = "ERR_NO_GOLD"
const ERR_NO_MANA: String = "ERR_NO_MANA"
const ERR_NO_RECRUIT_SITE: String = "ERR_NO_RECRUIT_SITE"
const ERR_GAME_OVER: String = "ERR_GAME_OVER"

var rules: GameRules
var pack: MapPack
var state: Dictionary = {}
var rng: SimRng


## setup = {seed: int, factions: [{id, controller: "human"|"ai", difficulty}]}
static func create(game_rules: GameRules, map_pack: MapPack, setup: Dictionary) -> Game:
	var g := Game.new()
	g.rules = game_rules
	g.pack = map_pack
	g.rng = SimRng.new(int(setup.get("seed", 0)))
	g._init_state(setup)
	g._start_turn()
	return g


## Restores a game from `save_data()` (possibly after a JSON round trip).
static func load_from(game_rules: GameRules, map_pack: MapPack, data: Dictionary) -> Game:
	var g := Game.new()
	g.rules = game_rules
	g.pack = map_pack
	g.state = data.state
	g.rng = SimRng.new()
	var words: Array[int] = []
	for w: Variant in data.rng:
		words.append(int(w))
	g.rng.set_state(words)
	return g


## Everything needed to continue the game: JSON-compatible (spec 8.6).
func save_data() -> Dictionary:
	return {"version": SAVE_VERSION, "map": pack.id, "state": state.duplicate(true), "rng": rng.get_state()}


func current_faction() -> String:
	return state.order[int(state.turn)]


func is_over() -> bool:
	return state.winner != ""


func faction_state(fid: String) -> Dictionary:
	return state.factions[fid]


func territory(tid: String) -> Dictionary:
	return state.territories[tid]


func owner_of(tid: String) -> String:
	return state.territories[tid].owner


func is_night() -> bool:
	var phase: int = int(rules.num("turn.days_per_day_night_phase"))
	return ((int(state.day) - 1) / phase) % 2 == 1


func territories_of(fid: String) -> PackedStringArray:
	var out: PackedStringArray = []
	for t: Dictionary in pack.territories:
		if state.territories[t.id].owner == fid:
			out.append(t.id)
	return out


func ready_units(tid: String) -> int:
	var n: int = 0
	for u: Dictionary in state.territories[tid].units:
		if not u.moved:
			n += 1
	return n


## Landmarks whose bonus currently belongs to `fid` (binding ritual completed).
func landmarks_of(fid: String) -> PackedStringArray:
	var out: PackedStringArray = []
	for l: Dictionary in pack.landmarks:
		if state.landmarks[l.id].controller == fid:
			out.append(l.id)
	return out


## Ground neighbours a faction may use from `tid`. Rail links only own stations.
func move_targets(fid: String, tid: String) -> PackedStringArray:
	var out: PackedStringArray = []
	for n: String in pack.neighbors(tid, MapPack.GROUND_EDGE_TYPES):
		var via: String = pack.edge_type(tid, n, MapPack.GROUND_EDGE_TYPES)
		if via == "rail" and pack.edge_type(tid, n, ["land", "bridge"]) == "":
			if owner_of(n) != fid or owner_of(tid) != fid:
				continue
		if not out.has(n):
			out.append(n)
	return out


## Own territories plus everything adjacent over any edge type (spec 4.7).
func visible_territories(fid: String) -> Dictionary:
	var seen: Dictionary = {}
	for tid: String in territories_of(fid):
		seen[tid] = true
		for n: String in pack.neighbors(tid, MapPack.EDGE_TYPES):
			seen[n] = true
	return seen


func income_of(fid: String) -> int:
	var e: Dictionary = rules.value("economy")
	var total: float = 0.0
	for tid: String in territories_of(fid):
		var stats: Dictionary = pack.get_territory(tid).get("stats", {})
		total += float(e.income_base)
		total += float(stats.get("buildings", 0)) * float(e.income_per_building)
		total += float(stats.get("road_length_m", 0)) / 1000.0 * float(e.income_per_road_km)
	total += float(landmarks_of(fid).size()) * float(e.landmark_income_bonus)
	return int(round(total))


func upkeep_of(fid: String) -> int:
	var total: int = 0
	for tid: String in territories_of(fid):
		for u: Dictionary in state.territories[tid].units:
			total += int(rules.unit(u.type).upkeep)
	return total


func mana_income_of(fid: String) -> Dictionary:
	var mana: Dictionary = {}
	for lid: String in landmarks_of(fid):
		var lm: Dictionary = pack.landmark_rules.get(lid, {})
		var per_school: Dictionary = lm.get("mana", {})
		for school: String in per_school:
			mana[school] = int(mana.get(school, 0)) + int(per_school[school])
	return mana


# --------------------------------------------------------------- commands

## Checks a move/attack without performing it. Returns "" or an ERR_ key.
func check_move(from_tid: String, to_tid: String) -> String:
	var fid: String = current_faction()
	if is_over():
		return ERR_GAME_OVER
	if owner_of(from_tid) != fid:
		return ERR_NOT_OWNER
	if not move_targets(fid, from_tid).has(to_tid):
		return ERR_NOT_ADJACENT
	if ready_units(from_tid) == 0:
		return ERR_NO_UNITS
	if owner_of(to_tid) == fid:
		var free: int = int(rules.num("army.stack_limit")) - state.territories[to_tid].units.size()
		if free <= 0:
			return ERR_STACK_FULL
	return ""


## Attacker win chance for moving `count` ready units (-1 = all) into `to_tid`.
func preview_attack(from_tid: String, to_tid: String, count: int = -1, samples: int = -1) -> float:
	var target: Dictionary = state.territories[to_tid]
	if target.owner == owner_of(from_tid) or target.units.is_empty():
		return 1.0
	var movers: Array = _pick_movers(from_tid, count)
	var seed_value: int = hash([from_tid, to_tid, movers.size(), int(state.day), int(state.turn)])
	return Combat.preview(rules, _attacker_side(from_tid, movers), _defender_side(from_tid, to_tid), seed_value, samples)


## Moves `count` ready units (-1 = all) from an own territory into a neighbour.
## Into an own territory it merges; into a hostile or neutral one it attacks.
## Returns {ok, error, kind: "move"|"capture"|"battle", battle?, captured}.
func move(from_tid: String, to_tid: String, count: int = -1) -> Dictionary:
	var err: String = check_move(from_tid, to_tid)
	if err != "":
		return {"ok": false, "error": err}
	var fid: String = current_faction()
	var src: Dictionary = state.territories[from_tid]
	var dst: Dictionary = state.territories[to_tid]
	var movers: Array = _pick_movers(from_tid, count)
	if dst.owner == fid:
		var free: int = int(rules.num("army.stack_limit")) - dst.units.size()
		movers = movers.slice(0, free)
		_take_units(src, movers)
		_add_units(dst, movers, src.morale, true)
		_emit({"type": "move", "faction": fid, "from": from_tid, "to": to_tid, "count": movers.size()})
		return {"ok": true, "kind": "move", "captured": false}
	if dst.units.is_empty():
		_take_units(src, movers)
		_capture(fid, to_tid, movers, src.morale)
		_emit({"type": "capture", "faction": fid, "from": from_tid, "to": to_tid})
		_after_capture()
		return {"ok": true, "kind": "capture", "captured": true}
	return _battle(fid, from_tid, to_tid, movers)


## Hires one unit in an own territory with a bound landmark (capital or captured site).
func check_recruit(tid: String, unit_id: String) -> String:
	var fid: String = current_faction()
	if is_over():
		return ERR_GAME_OVER
	if owner_of(tid) != fid:
		return ERR_NOT_OWNER
	if not is_recruit_site(fid, tid):
		return ERR_NO_RECRUIT_SITE
	if state.territories[tid].units.size() >= int(rules.num("army.stack_limit")):
		return ERR_STACK_FULL
	var spec: Dictionary = rules.unit(unit_id)
	var fs: Dictionary = state.factions[fid]
	if int(fs.gold) < int(spec.cost):
		return ERR_NO_GOLD
	var mana_cost: int = int(spec.get("mana_cost", 0))
	if mana_cost > 0 and int(fs.mana.get(rules.faction(fid).school, 0)) < mana_cost:
		return ERR_NO_MANA
	return ""


func is_recruit_site(fid: String, tid: String) -> bool:
	var lid: String = pack.landmark_in(tid)
	return lid != "" and owner_of(tid) == fid and state.landmarks[lid].controller == fid


func recruit(tid: String, unit_id: String) -> Dictionary:
	var err: String = check_recruit(tid, unit_id)
	if err != "":
		return {"ok": false, "error": err}
	var fid: String = current_faction()
	var spec: Dictionary = rules.unit(unit_id)
	var fs: Dictionary = state.factions[fid]
	fs.gold = int(fs.gold) - int(spec.cost)
	var mana_cost: int = int(spec.get("mana_cost", 0))
	if mana_cost > 0:
		var school: String = rules.faction(fid).school
		fs.mana[school] = int(fs.mana[school]) - mana_cost
	state.territories[tid].units.append({"type": unit_id, "hp": float(spec.hp), "moved": true})
	_emit({"type": "recruit", "faction": fid, "territory": tid, "unit": unit_id})
	return {"ok": true}


## Ends the current faction's turn: binding rituals, victory checks, next faction.
func end_turn() -> void:
	if is_over():
		return
	var fid: String = current_faction()
	_advance_rituals(fid)
	_check_domination(fid)
	if is_over():
		return
	var n: int = state.order.size()
	for i in n:
		state.turn = int(state.turn) + 1
		if state.turn >= n:
			state.turn = 0
			_new_day()
			if is_over():
				return
		if state.factions[current_faction()].alive:
			break
	_start_turn()


# --------------------------------------------------------------- internals

func _init_state(setup: Dictionary) -> void:
	state = {
		"day": 1, "turn": 0, "order": [], "winner": "", "victory": "",
		"factions": {}, "territories": {}, "landmarks": {}, "crown_days": {},
	}
	for t: Dictionary in pack.territories:
		state.territories[t.id] = {"owner": NEUTRAL, "morale": int(rules.num("neutrals.guardian_morale")), "units": []}
	for l: Dictionary in pack.landmarks:
		state.landmarks[l.id] = {"controller": NEUTRAL, "binder": NEUTRAL, "progress": 0}
	# Neutral garrisons: guardians on landmarks, militia elsewhere.
	var tiers: Dictionary = rules.value("neutrals.guardian_tiers")
	for t: Dictionary in pack.territories:
		var lid: String = pack.landmark_in(t.id)
		var garrison: Dictionary = rules.value("neutrals.territory_garrison")
		if lid != "":
			var tier: String = str(int(pack.landmark_rules.get(lid, {}).get("guardian_tier", 1)))
			garrison = tiers.get(tier, garrison)
		state.territories[t.id].units = _make_units(garrison, false)
	for f: Dictionary in setup.get("factions", []):
		var fid: String = str(f.id)
		state.order.append(fid)
		state.factions[fid] = {
			"gold": int(rules.num("economy.start_gold")),
			"mana": _zero_mana(), "alive": true,
			"controller": str(f.get("controller", CONTROLLER_AI)),
			"difficulty": str(f.get("difficulty", "normal")),
		}
		state.crown_days[fid] = 0
		var start_lid: String = pack.starts[fid]
		var start_tid: String = str(pack.get_landmark(start_lid).territory)
		var home: Dictionary = state.territories[start_tid]
		home.owner = fid
		home.morale = int(rules.num("army.start_morale"))
		home.units = _make_units(rules.value("army.start_units"), false)
		state.landmarks[start_lid].controller = fid


func _start_turn() -> void:
	var fid: String = current_faction()
	var fs: Dictionary = state.factions[fid]
	fs.gold = int(fs.gold) + income_of(fid) - upkeep_of(fid)
	var mana: Dictionary = mana_income_of(fid)
	for school: String in mana:
		fs.mana[school] = int(fs.mana.get(school, 0)) + int(mana[school])
	var heal: float = rules.num("economy.heal_share_per_turn")
	var bankrupt: bool = int(fs.gold) < 0
	if bankrupt:
		fs.gold = 0
	for tid: String in territories_of(fid):
		var t: Dictionary = state.territories[tid]
		if bankrupt and not t.units.is_empty():
			t.morale = maxi(0, int(t.morale) - int(rules.num("economy.bankrupt_morale_penalty")))
			_desert_one(t)
		for u: Dictionary in t.units:
			var hp_max: float = float(rules.unit(u.type).hp)
			u.hp = minf(hp_max, float(u.hp) + hp_max * heal)
			u.moved = false
	_emit({"type": "turn_start", "faction": fid, "day": state.day})


func _new_day() -> void:
	state.day = int(state.day) + 1
	# Crown towers: one faction must hold all three for N full days.
	var holder: String = NEUTRAL
	for lid: String in pack.crown_towers:
		var c: String = state.landmarks[lid].controller
		if c == NEUTRAL or (holder != NEUTRAL and c != holder):
			holder = NEUTRAL
			break
		holder = c
	for fid: String in state.crown_days:
		state.crown_days[fid] = int(state.crown_days[fid]) + 1 if fid == holder else 0
	if holder != NEUTRAL and int(state.crown_days[holder]) >= int(rules.num("victory.crown_hold_days")):
		_win(holder, VICTORY_CROWN)


func _advance_rituals(fid: String) -> void:
	for l: Dictionary in pack.landmarks:
		var ls: Dictionary = state.landmarks[l.id]
		if ls.binder != fid:
			continue
		var t: Dictionary = state.territories[l.territory]
		if t.owner != fid or t.units.is_empty():
			continue
		ls.progress = int(ls.progress) + 1
		if int(ls.progress) >= int(rules.num("capture.ritual_turns")):
			ls.controller = fid
			ls.binder = NEUTRAL
			ls.progress = 0
			_emit({"type": "bound", "faction": fid, "landmark": l.id})


func _check_domination(fid: String) -> void:
	var share: float = float(territories_of(fid).size()) / float(pack.territories.size())
	if share >= rules.num("victory.domination_share"):
		_win(fid, VICTORY_DOMINATION)


func _after_capture() -> void:
	var alive: PackedStringArray = []
	for fid: String in state.order:
		var fs: Dictionary = state.factions[fid]
		if fs.alive and territories_of(fid).is_empty():
			fs.alive = false
			_emit({"type": "eliminated", "faction": fid})
		if fs.alive:
			alive.append(fid)
	if alive.size() == 1 and state.order.size() > 1:
		_win(alive[0], VICTORY_ELIMINATION)


func _win(fid: String, kind: String) -> void:
	if is_over():
		return
	state.winner = fid
	state.victory = kind
	_emit({"type": "victory", "faction": fid, "victory": kind})


func _battle(fid: String, from_tid: String, to_tid: String, movers: Array) -> Dictionary:
	var src: Dictionary = state.territories[from_tid]
	var dst: Dictionary = state.territories[to_tid]
	var defender_fid: String = dst.owner
	var result: Dictionary = Combat.resolve(rules, _attacker_side(from_tid, movers), _defender_side(from_tid, to_tid), rng)
	_take_units(src, movers)
	var win: int = int(rules.num("army.morale_win"))
	var loss: int = int(rules.num("army.morale_loss"))
	var survivors: Array = result[Combat.ATTACKER]
	var info: Dictionary = {
		"type": "battle", "faction": fid, "defender": defender_fid, "from": from_tid, "to": to_tid,
		"winner": result.winner, "rounds": result.rounds,
		"attacker_before": movers.size(), "attacker_after": survivors.size(),
		"defender_before": dst.units.size(), "defender_after": result[Combat.DEFENDER].size(),
	}
	if result.winner == Combat.ATTACKER:
		var def_survivors: Array = result[Combat.DEFENDER]
		if defender_fid != NEUTRAL:
			_retreat_defender(defender_fid, to_tid, def_survivors, maxi(0, int(dst.morale) - loss))
		dst.units = []
		_capture(fid, to_tid, survivors, mini(int(rules.num("army.morale_max")), int(src.morale) + win))
		_emit(info)
		_after_capture()
	else:
		_add_units(src, survivors, int(src.morale), true)
		src.morale = maxi(0, int(src.morale) - loss)
		dst.units = _as_state_units(result[Combat.DEFENDER], false)
		if defender_fid != NEUTRAL:
			dst.morale = mini(int(rules.num("army.morale_max")), int(dst.morale) + win)
		_emit(info)
	return {"ok": true, "kind": "battle", "battle": info, "captured": result.winner == Combat.ATTACKER}


## Defeated defenders fall back into an adjacent own territory with room, or are lost.
func _retreat_defender(fid: String, from_tid: String, units: Array, morale: int) -> void:
	if units.is_empty():
		return
	for n: String in pack.neighbors(from_tid):
		var t: Dictionary = state.territories[n]
		var free: int = int(rules.num("army.stack_limit")) - t.units.size()
		if t.owner == fid and free > 0:
			_add_units(t, _as_state_units(units.slice(0, free), true), morale, false)
			return


func _capture(fid: String, tid: String, units: Array, morale: int) -> void:
	var t: Dictionary = state.territories[tid]
	t.owner = fid
	t.units = _as_state_units(units, true)
	t.morale = morale
	var lid: String = pack.landmark_in(tid)
	if lid != "":
		var ls: Dictionary = state.landmarks[lid]
		# The site turns neutral while the new owner performs the binding ritual.
		ls.controller = NEUTRAL
		ls.binder = fid
		ls.progress = 0


func _attacker_side(from_tid: String, movers: Array) -> Dictionary:
	return {"units": movers, "morale": float(state.territories[from_tid].morale), "bonus": 0.0}


func _defender_side(from_tid: String, to_tid: String) -> Dictionary:
	var c: Dictionary = rules.value("combat")
	var dst: Dictionary = state.territories[to_tid]
	var bonus: float = float(c.defense_bonus_own)
	if pack.edge_type(from_tid, to_tid, MapPack.GROUND_EDGE_TYPES) == "bridge" \
			and pack.edge_type(from_tid, to_tid, ["land"]) == "":
		bonus += float(c.defense_bonus_bridge)
	if dst.owner == NEUTRAL and pack.landmark_in(to_tid) != "":
		bonus += rules.num("neutrals.guardian_power_per_day") * float(int(state.day) - 1)
	return {"units": dst.units, "morale": float(dst.morale), "bonus": bonus}


## Ready units in a stable order: strongest first, so splits keep the core together.
func _pick_movers(tid: String, count: int) -> Array:
	var ready: Array = []
	for u: Dictionary in state.territories[tid].units:
		if not u.moved:
			ready.append(u)
	ready.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return _strength(a) > _strength(b))
	if count >= 0 and count < ready.size():
		ready = ready.slice(0, count)
	return ready


func _strength(u: Dictionary) -> float:
	var spec: Dictionary = rules.unit(u.type)
	return float(spec.cost) * float(u.hp) / float(spec.hp)


func _take_units(t: Dictionary, units: Array) -> void:
	for u: Dictionary in units:
		t.units.erase(u)


func _add_units(t: Dictionary, units: Array, morale: int, mark_moved: bool) -> void:
	var before: int = t.units.size()
	for u: Dictionary in units:
		t.units.append({"type": u.type, "hp": float(u.hp), "moved": mark_moved or bool(u.get("moved", false))})
	if before + units.size() > 0:
		t.morale = int(round((float(t.morale) * before + float(morale) * units.size()) / float(before + units.size())))


func _desert_one(t: Dictionary) -> void:
	var cheapest: int = -1
	for i in t.units.size():
		if cheapest < 0 or int(rules.unit(t.units[i].type).cost) < int(rules.unit(t.units[cheapest].type).cost):
			cheapest = i
	if cheapest >= 0:
		t.units.remove_at(cheapest)


func _make_units(composition: Dictionary, moved: bool) -> Array:
	var out: Array = []
	for unit_id: String in rules.unit_ids():
		for i in int(composition.get(unit_id, 0)):
			out.append({"type": unit_id, "hp": float(rules.unit(unit_id).hp), "moved": moved})
	return out


func _as_state_units(units: Array, moved: bool) -> Array:
	var out: Array = []
	for u: Dictionary in units:
		out.append({"type": u.type, "hp": float(u.hp), "moved": moved})
	return out


func _zero_mana() -> Dictionary:
	var mana: Dictionary = {}
	for s: String in rules.school_ids():
		mana[s] = 0
	return mana


func _emit(info: Dictionary) -> void:
	event.emit(info)
