extends GutTest

var rules: GameRules


func before_all() -> void:
	rules = GameRules.load_default()


func _units(composition: Dictionary) -> Array:
	var out: Array = []
	for id: String in composition:
		for i in int(composition[id]):
			out.append({"type": id, "hp": float(rules.unit(id).hp)})
	return out


func _side(composition: Dictionary, morale: float = 50.0, bonus: float = 0.0) -> Dictionary:
	return {"units": _units(composition), "morale": morale, "bonus": bonus}


func test_rules_load() -> void:
	assert_true(rules.is_valid(), "errors: %s" % [rules.errors])
	assert_eq(rules.unit_ids().size(), 5)
	assert_eq(int(rules.num("army.stack_limit")), 12)


func test_same_seed_same_result() -> void:
	var a := Combat.resolve(rules, _side({"knight": 2, "militia": 3}), _side({"pikeman": 3}), SimRng.new(42))
	var b := Combat.resolve(rules, _side({"knight": 2, "militia": 3}), _side({"pikeman": 3}), SimRng.new(42))
	assert_eq(JSON.stringify(a), JSON.stringify(b))


func test_inputs_are_not_mutated() -> void:
	var att := _side({"knight": 2})
	var before: String = JSON.stringify(att)
	Combat.resolve(rules, att, _side({"militia": 4}), SimRng.new(1))
	assert_eq(JSON.stringify(att), before)


func test_overwhelming_force_wins() -> void:
	var p: float = Combat.preview(rules, _side({"knight": 6}), _side({"militia": 2}), 7, 40)
	assert_eq(p, 1.0)


func test_hopeless_attack_loses() -> void:
	var p: float = Combat.preview(rules, _side({"militia": 1}), _side({"knight": 4}), 7, 40)
	assert_eq(p, 0.0)


func test_defence_bonus_lowers_win_chance() -> void:
	var plain: float = Combat.preview(rules, _side({"pikeman": 4}), _side({"pikeman": 3}), 3, 200)
	var walled: float = Combat.preview(rules, _side({"pikeman": 4}), _side({"pikeman": 3}, 50.0, 0.5), 3, 200)
	assert_gt(plain, 0.5)
	assert_lt(walled, plain)


func test_pikemen_double_against_cavalry() -> void:
	var vs_cav: float = Combat.power(rules, _units({"pikeman": 1}), _units({"knight": 1}), 50.0, 0.0)
	var vs_inf: float = Combat.power(rules, _units({"pikeman": 1}), _units({"militia": 1}), 50.0, 0.0)
	assert_almost_eq(vs_cav, vs_inf * 2.0, 0.001)


func test_ranged_volley_counts_only_ranged() -> void:
	var p: float = Combat.power(rules, _units({"crossbowman": 1, "knight": 1}), [], 50.0, 0.0, true)
	assert_almost_eq(p, 5.0, 0.001)


func test_low_morale_side_retreats() -> void:
	var r := Combat.resolve(rules, _side({"knight": 3}, 10.0), _side({"militia": 3}), SimRng.new(5))
	assert_true(r.attacker_retreated)
	assert_eq(r.winner, Combat.DEFENDER)
