class_name SimpleAi
extends RefCounted
## Greedy utility AI for phase 3: attack the best-value neighbour it can beat,
## push idle armies toward the front, recruit at bound landmarks.
##
## Works only with the graph and pack data, never with city specifics.
## Uses the same win-chance preview the player sees (spec 7).

const AI_PREVIEW_SAMPLES: int = 16


## Plays the current faction's whole turn without ending it.
static func play_turn(game: Game) -> void:
	var fid: String = game.current_faction()
	var difficulty: String = game.faction_state(fid).difficulty
	var threshold: float = float(game.rules.value("ai.attack_threshold").get(difficulty, 0.6))
	_attack_phase(game, fid, threshold)
	_advance_phase(game, fid)
	_recruit_phase(game, fid)


static func _attack_phase(game: Game, fid: String, threshold: float) -> void:
	var ai: Dictionary = game.rules.value("ai")
	# Several passes so that freshly captured ground can be used as a springboard
	# by armies that have not moved yet.
	for pass_no in 3:
		var acted: bool = false
		for tid: String in game.territories_of(fid):
			if game.is_over() or game.owner_of(tid) != fid or game.ready_units(tid) == 0:
				continue
			var keep: int = int(ai.keep_garrison) if _borders_enemy(game, fid, tid) else 0
			var count: int = game.ready_units(tid) - keep
			if count <= 0:
				continue
			var best: String = ""
			var best_score: float = 0.0
			for n: String in game.move_targets(fid, tid):
				if game.owner_of(n) == fid:
					continue
				var p: float = game.preview_attack(tid, n, count, AI_PREVIEW_SAMPLES)
				if p < threshold:
					continue
				var score: float = p * _value(game, n)
				if score > best_score:
					best_score = score
					best = n
			if best != "":
				game.move(tid, best, count)
				acted = true
		if not acted:
			break


## Interior armies walk one step toward the nearest non-own territory.
static func _advance_phase(game: Game, fid: String) -> void:
	var dist: Dictionary = _frontier_distance(game, fid)
	for tid: String in game.territories_of(fid):
		if game.ready_units(tid) == 0 or _borders_enemy(game, fid, tid):
			continue
		var here: int = int(dist.get(tid, 1 << 20))
		var step: String = ""
		for n: String in game.move_targets(fid, tid):
			if game.owner_of(n) == fid and int(dist.get(n, 1 << 20)) < here:
				here = int(dist[n])
				step = n
		if step != "" and game.check_move(tid, step) == "":
			game.move(tid, step)


static func _recruit_phase(game: Game, fid: String) -> void:
	var reserve: int = game.upkeep_of(fid)
	var order: PackedStringArray = ["knight", "pikeman", "crossbowman", "militia"]
	var sites: PackedStringArray = []
	for tid: String in game.territories_of(fid):
		if game.is_recruit_site(fid, tid):
			sites.append(tid)
	for tid: String in sites:
		for unit_id: String in order:
			while int(game.faction_state(fid).gold) - int(game.rules.unit(unit_id).cost) >= reserve:
				if not game.recruit(tid, unit_id).ok:
					break


static func _value(game: Game, tid: String) -> float:
	var ai: Dictionary = game.rules.value("ai")
	var v: float = float(ai.territory_value)
	var lid: String = game.pack.landmark_in(tid)
	if lid != "":
		v += float(ai.landmark_value)
		if game.pack.crown_towers.has(lid):
			v += float(ai.crown_value)
	if game.owner_of(tid) != Game.NEUTRAL:
		v += 0.5  # hurting a rival is worth a little more than taking neutral ground
	return v


static func _borders_enemy(game: Game, fid: String, tid: String) -> bool:
	for n: String in game.pack.neighbors(tid):
		if game.owner_of(n) != fid:
			return true
	return false


## BFS distance (over ground edges) from every territory to the nearest non-own one.
static func _frontier_distance(game: Game, fid: String) -> Dictionary:
	var dist: Dictionary = {}
	var queue: Array[String] = []
	for t: Dictionary in game.pack.territories:
		if game.owner_of(t.id) != fid:
			dist[t.id] = 0
			queue.append(t.id)
	var head: int = 0
	while head < queue.size():
		var cur: String = queue[head]
		head += 1
		for n: String in game.pack.neighbors(cur):
			if not dist.has(n):
				dist[n] = int(dist[cur]) + 1
				queue.append(n)
	return dist
