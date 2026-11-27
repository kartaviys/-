"""Python reference for game/src/sim/core/rng.gd (SimRng, xoshiro128**).

Tools that must reproduce simulation randomness (balance analysis, replay
inspection) use this implementation. The expected sequences below are also
hard-coded in game/tests/unit/test_rng.gd, so both sides stay in lockstep.
"""

import unittest

MASK32 = 0xFFFFFFFF


def _rotl(x: int, k: int) -> int:
    return ((x << k) & MASK32) | (x >> (32 - k))


class SimRng:
    def __init__(self, seed: int = 0):
        # Python's >> on negative ints is arithmetic, matching GDScript.
        sm = (seed ^ (seed >> 32)) & MASK32
        self.s = []
        for _ in range(4):
            sm = (sm + 0x9E3779B9) & MASK32
            z = sm
            z = ((z ^ (z >> 16)) * 0x85EBCA6B) & MASK32
            z = ((z ^ (z >> 13)) * 0xC2B2AE35) & MASK32
            self.s.append(z ^ (z >> 16))
        if not any(self.s):
            self.s[0] = 1

    def next_u32(self) -> int:
        s = self.s
        result = (_rotl((s[1] * 5) & MASK32, 7) * 9) & MASK32
        t = (s[1] << 9) & MASK32
        s[2] ^= s[0]
        s[3] ^= s[1]
        s[1] ^= s[2]
        s[0] ^= s[3]
        s[2] ^= t
        s[3] = _rotl(s[3], 11)
        return result


class SimRngReferenceTest(unittest.TestCase):
    def test_seed_42(self):
        rng = SimRng(42)
        self.assertEqual([rng.next_u32() for _ in range(5)],
                         [2837322924, 544945897, 479756282, 3500138142, 339756180])

    def test_negative_seed(self):
        rng = SimRng(-7)
        self.assertEqual([rng.next_u32() for _ in range(5)],
                         [3284082876, 773369603, 510957795, 479553271, 2737896550])


if __name__ == "__main__":
    unittest.main()
