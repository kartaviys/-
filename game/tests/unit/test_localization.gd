extends GutTest


func after_each() -> void:
	TranslationServer.set_locale("en")


func test_title_is_translated_in_both_locales() -> void:
	TranslationServer.set_locale("en")
	assert_eq(tr("GAME_TITLE"), "Tower War")
	TranslationServer.set_locale("ru")
	assert_eq(tr("GAME_TITLE"), "Война Башен")


func test_ghent_strings_are_registered() -> void:
	TranslationServer.set_locale("ru")
	assert_eq(tr("MAP_GHENT"), "Гент")
