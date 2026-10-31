package ru.velopodmoskovye.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import ru.velopodmoskovye.ui.common.TitleAwardDialog
import ru.velopodmoskovye.ui.edit.PointEditorScreen
import ru.velopodmoskovye.ui.edit.PointEditorViewModel
import ru.velopodmoskovye.ui.edit.ReorderScreen
import ru.velopodmoskovye.ui.map.MapScreen
import ru.velopodmoskovye.ui.place.PlaceScreen
import ru.velopodmoskovye.ui.route.ActiveRouteScreen
import ru.velopodmoskovye.ui.settings.SettingsScreen
import ru.velopodmoskovye.ui.spiral.SpiralScreen
import ru.velopodmoskovye.ui.stop.StopScreen
import ru.velopodmoskovye.ui.titles.TitlesScreen

object Routes {
    const val SPIRAL = "spiral"
    const val MAP = "map"
    const val TITLES = "titles"
    const val SETTINGS = "settings"
    const val PLACE = "place/{id}"
    const val ACTIVE = "active/{id}"
    const val STOP = "stop/{destId}/{stopId}"
    const val EDIT = "edit/{destId}/{stopId}"
    const val ORDER = "order/{destId}"

    fun place(id: String) = "place/$id"
    fun active(id: String) = "active/$id"
    fun stop(destId: String, stopId: String) = "stop/$destId/$stopId"
    /** stopId: id точки, "start", "end" или "new" — новая своя точка. */
    fun edit(destId: String, stopId: String) = "edit/$destId/$stopId"
    fun order(destId: String) = "order/$destId"
    /** Создание своего места. */
    val NEW_PLACE = edit(PointEditorViewModel.NEW_PLACE, "new")
}

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    Tab(Routes.SPIRAL, "Спираль", Icons.Filled.Timeline),
    Tab(Routes.MAP, "Карта", Icons.Filled.Map),
    Tab(Routes.TITLES, "Звания", Icons.Filled.EmojiEvents),
    Tab(Routes.SETTINGS, "Настройки", Icons.Filled.Settings),
)

@Composable
fun AppRoot(appViewModel: AppViewModel) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val current = backStack?.destination?.route
    val award by appViewModel.pendingAward.collectAsStateWithLifecycle()
    val settings by appViewModel.settings.collectAsStateWithLifecycle()

    Scaffold(
        bottomBar = {
            if (tabs.any { it.route == current }) {
                NavigationBar {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = current == tab.route,
                            onClick = { nav.switchTab(tab.route) },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = Routes.SPIRAL, modifier = Modifier.padding(padding)) {
            composable(Routes.SPIRAL) {
                SpiralScreen(
                    onOpenPlace = { nav.navigate(Routes.place(it)) },
                    onOpenActive = { nav.navigate(Routes.active(it)) },
                    onOpenStop = { d, s -> nav.navigate(Routes.stop(d, s)) },
                    onAddPlace = { nav.navigate(Routes.NEW_PLACE) },
                )
            }
            composable(Routes.MAP) { MapScreen(onOpenPlace = { nav.navigate(Routes.place(it)) }) }
            composable(Routes.TITLES) { TitlesScreen() }
            composable(Routes.SETTINGS) { SettingsScreen() }
            composable(Routes.PLACE, arguments = listOf(navArgument("id") { type = NavType.StringType })) {
                PlaceScreen(
                    onBack = { nav.popBackStack() },
                    onOpenStop = { d, s -> nav.navigate(Routes.stop(d, s)) },
                    onStartRoute = { nav.navigate(Routes.active(it)) },
                    onEditPoint = { d, s -> nav.navigate(Routes.edit(d, s)) },
                    onReorder = { nav.navigate(Routes.order(it)) },
                )
            }
            composable(Routes.ACTIVE, arguments = listOf(navArgument("id") { type = NavType.StringType })) {
                ActiveRouteScreen(
                    onBack = { nav.popBackStack() },
                    onOpenStop = { d, s -> nav.navigate(Routes.stop(d, s)) },
                )
            }
            composable(
                Routes.STOP,
                arguments = listOf(
                    navArgument("destId") { type = NavType.StringType },
                    navArgument("stopId") { type = NavType.StringType },
                ),
            ) { StopScreen(onBack = { nav.popBackStack() }, onEdit = { d, s -> nav.navigate(Routes.edit(d, s)) }) }
            composable(
                Routes.EDIT,
                arguments = listOf(
                    navArgument("destId") { type = NavType.StringType },
                    navArgument("stopId") { type = NavType.StringType },
                ),
            ) {
                PointEditorScreen(
                    onBack = { nav.popBackStack() },
                    onPlaceCreated = { id ->
                        nav.popBackStack()
                        nav.navigate(Routes.place(id))
                    },
                )
            }
            composable(Routes.ORDER, arguments = listOf(navArgument("destId") { type = NavType.StringType })) {
                ReorderScreen(onBack = { nav.popBackStack() })
            }
        }
    }

    award?.let { a -> TitleAwardDialog(a, pairMode = settings.pairMode, onDismiss = { appViewModel.dismissAward(a.id) }) }
}

private fun NavHostController.switchTab(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
