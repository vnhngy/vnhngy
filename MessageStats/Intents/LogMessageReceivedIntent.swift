import AppIntents

/// Runs from a Shortcuts personal automation ("When I receive a message")
/// to silently log one received message. `openAppWhenRun = false` lets it
/// execute in the background without bringing the app to the foreground.
struct LogMessageReceivedIntent: AppIntent {
    static var title: LocalizedStringResource = "Nachricht protokollieren"
    static var description = IntentDescription(
        "Zählt eine erhaltene Nachricht für Message Stats. In einer Kurzbefehle-Automation „Wenn ich eine Nachricht erhalte“ verwenden."
    )
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Absender")
    var sender: String?

    func perform() async throws -> some IntentResult {
        MessageStore.logMessage(sender: sender)
        return .result()
    }
}

struct MessageStatsShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogMessageReceivedIntent(),
            phrases: [
                "Nachricht protokollieren in \(.applicationName)",
                "Log message in \(.applicationName)"
            ],
            shortTitle: "Nachricht protokollieren",
            systemImageName: "message.badge"
        )
    }
}
