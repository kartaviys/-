class_name SimRng
extends RefCounted
## Deterministic seedable RNG (xoshiro128**) for the simulation layer.
##
## All arithmetic stays inside 32-bit unsigned values held in 64-bit ints, so
## no operation overflows and results are bit-identical on every platform.
## Never use Godot's global randi()/randf() in simulation code.

const MASK32: int = 0xFFFFFFFF
const TWO_POW_32: float = 4294967296.0

var _s: PackedInt64Array = PackedInt64Array([0, 0, 0, 0])


func _init(seed_value: int = 0) -> void:
	set_seed(seed_value)


## Re-seeds the generator. Any int (including negative) is a valid seed.
func set_seed(seed_value: int) -> void:
	var sm: int = (seed_value ^ (seed_value >> 32)) & MASK32
	for i in 4:
		sm = (sm + 0x9E3779B9) & MASK32
		var z: int = sm
		z = _mul32(z ^ (z >> 16), 0x85EBCA6B)
		z = _mul32(z ^ (z >> 13), 0xC2B2AE35)
		_s[i] = z ^ (z >> 16)
	if _s[0] == 0 and _s[1] == 0 and _s[2] == 0 and _s[3] == 0:
		_s[0] = 1


## Next raw value in [0, 2^32).
func next_u32() -> int:
	var result: int = _mul32(_rotl(_mul32(_s[1], 5), 7), 9)
	var t: int = (_s[1] << 9) & MASK32
	_s[2] ^= _s[0]
	_s[3] ^= _s[1]
	_s[1] ^= _s[2]
	_s[0] ^= _s[3]
	_s[2] ^= t
	_s[3] = _rotl(_s[3], 11)
	return result


## Uniform float in [0, 1).
func next_float() -> float:
	return float(next_u32()) / TWO_POW_32


## Uniform int in [lo, hi] inclusive, without modulo bias.
func range_int(lo: int, hi: int) -> int:
	assert(hi >= lo, "range_int: hi < lo")
	var span: int = hi - lo + 1
	assert(span <= TWO_POW_32, "range_int: span exceeds 32 bits")
	var limit: int = int(TWO_POW_32) - (int(TWO_POW_32) % span)
	var v: int = next_u32()
	while v >= limit:
		v = next_u32()
	return lo + v % span


## Uniform float in [lo, hi).
func range_float(lo: float, hi: float) -> float:
	return lo + (hi - lo) * next_float()


## Serializable state for saves and replays.
func get_state() -> Array[int]:
	return [_s[0], _s[1], _s[2], _s[3]]


func set_state(state: Array[int]) -> void:
	assert(state.size() == 4, "set_state: expected 4 words")
	for i in 4:
		_s[i] = state[i] & MASK32


static func _rotl(x: int, k: int) -> int:
	return ((x << k) & MASK32) | (x >> (32 - k))


## (a * b) mod 2^32 for 32-bit a, b without 64-bit overflow.
static func _mul32(a: int, b: int) -> int:
	var lo: int = a * (b & 0xFFFF)
	var hi: int = ((a * (b >> 16)) & 0xFFFF) << 16
	return (lo + hi) & MASK32
