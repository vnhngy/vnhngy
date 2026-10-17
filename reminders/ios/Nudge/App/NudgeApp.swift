import SwiftData
import SwiftUI

@main
struct NudgeApp: App {
    private let container: ModelContainer
    @State private var focus: FocusTimer

    init() {
        let c: ModelContainer
        do {
            c = try ModelContainer(for: ReminderList.self, Reminder.self, Completion.self, FocusSession.self)
        } catch {
            fatalError("Could not open the reminders database: \(error)")
        }
        container = c
        NotificationManager.shared.configure(container: c)
        _focus = State(initialValue: FocusTimer(container: c))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(focus)
        }
        .modelContainer(container)
    }
}

enum AppTab: Hashable {
    case today, upcoming, lists, stats, search
}

struct RootView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.scenePhase) private var scenePhase
    @Query private var reminders: [Reminder]
    @State private var tab: AppTab = .today

    var body: some View {
        TabView(selection: $tab) {
            Tab("Today", systemImage: "sun.max.fill", value: AppTab.today) {
                NavigationStack { TodayView() }
            }
            Tab("Upcoming", systemImage: "calendar", value: AppTab.upcoming) {
                NavigationStack { UpcomingView() }
            }
            Tab("Lists", systemImage: "list.bullet", value: AppTab.lists) {
                NavigationStack { ListsView() }
            }
            Tab("Stats", systemImage: "chart.bar.fill", value: AppTab.stats) {
                NavigationStack { StatsView() }
            }
            Tab(value: AppTab.search, role: .search) {
                NavigationStack { SearchView() }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .tabViewBottomAccessory {
            NowAccessory()
        }
        .task {
            ReminderActions.seedIfNeeded(context: context)
            ReminderActions.purgeOldTrash(context: context)
            await NotificationManager.shared.requestAuthorization()
            await NotificationManager.shared.rescheduleAll(reminders)
            ReminderActions.refreshBadge(context)
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task {
                await NotificationManager.shared.rescheduleAll(reminders)
                ReminderActions.refreshBadge(context)
            }
        }
    }
}
