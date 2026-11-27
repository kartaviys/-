class_name Combat
extends RefCounted
## Auto-battle resolver (spec 4.4). Pure and deterministic for a given RNG.
##
## A side is {"units": Array of {type, hp}, "morale": int, "bonus": float}.
## `bonus` sums every multiplicative modifier the caller knows about
## (defence of own ground, bridge, guardian growth, later spells/landmarks).
## Unit dictionaries are copied; inputs are never mutated.

const ATTACKER: String = "attacker"
const DEFENDER: String = "defender"


## Returns {winner, attacker: units[], defender: units[], rounds, attacker_retreated, defender_retreated}.
static func resolve(rules: GameRules, attacker: Dictionary, defender: Dictionary, rng: SimRng) -> Dictionary:
	var c: Dictionary = rules.value("combat")
	var att: Array[Dictionary] = _copy_units(attacker.units)
	var def: Array[Dictionary] = _copy_units(defender.units)
	var att_start: float = power(rules, att, def, attacker.morale, attacker.bonus)
	var def_start: float = power(rules, def, att, defender.morale, defender.bonus)
	var result: Dictionary = {
		"winner": DEFENDER, "rounds": 0,
		"attacker_retreated": false, "defender_retreated": false,
	}
	var max_rounds: int = int(c.max_rounds)
	for round_no in range(1, max_rounds + 1):
		result.rounds = round_no
		if round_no == 1:
			# Ranged units volley first; the other side cannot answer this volley.
			var att_volley: float = power(rules, att, def, attacker.morale, attacker.bonus, true)
			var def_volley: float = power(rules, def, att, defender.morale, defender.bonus, true)
			_deal(rules, att_volley, def, rng)
			_deal(rules, def_volley, att, rng)
			if att.is_empty() or def.is_empty():
				break
		var att_pow: float = power(rules, att, def, attacker.morale, attacker.bonus)
		var def_pow: float = power(rules, def, att, defender.morale, defender.bonus)
		_deal(rules, att_pow, def, rng)
		_deal(rules, def_pow, att, rng)
		if att.is_empty() or def.is_empty():
			break
		if _wants_retreat(rules, att, def, attacker, att_start):
			result.attacker_retreated = true
			break
		if _wants_retreat(rules, def, att, defender, def_start):
			result.defender_retreated = true
			break
	if att.is_empty():
		result.winner = DEFENDER
	elif def.is_empty() or result.defender_retreated:
		result.winner = ATTACKER
	else:
		# Attacker retreated or rounds ran out: the defender holds.
		result.winner = DEFENDER
	result[ATTACKER] = att
	result[DEFENDER] = def
	return result


## Win probability for the attacker over `samples` seeded simulations.
## Uses its own RNG so previews never disturb the game's RNG stream.
static func preview(rules: GameRules, attacker: Dictionary, defender: Dictionary, seed_value: int, samples: int = -1) -> float:
	if defender.units.is_empty():
		return 1.0
	if attacker.units.is_empty():
		return 0.0
	var n: int = samples if samples > 0 else int(rules.num("combat.preview_samples"))
	var rng := SimRng.new(seed_value)
	var wins: int = 0
	for i in n:
		if resolve(rules, attacker, defender, rng).winner == ATTACKER:
			wins += 1
	return float(wins) / float(n)


## power = Σ(atk × hp/hp_max × matchup) × (1 + morale_mod) × (1 + bonus)
static func power(rules: GameRules, units: Array, enemy: Array, morale: float, bonus: float, ranged_only: bool = false) -> float:
	var c: Dictionary = rules.value("combat")
	var cav_share: float = _tag_share(rules, enemy, "cavalry")
	var total: float = 0.0
	for u: Dictionary in units:
		var spec: Dictionary = rules.unit(u.type)
		var tags: Array = spec.get("tags", [])
		if ranged_only and not tags.has("ranged"):
			continue
		var p: float = float(spec.atk) * float(u.hp) / float(spec.hp)
		if tags.has("anti_cavalry"):
			p *= 1.0 + (float(c.anti_cavalry_multiplier) - 1.0) * cav_share
		total += p
	var morale_mod: float = (morale - float(c.morale_neutral)) * float(c.morale_mod_per_point)
	return total * (1.0 + morale_mod) * (1.0 + bonus)


## Deals one volley. Raw damage is spread over the targets in a shuffled order:
## each unit soaks what it can (softened by its defence) before the rest moves on,
## so casualties come one by one instead of every unit dying in the same round.
static func _deal(rules: GameRules, attack_power: float, targets: Array[Dictionary], rng: SimRng) -> void:
	if attack_power <= 0.0 or targets.is_empty():
		return
	var c: Dictionary = rules.value("combat")
	var spread: float = float(c.random_spread)
	var raw: float = attack_power * float(c.damage_per_power) * rng.range_float(1.0 - spread, 1.0 + spread)
	var soft: float = float(c.defense_softening)
	var order: Array[int] = []
	for i in targets.size():
		order.append(i)
	for i in range(order.size() - 1, 0, -1):
		var j: int = rng.range_int(0, i)
		var tmp: int = order[i]
		order[i] = order[j]
		order[j] = tmp
	for i: int in order:
		if raw <= 0.0:
			break
		var u: Dictionary = targets[i]
		var k: float = soft / (soft + float(rules.unit(u.type).def))
		var dealt: float = minf(float(u.hp), raw * k)
		u.hp = float(u.hp) - dealt
		raw -= dealt / k
	for i in range(targets.size() - 1, -1, -1):
		if float(targets[i].hp) <= 0.01:
			targets.remove_at(i)


static func _wants_retreat(rules: GameRules, own: Array, enemy: Array, side: Dictionary, start_power: float) -> bool:
	var c: Dictionary = rules.value("combat")
	if float(side.morale) < float(c.retreat_morale):
		return true
	var now: float = power(rules, own, enemy, side.morale, side.bonus)
	return start_power > 0.0 and now < start_power * (1.0 - float(c.retreat_power_loss))


static func _tag_share(rules: GameRules, units: Array, tag: String) -> float:
	if units.is_empty():
		return 0.0
	var n: int = 0
	for u: Dictionary in units:
		if rules.unit(u.type).get("tags", []).has(tag):
			n += 1
	return float(n) / float(units.size())


static func _copy_units(units: Array) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for u: Dictionary in units:
		out.append({"type": u.type, "hp": float(u.hp)})
	return out
