extends SceneTree
## AI-vs-AI matches without rendering, for quick balance checks.
##
##   godot --headless --path game -s res://src/tools/headless_match.gd -- [games] [map_id] [first_seed]
##
## Prints one CSV row per game: seed, winner, victory, days. The full balance
## tool with landmark statistics arrives in phase 5 (spec 7).

const MAX_DAYS: int = 200


func _init() -> void:
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var games: int = int(args[0]) if args.size() > 0 else 10
	var map_id: String = args[1] if args.size() > 1 else "ghent"
	var first_seed: int = int(args[2]) if args.size() > 2 else 1
	var rules := GameRules.load_default()
	var pack := MapPack.load_from_dir("res://data/maps/%s" % map_id)
	if not pack.is_valid():
		printerr("invalid pack: %s" % [pack.errors])
		quit(1)
		return
	print("seed,winner,victory,days,ms")
	for i in games:
		var seed_value: int = first_seed + i
		var factions: Array = []
		for fid: String in pack.starts:
			factions.append({"id": fid, "controller": "ai", "difficulty": "normal"})
		var t0: int = Time.get_ticks_msec()
		var g := Game.create(rules, pack, {"seed": seed_value, "factions": factions})
		while not g.is_over() and int(g.state.day) <= MAX_DAYS:
			SimpleAi.play_turn(g)
			g.end_turn()
		print("%d,%s,%s,%d,%d" % [seed_value, g.state.winner, g.state.victory, int(g.state.day), Time.get_ticks_msec() - t0])
	quit(0)
