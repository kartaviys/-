extends GutTest
## Reference values are produced by tools/tests/test_rng_reference.py,
## which re-implements SimRng in Python; both must agree bit for bit.


func test_known_sequence_seed_42() -> void:
	var rng := SimRng.new(42)
	var got: Array[int] = []
	for i in 5:
		got.append(rng.next_u32())
	assert_eq(got, [2837322924, 544945897, 479756282, 3500138142, 339756180])


func test_known_sequence_negative_seed() -> void:
	var rng := SimRng.new(-7)
	var got: Array[int] = []
	for i in 5:
		got.append(rng.next_u32())
	assert_eq(got, [3284082876, 773369603, 510957795, 479553271, 2737896550])


func test_same_seed_same_sequence() -> void:
	var a := SimRng.new(123456789)
	var b := SimRng.new(123456789)
	for i in 1000:
		assert_eq(a.next_u32(), b.next_u32())


func test_different_seeds_differ() -> void:
	var a := SimRng.new(1)
	var b := SimRng.new(2)
	assert_ne(a.next_u32(), b.next_u32())


func test_state_round_trip() -> void:
	var a := SimRng.new(99)
	for i in 17:
		a.next_u32()
	var b := SimRng.new()
	b.set_state(a.get_state())
	for i in 100:
		assert_eq(a.next_u32(), b.next_u32())


func test_range_int_bounds_and_coverage() -> void:
	var rng := SimRng.new(7)
	var seen: Dictionary[int, bool] = {}
	for i in 2000:
		var v: int = rng.range_int(-3, 3)
		assert_between(v, -3, 3)
		seen[v] = true
	assert_eq(seen.size(), 7, "every value in [-3, 3] should appear")


func test_next_float_in_unit_interval() -> void:
	var rng := SimRng.new(5)
	for i in 2000:
		var f: float = rng.next_float()
		assert_true(f >= 0.0 and f < 1.0)
