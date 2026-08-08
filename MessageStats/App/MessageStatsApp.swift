import SwiftUI

@main
struct MessageStatsApp: App {
    private let container = MessageStore.makeContainer()

    var body: some Scene {
        WindowGroup {
            RootTabView()
        }
        .modelContainer(container)
    }
}
